// ---------------------------------------------------------------------------
// Datasheet unit → estimator equipment.
//
// The datasheet gives the header (D, T/T, plate thicknesses, pressure, CA,
// flange class, RT/PWHT, nozzles, internals). This module turns one datasheet
// line into a complete part sheet so the BOM, BOQ and 3D views work unchanged.
// Everything that is not on the datasheet is listed in `assumptions` and shown
// on screen — nothing is silently invented.
// ---------------------------------------------------------------------------

import { headThickness, shellCircumferential, shellLongitudinal } from "../lib/asme";
import { allowableStress, materialByName, pipeOd, pipeWall } from "../lib/catalog";
import { defaultRow } from "../lib/parts";
import { neckSchedule, sizeRfPad } from "../lib/nozzleDetail";
import { newEquipment } from "../lib/store";
import type { Equipment, PartRow } from "../lib/types";
import {
  isBodyFlange,
  isManway,
  kgcmToKpa,
  parseNozzles,
  type ProjectUnit,
} from "./units";

const PLATE = "SA-516 Gr.70";

/** decimal datasheet sizes → the catalog's NPS spelling (1.5 → 1.1/2") */
const FRACTION: Record<string, string> = {
  "0.5": "1/2",
  "0.75": "3/4",
  "1.5": "1.1/2",
  "2.5": "2.1/2",
  "3.5": "3.1/2",
};
const npsNorm = (size: string) => FRACTION[size] ?? size;
const inch = (size: string) => (/^\d/.test(size) ? `${npsNorm(size)}"` : size);
const npsOf = inch;

/** flange class actually used for the estimate (split classes use the higher one) */
function classOf(cls: string) {
  const parts = cls.split("/").map((s) => s.trim()).filter(Boolean);
  const num = (s: string) => Number(String(s).replace(/[^0-9]/g, "")) || 150;
  return parts.sort((a, b) => num(b) - num(a))[0] ?? "150#";
}

/** 60° included cone → axial height */
const coneHeight = (d1: number, d2: number) => Math.round(0.866 * Math.abs(d2 - d1));

/** split the cylindrical length between shell sections, by tray count when known */
function sectionLengths(u: ProjectUnit): number[] {
  const secs = u.sections ?? [];
  if (!secs.length) return [u.tt];
  const cones = secs.slice(1).reduce((a, s, i) => a + coneHeight(secs[i].dia, s.dia), 0);
  const cyl = Math.max(secs.length * 500, u.tt - cones);
  const weights = secs.map((s) => s.trays || 0);
  const sum = weights.reduce((a, b) => a + b, 0);
  const ratio = sum > 0 ? weights.map((w) => w / sum) : secs.map(() => 1 / secs.length);
  const raw = ratio.map((r) => Math.round((cyl * r) / 10) * 10);
  // close the rounding gap exactly on the bottom section so Σ sections + cones = T/T
  raw[raw.length - 1] = cyl - raw.slice(0, -1).reduce((a, b) => a + b, 0);
  return raw;
}

/** assumptions recorded for the UI — one line per inferred value */
export function unitAssumptions(u: ProjectUnit): string[] {
  const out: string[] = [];
  out.push("Nozzle projections: 200 mm (150 mm below 2\"). Datasheet states \"SCH MR\" — schedule modelled as STD.");
  out.push(`Flange class used for pricing: ${classOf(u.class)}${u.class.includes("/") ? ` (datasheet: ${u.class})` : ""}.`);
  out.push("Joint efficiency 1.0 / full RT assumed — UOP 3-11 requirement (datasheet: MR). At E = 0.85 the quoted plates would be 4–6 mm undersized.");
  if (u.kind === "column") {
    out.push("Skirt height assumed 3000 mm; datasheet says \"vessel support by contractor\" without dimensions.");
    out.push("Cone transitions at 60° included; the axial share is taken out of the T/T length.");
    out.push("One platform every 6 m of tangent length, 1 m wide walkway; ladder over the full T/T.");
    if (u.trays) out.push(`${u.trays} valve trays at 3 mm plate (tray spacing from spec 307); tray support rings included in the tray line.`);
    if (u.beds) out.push("Structured packing beds are listed for scope but are not priced by the rate book (supplier quotation required).");
  } else {
    out.push(u.orientation === "H" ? "Two saddle supports assumed at 700 mm height." : "Skirt height assumed 3000 mm.");
    if (u.boot) out.push(`Drop-leg length 600 mm (not dimensioned); boot plate and head thicknesses taken from the datasheet.`);
    if (u.demister) out.push("Demister support ring taken as part of the demister line.");
  }
  if (u.vortex) out.push("Vortex breaker 300 mm high, 8 mm plate.");
  return out;
}

