// ---------------------------------------------------------------------------
// Nozzle joint detailing
//
// One row per nozzle / manway mark, carrying the five bought-out groups the
// fabricator has to order: flange, pipe neck, RF pad, gasket and fasteners.
// Everything here is derived — the datasheet gives the mark, size, service and
// count; the rest comes from the ASME checks and the B16.5 / B36.10 tables.
// ---------------------------------------------------------------------------

import { areaReinforcement, shellCircumferential } from "./asme";
import { allowableStress, materialByName, pipeOd, pipeWall, studSpec } from "./catalog";
import { isBodyFlange, isManway, parseNozzles, type ProjectUnit } from "../data/units";
import type { Equipment, PartRow } from "./types";

export const SHELL_PLATE = "SA-516 Gr.70";
export const NECK_PIPE = "SA-106 Gr.B";
export const FLANGE_FORGING = "SA-105N";
export const PAD_PLATE = "SA-516 Gr.70";
export const STUD_MAT = "SA-193 B7";
export const NUT_MAT = "SA-194 2H";
export const GASKET_MAT = "316L / graphite";

const num = (row: PartRow | undefined, key: string): number => {
  const v = parseFloat(row?.[key] ?? "");
  return Number.isFinite(v) ? v : 0;
};
const str = (row: PartRow | undefined, key: string): string => (row?.[key] ?? "").toString().trim();
const npsNum = (nps: string) => parseFloat(nps.replace(/[^0-9.]/g, "")) || 0;

/** Standard plate thickness ladder used for RF pads. */
const PLATE_LADDER = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40];
const plateAtLeast = (t: number) => PLATE_LADDER.find((p) => p >= t) ?? 40;
const round5 = (v: number) => Math.round(v / 5) * 5;

/**
 * Recommended neck schedule — Sch 80 on small bore and Class 900+, Sch 40 up to
 * 6", STD (B36.10) above that. The datasheet only says "SCH MR", so the
 * schedule is a stated assumption rather than a datasheet value.
 */
export function neckSchedule(nps: string, rating: string): string {
  const cls = Number(String(rating).replace(/[^0-9]/g, "")) || 150;
  const n = npsNum(nps);
  if (cls >= 900) return "80";
  if (n <= 1.5) return "80";
  if (n <= 6) return "40";
  return "STD";
}

export type FlangeType = "WNRF" | "SW RF" | "BLRF";
export type JointKind = "Nozzle" | "Manway" | "Handhole" | "Body flange" | "Flanged head";

/**
 * Flange style by service: blind/cover flanges (BLRF) on manways, handholes,
 * body flanges and flanged heads; socket-weld raised face up to 1.5"; weld-neck
 * raised face for everything else.
 */
export function flangeTypeFor(kind: JointKind, nps: string): FlangeType {
  if (kind === "Manway" || kind === "Handhole" || kind === "Body flange" || kind === "Flanged head") return "BLRF";
  return npsNum(nps) <= 1.5 ? "SW RF" : "WNRF";
}

export interface PadResult {
  required: boolean;
  padId: number;
  padOd: number;
  padThk: number;
  radial: number;
  /** mm of pad width is enough; null when self-reinforced */
  note: string;
  A: number;
  available: number;
  deficit: number;
  adequate: boolean;
}

/**
 * Size an RF pad from the UG-37 area check: available area is computed for the
 * bare joint first; if that already covers A the joint is self-reinforced (SRN
 * — no pad), otherwise the pad thickness is taken at the shell plate and the
 * radial width is solved from A5 = 2·w·t_pad·0.9.
 */