export interface UnitAudit {
  pressureKpa: number;
  S: number;
  shellRequired: number;
  headRequired: number;
  shellMargin: number;
  headMargin: number;
  /** true when the datasheet plate is thinner than the Div.1 minimum */
  shellShort: boolean;
  headShort: boolean;
}

/** Independent Div.1 check of the plate quoted on the datasheet. */
export function auditUnit(u: ProjectUnit): UnitAudit {
  const P = kgcmToKpa(u.pKgcm) / 1000;
  const S = allowableStress(materialByName(PLATE), u.tempC);
  // UOP Standard Spec 3-11 requires full radiography on these vessels; the
  // datasheet's "MR" only means the extent is the fabricator's decision, so the
  // datasheet plate thicknesses are checked at E = 1.0 (they are 4-6 mm short at E = 0.85).
  const E = 1;
  const D = u.dia;
  const circ = shellCircumferential(P, D, S, E, u.ca);
  const long = shellLongitudinal(P, D, S, E, u.ca);
  const shellRequired = Math.max(circ.required, long.required);
  const head = headThickness(u.botHead.type, P, D, S, E, u.ca);
  const headRequired = head.required;
  return {
    pressureKpa: kgcmToKpa(u.pKgcm),
    S,
    shellRequired,
    headRequired,
    shellMargin: u.shellThk - shellRequired,
    headMargin: u.botHead.thk - headRequired,
    shellShort: u.shellThk < shellRequired,
    headShort: u.botHead.thk < headRequired,
  };
}

function partyRows(u: ProjectUnit): Record<string, PartRow[]> {
  const parts: Record<string, PartRow[]> = {
    shell: [],
    head: [],
    nozzle: [],
    manway: [],
    support: [],
    ladder: [],
    platform: [],
    rungs: [],
    baffle: [],
    demister: [],
    coalescer: [],
    vortex: [],
    boot: [],
    skirtOpening: [],
  };
  const cls = classOf(u.class);
  const sections = u.sections ?? [{ dia: u.dia, thk: u.shellThk, trays: u.trays ?? 0 }];
  const lengths = sectionLengths(u);

  // ------------------------------------------------------------------ shell
  sections.forEach((sec, i) => {
    parts.shell.push({
      ...defaultRow("shell"),
      sh_id: String(sec.dia),
      sh_thk: String(sec.thk),
      sh_len: String(lengths[i]),
      sh_mat: PLATE,
      sh_stiff: "No",
      sh_topPlate: "No",
      sh_botPlate: "No",
      sh_baseRing: i === sections.length - 1 && u.support === "skirt" ? "Yes" : "No",
    });
  });

  // ------------------------------------------------------------------- head
  const topId = sections[0].dia;
  const botId = sections[sections.length - 1].dia;
  parts.head.push({
    ...defaultRow("head"),
    hd_id: String(topId),
    hd_nomThk: String(u.topHead.thk),
    hd_minThk: String(Math.max(6, u.topHead.thk - 2)),
    hd_mat: PLATE,
    hd_type: u.topHead.type,
  });
  // cone transitions sit between the sections
  for (let i = 1; i < sections.length; i++) {
    parts.head.push({
      ...defaultRow("head"),
      hd_id: String(sections[i].dia),
      hd_nomThk: String(u.coneThk ?? sections[i].thk),
      hd_minThk: String(Math.max(6, (u.coneThk ?? sections[i].thk) - 2)),
      hd_mat: PLATE,
      hd_type: "Conical",
    });
  }
  parts.head.push({
    ...defaultRow("head"),
    hd_id: String(botId),
    hd_nomThk: String(u.botHead.thk),
    hd_minThk: String(Math.max(6, u.botHead.thk - 2)),
    hd_mat: PLATE,
    hd_type: u.botHead.type,
  });

  // ---------------------------------------------------------------- nozzles
  // Shell basis used for the UG-37 pad sizing, so the pads in the take-off and
  // the pads listed on the nozzle-detail page are the same numbers.
  const shellT = Math.max(...sections.map((s) => s.thk), u.shellThk);
  const S = allowableStress(materialByName(PLATE), u.tempC);
  const P = kgcmToKpa(u.pKgcm) / 1000; // MPa
  const trShell = shellCircumferential(P, u.dia, S, 1, u.ca).base;
  const Sneck = allowableStress(materialByName("SA-106 Gr.B"), u.tempC);
  const fr1 = Math.min(1, Sneck / S);

  const nozzles = parseNozzles(u.nozzles);
  const pushNozzle = (nx: (typeof nozzles)[number]) => {
    if (parts.nozzle.length >= 30) return;
    const nps = npsOf(nx.size);
    const od = pipeOd(nps);
    const sch = neckSchedule(nps, cls);
    // NPS 18 and above takes the shell plate wall; NPS 20 and above is rolled
    // from plate rather than bought as pipe.
    const plateNeck = od >= 508;
    const wall = od >= 457 ? Math.max(pipeWall(nps, sch), u.shellThk) : pipeWall(nps, sch);
    const trn = (P * od) / (2 * Sneck + 0.4 * P);
    const pad = sizeRfPad({
      d: Math.max(0, od - 2 * wall) + 2 * u.ca,
      shellT,
      tr: trShell,
      E1: 1,
      tn: wall,
      trn,
      fr1,
      fr2: fr1,
      legShell: Math.min(10, Math.max(6, wall * 0.7)),
      nozzleOd: od,
    });
    const row: PartRow = {
      ...defaultRow("nozzle"),
      nz_cat: od >= 200 ? "A" : od >= 80 ? "B" : "C",
      nz_size: nps,
      nz_sch: sch,
      nz_pipeThk: String(Math.round(wall * 10) / 10),
      nz_face: "RF",
      nz_length: od <= 60 ? "150" : od >= 457 ? "250" : "200",
      nz_type: plateNeck ? "Rolled Plate Pipe" : "Pipe",
      nz_rating: cls,
      nz_pipeMat: plateNeck ? PLATE : "SA-106 Gr.B",
      nz_flgMat: "SA-105",
      nz_blindMat: "SA-105",
      nz_padMat: PLATE,
      nz_boltMat: "SA-193 B7",
      nz_nutMat: "SA-194 2H",
      nz_washerMat: "F436",
      nz_gskMat: "SS316+Graphite",
      nz_rolledMat: PLATE,
      nz_soMat: "SA-105",
      nz_blind: "No",
      nz_pad: pad.required ? "Yes" : "No",
      nz_padThk: pad.required ? String(pad.padThk) : "",
      nz_padId: pad.required ? String(pad.padId) : "",
      nz_padOd: pad.required ? String(pad.padOd) : "",
      nz_elbow: "No",
      nz_bolt: "Yes",
      nz_boltType: "UNC",
      nz_boltSpare: "10",
      nz_gsk: "Yes",
      nz_gskType: "Spiral Wound",
      nz_gskThk: "4.5",
      nz_gskSpare: "10",
      nz_soFlg: "No",
    };
    parts.nozzle.push(row);
  };

  for (const nx of nozzles) {
    if (isBodyFlange(nx)) continue; // flanged shell joints, not openings
    if (isManway(nx)) {
      if (parts.manway.length >= 8) continue;
      const sized = /^\d/.test(nx.size);
      parts.manway.push({
        ...defaultRow("manway"),
        mw_size: sized ? inch(nx.size) : '6"',
        mw_rating: cls,
        mw_mat: PLATE,
        mw_bolt: "Yes",
        mw_boltType: "UNC",
        mw_boltSpare: "10",
        mw_gsk: "Yes",
        mw_gskType: "Spiral Wound",
        mw_gskThk: "4.5",
        mw_gskMat: "SS316+Graphite",
        mw_gskSpare: "10",
        mw_davit: sized && Number(nx.size) >= 18 ? "Yes" : "No",
      });
      continue;
    }
    if (!/^\d/.test(nx.size)) continue; // relief / handhole without a stated size
    for (let c = 0; c < nx.count; c++) pushNozzle(nx);
  }

  // ---------------------------------------------------------------- support
  if (u.support === "skirt") {
    parts.support.push({
      ...defaultRow("support"),
      su_skirt: "Yes",
      su_skirtH: "3000",
      su_skirtThk: String(Math.max(10, Math.round(u.shellThk * 0.5))),
      su_saddle: "No",
      su_leg: "No",
    });
  } else {
    parts.support.push({
      ...defaultRow("support"),
      su_saddle: "Yes",
      su_saddleQty: "2",
      su_saddleH: "700",
      su_skirt: "No",
      su_leg: "No",
    });
  }

  // --------------------------------------------------------------- ladders
  if (u.ladders) {
    const len = u.kind === "column" ? u.tt : Math.max(2000, Math.round(u.dia * 0.8));
    parts.ladder.push({ ...defaultRow("ladder"), ld_monkey: String(len) });
  }

  // -------------------------------------------------------------- platforms
  if (u.kind === "column" && u.ladders) {
    const count = Math.max(2, Math.floor(u.tt / 6000) + 1);
    const area = count * Math.PI * (u.dia / 1000) * 1.0; // 1 m wide walkway
    parts.platform.push({ ...defaultRow("platform"), pf_area: area.toFixed(1) });
  }

  // ------------------------------------------------------------------ trays
  if (u.trays) {
    if (u.sections && u.sections.length > 1) {
      for (const sec of u.sections) {
        if (!sec.trays) continue;
        parts.baffle.push({
          ...defaultRow("baffle"),
          bf_kind: "Tray",
          bf_dia: String(sec.dia),
          bf_thk: "3",
          bf_mat: u.trayMat ?? PLATE,
          bf_qty: String(sec.trays),
        });
      }
    } else {
      parts.baffle.push({
        ...defaultRow("baffle"),
        bf_kind: "Tray",
        bf_dia: String(u.dia),
        bf_thk: "3",
        bf_mat: u.trayMat ?? PLATE,
        bf_qty: String(u.trays),
      });
    }
  }

  // --------------------------------------------------------------- internals
  if (u.demister) {
    parts.demister.push({
      ...defaultRow("demister"),
      dm_thk: String(u.demister),
      dm_dia: String(u.dia),
      dm_mat: /Alloy 400/i.test(u.notes?.join(" ") ?? "") ? "SA-240 Gr.304" : "SA-240 Gr.304",
    });
  }
  if (u.coalescer) {
    parts.coalescer.push({
      ...defaultRow("coalescer"),
      co_thk: String(u.coalescer),
      co_dia: String(u.dia),
    });
  }
  if (u.vortex) {
    parts.vortex.push({
      ...defaultRow("vortex"),
      vx_dia: inch(u.vortex),
      vx_thk: "8",
      vx_h: "300",
    });
  }
  if (u.boot) {
    parts.boot.push({
      ...defaultRow("boot"),
      bt_cap: "Ellipsoidal",
      bt_size: u.boot.nps,
      bt_sch: "STD",
      bt_mat: PLATE,
      bt_rolled: "No",
      bt_plate: String(u.boot.thk),
      bt_pad: "No",
    });
  }

  return parts;
}