export function sizeRfPad(i: {
  d: number;
  shellT: number;
  tr: number;
  E1: number;
  tn: number;
  trn: number;
  fr1: number;
  fr2: number;
  legShell: number;
  nozzleOd: number;
}): PadResult {
  const bare = areaReinforcement({
    d: i.d,
    shellT: i.shellT,
    tr: i.tr,
    E1: i.E1,
    F: 1,
    tn: i.tn,
    trn: i.trn,
    fr1: i.fr1,
    fr2: i.fr2,
    padWidth: 0,
    padThk: 0,
    legShell: i.legShell,
    legPad: 0,
  });
  if (bare.adequate) {
    return {
      required: false,
      padId: 0,
      padOd: 0,
      padThk: 0,
      radial: 0,
      note: "self-reinforced — no pad required",
      A: bare.A,
      available: bare.available,
      deficit: 0,
      adequate: true,
    };
  }
  const padThk = plateAtLeast(i.shellT);
  const radial = Math.max(25, round5(bare.deficit / (2 * 0.9 * padThk)));
  const padId = Math.round(i.nozzleOd);
  const padOd = round5(padId + 2 * radial);
  const withPad = areaReinforcement({
    d: i.d,
    shellT: i.shellT,
    tr: i.tr,
    E1: i.E1,
    F: 1,
    tn: i.tn,
    trn: i.trn,
    fr1: i.fr1,
    fr2: i.fr2,
    padWidth: (padOd - padId) / 2,
    padThk,
    legShell: i.legShell,
    legPad: 6,
  });
  return {
    required: true,
    padId,
    padOd,
    padThk,
    radial: (padOd - padId) / 2,
    note:
      radial > 300
        ? "pad wider than 300 mm — integral (thicker neck) reinforcement is the practical detail"
        : `A5 = 2 × ${((padOd - padId) / 2).toFixed(0)} × ${padThk} × 0.9`,
    A: withPad.A,
    available: withPad.available,
    deficit: withPad.deficit,
    adequate: withPad.adequate,
  };
}

export interface NozzleJoint {
  key: string;
  mark: string;
  service: string;
  size: string;
  qty: number;
  kind: JointKind;
  /** Standard = separate RF pad; SRN = self-reinforced neck, no pad */
  type: "Standard" | "SRN";
  flange: { type: FlangeType; size: string; rating: string; material: string; facing: string };
  neck: {
    size: string;
    length: number;
    schedule: string;
    material: string;
    wall: number;
    required: number;
    plateNeck: boolean;
  };
  pad: PadResult;
  gasket: { type: string; thk: number; size: string; rating: string; material: string };
  fasteners: { perJoint: number; dia: string; length: number; total: number; stud: string; nut: string; thread: string };
  ug37: { d: number; tr: number; trn: number; fr1: number; shellT: number; E: number };
}

export interface JointOptions {
  /** vessel has an internal lining → lined flange facing and lined pad */
  lined?: boolean;
}

function shellBasis(eq: Equipment) {
  const rows = eq.parts.shell ?? [];
  const tRows = rows.map((r) => num(r, "sh_thk")).filter((t) => t > 0);
  const shellT = tRows.length ? Math.max(...tRows) : eq.shellThk;
  const mat = str(rows[0], "sh_mat") || SHELL_PLATE;
  const S = allowableStress(materialByName(mat), eq.designTemperature);
  const P = eq.designPressure / 1000; // MPa
  const circ = shellCircumferential(P, eq.diameter, S, eq.jointEfficiency, eq.corrosionAllowance);
  return { shellT, mat, S, P, tr: circ.base, E: eq.jointEfficiency };
}