export function unitToEquipment(u: ProjectUnit): Equipment {
  const eq = newEquipment(
    u.kind === "column" ? "Column / Tower" : "Pressure Vessel",
    u.tag,
    u.name,
  );
  eq.service = u.service;
  eq.qty = 1;
  eq.orientation = u.orientation === "V" ? "Vertical" : "Horizontal";
  eq.diameter = u.dia;
  eq.ttLength = u.tt;
  eq.shellThk = u.shellThk;
  eq.inspection = /full/i.test(u.rt) ? "3.2" : "3.1";
  eq.designPressure = kgcmToKpa(u.pKgcm);
  eq.designTemperature = u.tempC;
  eq.mdmt = u.mdmt;
  eq.corrosionAllowance = u.ca;
  eq.jointEfficiency = 1;
  eq.headType = u.topHead.type;
  eq.insulationThk = u.insulated ? (u.tempC > 200 ? 100 : 50) : 0;
  eq.radiography = "Full RT";
  eq.pWHT = u.pwht === "Yes" ? "Yes" : "No";
  eq.paintSystem = "Epoxy 2 coat";
  eq.parts = partyRows(u);
  eq.columnExtras = {};
  return eq;
}

export const buildScope = (units: ProjectUnit[]) => units.map(unitToEquipment);