/** All nozzle / manway joints of one equipment, in datasheet mark order. */
export function nozzleJoints(eq: Equipment, unit?: ProjectUnit, opts: JointOptions = {}): NozzleJoint[] {
  const base = shellBasis(eq);
  const Sneck = allowableStress(materialByName(NECK_PIPE), eq.designTemperature);
  const fr1 = Math.min(1, Sneck / base.S);
  const ca = eq.corrosionAllowance;
  const lined = Boolean(opts.lined);
  const cls = str(eq.parts.nozzle?.[0], "nz_rating") || "150#";
  const out: NozzleJoint[] = [];

  const make = (
    mark: string,
    service: string,
    size: string,
    qty: number,
    kind: JointKind,
    tn: number,
    length: number,
    plateNeck: boolean,
  ): NozzleJoint => {
    const od = pipeOd(size) || npsNum(size) * 25.4 + 12;
    const ftype = flangeTypeFor(kind, size);
    const rating = ftype === "BLRF" && kind === "Manway" ? cls : cls;
    const ratingKey = rating.replace("#", "");
    const sch = neckSchedule(size, rating);
    const wall = tn > 0 ? tn : pipeWall(size, sch);
    const trn = (base.P * od) / (2 * Sneck + 0.4 * base.P);
    const d = Math.max(0, od - 2 * wall) + 2 * ca;
    const pad = sizeRfPad({
      d,
      shellT: base.shellT,
      tr: base.tr,
      E1: base.E,
      tn: wall,
      trn,
      fr1,
      fr2: fr1,
      legShell: Math.min(10, Math.max(6, wall * 0.7)),
      nozzleOd: od,
    });
    const manwayLike = ftype === "BLRF";
    const gskThk = manwayLike ? 6 : 4.5;
    const stud = studSpec(size, ratingKey, gskThk);
    const mat = ftype === "BLRF" ? (str(eq.parts.manway?.[0], "mw_mat") || FLANGE_FORGING) : FLANGE_FORGING;
    return {
      key: `${mark}-${size}`,
      mark,
      service,
      size,
      qty,
      kind,
      type: pad.required ? "Standard" : "SRN",
      flange: {
        type: ftype,
        size,
        rating,
        material: mat + (lined ? " (lined facing)" : ""),
        facing: lined ? "RF + lining facing" : "RF",
      },
      neck: {
        size,
        length,
        schedule: plateNeck ? "plate" : sch,
        material: plateNeck ? SHELL_PLATE : NECK_PIPE,
        wall,
        required: Math.max(trn + ca, plateNeck ? 8 : 0),
        plateNeck,
      },
      pad: lined
        ? { ...pad, note: `${pad.note} · pad lined` }
        : pad,
      gasket: {
        type: manwayLike ? "Spiral wound + inner ring" : "Spiral wound",
        thk: gskThk,
        size,
        rating,
        material: GASKET_MAT,
      },
      fasteners: {
        perJoint: stud?.count ?? 0,
        dia: stud ? `${stud.dia}"` : "—",
        length: stud?.length ?? 0,
        total: (stud?.count ?? 0) * qty,
        stud: STUD_MAT,
        nut: NUT_MAT,
        thread: stud?.thread ?? "",
      },
      ug37: { d, tr: base.tr, trn, fr1, shellT: base.shellT, E: base.E },
    };
  };

  if (unit) {
    for (const n of parseNozzles(unit.nozzles)) {
      if (isBodyFlange(n)) continue; // flanged shell joint, not an opening
      const numeric = /^\d/.test(n.size);
      const sized = n.size.split(/[x×]/)[0].trim();
      const nps = /^\d/.test(sized) ? `${sized.replace(/^(\d+)\.5$/, "$1.1/2").replace(/^(\d+)\.25$/, "$1/4")}"` : sized;
      const kind: JointKind = isManway(n)
        ? /handhole/i.test(n.service)
          ? "Handhole"
          : "Manway"
        : numeric
          ? "Nozzle"
          : /head/i.test(n.service)
            ? "Flanged head"
            : "Handhole";
      if (!/^\d/.test(sized) && !isManway(n)) {
        // opening without a dimension — listed in the register, not detailed
        continue;
      }
      const od = pipeOd(nps);
      const plateNeck = od >= 508; // NPS 20 and above: rolled plate neck
      const bigNeck = od >= 457; // NPS 18 and above: wall follows the shell plate
      const length = od <= 60 ? 150 : od >= 457 ? 250 : 200;
      const tn = bigNeck ? Math.max(pipeWall(nps, neckSchedule(nps, cls)), unit.shellThk) : 0;
      out.push(make(n.mark, n.service, nps, n.count, kind, tn, length, plateNeck));
    }
    return out;
  }

  // fallback: no datasheet unit attached — detail the part rows themselves
  (eq.parts.nozzle ?? []).forEach((row, i) => {
    const nps = str(row, "nz_size");
    if (!nps) return;
    const od = pipeOd(nps);
    out.push(
      make(
        `N${String(i + 1).padStart(2, "0")}`,
        "nozzle",
        nps,
        1,
        "Nozzle",
        num(row, "nz_pipeThk"),
        num(row, "nz_length") || 200,
        od >= 508,
      ),
    );
  });
  (eq.parts.manway ?? []).forEach((row, i) => {
    const nps = str(row, "mw_size");
    if (!nps) return;
    out.push(make(`M${String(i + 1).padStart(2, "0")}`, "manway", nps, 1, "Manway", 12, 250, false));
  });
  return out;
}

export const jointSummary = (rows: NozzleJoint[]) => ({
  joints: rows.reduce((a, r) => a + r.qty, 0),
  marks: rows.length,
  srn: rows.filter((r) => r.type === "SRN").reduce((a, r) => a + r.qty, 0),
  pads: rows.filter((r) => r.pad.required).reduce((a, r) => a + r.qty, 0),
  studs: rows.reduce((a, r) => a + r.fasteners.total, 0),
  gaskets: rows.reduce((a, r) => a + r.qty, 0),
});
