// ---------------------------------------------------------------------------
// Header → part-sheet propagation.
//
// The legacy workbook asks for the same geometry three or four times. Here the
// equipment header (orientation, ID, T/T length, shell thickness, MOC and the
// EN 10204 inspection class) is the single source of truth and everything the
// sheet can work out for itself is filled automatically. Anything the estimator
// types into a part row afterwards simply overrides the derived value until the
// header changes again — then the derived value is refreshed.
// ---------------------------------------------------------------------------

import { headThickness, shellCircumferential, shellLongitudinal } from "./asme";
import {
  HEAD_TYPES,
  allowableStress,
  materialByName,
  pipeOd,
  pipeWall,
} from "./catalog";
import { defaultRow } from "./parts";
import type { Equipment, PartRow } from "./types";

const num = (v: string | undefined, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : fallback;
};

const round5 = (v: number) => Math.ceil(v * 2) / 2;

/** flange class from design pressure (kPa g) at ambient — B16.5 screening */
function ratingFor(pressureKpa: number): string {
  const p = pressureKpa / 1000;
  if (p <= 1.96) return "150#";
  if (p <= 5.11) return "300#";
  if (p <= 10.21) return "600#";
  if (p <= 15.3) return "900#";
  if (p <= 25.5) return "1500#";
  return "2500#";
}

/** keep the higher of the pressure-derived class and the class already on the row
 *  (datasheets state 300#/600# explicitly — never downgrade an extracted rating) */
function higherRating(a: string, b: string): string {
  const n = (r: string) => Number(String(r).replace(/[^0-9]/g, "")) || 150;
  return n(b) > n(a) ? b : a;
}

/** Category keyed to opening size (ISRS / ASME VIII-1 style A/B/C/D) */
function categoryFor(nps: string): string {
  const od = pipeOd(nps);
  if (od >= 200) return "A";
  if (od >= 80) return "B";
  return "C";
}

function projectionFor(nps: string): number {
  const od = pipeOd(nps);
  if (od <= 60) return 120;
  if (od <= 170) return 150;
  if (od <= 330) return 200;
  return 250;
}

/** related specifications for the same material in other product forms */
function familyOf(plateMat: string) {
  const m = materialByName(plateMat);
  const name = m.name + " " + m.spec;
  const ss316 = /316/.test(name);
  const ss304 = /304|321/.test(name);
  const alloy = /387|P11|11 Cl|1\.25Cr/.test(name);
  const lowTemp = /203|LF2|333|Low temp/i.test(name);
  if (ss316) return { plate: "SA-240 Gr.316L", pipe: "SA-312 TP316L", forge: "SA-182 F316", ss: true };
  if (ss304) return { plate: "SA-240 Gr.304", pipe: "SA-312 TP304L", forge: "SA-182 F304", ss: true };
  if (alloy) return { plate: "SA-387 Gr.11 Cl.2", pipe: "SA-335 P11", forge: "SA-182 F11", ss: false };
  if (lowTemp) return { plate: "SA-203 Gr.E", pipe: "SA-333 Gr.6", forge: "SA-350 LF2", ss: false };
  return { plate: "SA-516 Gr.70", pipe: "SA-106 Gr.B", forge: "SA-105", ss: false };
}

const headTypeOf = (t: string): string => {
  const found = HEAD_TYPES.find((h) => h.toLowerCase().startsWith(t.slice(0, 6).toLowerCase()));
  if (found) return found;
  if (/ellip/i.test(t)) return "2:1 Ellipsoidal";
  if (/torisph|f&d/i.test(t)) return "Torispherical (F&D)";
  if (/hemi/i.test(t)) return "Hemispherical";
  if (/flat/i.test(t)) return "Flat (UG-34)";
  if (/con/i.test(t)) return "Conical";
  return "2:1 Ellipsoidal";
};

const isVertical = (eq: Equipment) => /vert/i.test(eq.orientation);

const isExchanger = (eq: Equipment) => /exchanger/i.test(eq.type);
const isSeparator = (eq: Equipment) => /separator|knock|drum|ko/i.test(eq.type);

export interface DerivedInfo {
  shellRequired: number;
  headRequired: number;
  S: number;
  headClause: string;
  massEstimate: number;
}

/** Code thicknesses implied by the header — shown next to the header fields. */
export function derivedInfo(eq: Equipment): DerivedInfo {
  const mat = materialByName(eq.parts.shell?.[0]?.sh_mat || "SA-516 Gr.70");
  const S = allowableStress(mat, eq.designTemperature);
  const circ = shellCircumferential(
    eq.designPressure / 1000,
    eq.diameter,
    S,
    eq.jointEfficiency,
    eq.corrosionAllowance,
  );
  const long = shellLongitudinal(
    eq.designPressure / 1000,
    eq.diameter,
    S,
    eq.jointEfficiency,
    eq.corrosionAllowance,
  );
  const shellRequired = Math.max(circ.required, long.required);
  const head = headThickness(
    headTypeOf(eq.headType),
    eq.designPressure / 1000,
    eq.diameter,
    S,
    eq.jointEfficiency,
    eq.corrosionAllowance,
  );
  const massEstimate =
    Math.PI * (eq.diameter + eq.shellThk) * eq.shellThk * eq.ttLength * 7.85e-6 +
    2 * 1.1 * (Math.PI / 4) * eq.diameter * eq.diameter * eq.shellThk * 7.85e-6;
  return {
    shellRequired,
    headRequired: head.required,
    S,
    headClause: head.clause,
    massEstimate,
  };
}

/**
 * Rebuild every part family from the header. Row counts and any field that is
 * not derived from the header (cladding, stiffener detail, davit, pad choice on
 * manways …) are preserved.
 */
export function deriveParts(eq: Equipment): Record<string, PartRow[]> {
  const D = eq.diameter || num(eq.parts.shell?.[0]?.sh_id, 1500);
  const L = eq.ttLength || num(eq.parts.shell?.[0]?.sh_len, 3000);
  const t = eq.shellThk || num(eq.parts.shell?.[0]?.sh_thk, 12);
  const P = eq.designPressure;
  const fam = familyOf(eq.parts.shell?.[0]?.sh_mat || "SA-516 Gr.70");
  const info = derivedInfo({ ...eq, diameter: D, ttLength: L, shellThk: t });
  const rating = ratingFor(P);
  const vertical = isVertical(eq);
  const cold = eq.mdmt <= -29;
  const boltMat = cold ? "SA-320 L7" : fam.ss ? "SA-193 B8" : "SA-193 B7";
  const nutMat = cold ? "SA-194 4" : fam.ss ? "SA-194 8" : "SA-194 2H";
  const headType = headTypeOf(eq.headType);
  const nominal = Math.max(round5(t), round5(info.shellRequired));
  const headNominal = Math.max(round5(t), round5(info.headRequired));
  const parts: Record<string, PartRow[]> = { ...eq.parts };

  // ------------------------------------------------------------------ shell
  const shellRows = eq.parts.shell?.length ? eq.parts.shell : [defaultRow("shell")];
  const segLen = shellRows.length > 1 ? Math.round(L / shellRows.length) : L;
  parts.shell = shellRows.map((r, i) => ({
    ...r,
    sh_id: String(D),
    sh_thk: String(nominal),
    sh_len: String(i === shellRows.length - 1 ? L - segLen * (shellRows.length - 1) : segLen),
    sh_mat: fam.plate,
    sh_stiff: L > 6000 ? "Yes" : r.sh_stiff || "No",
    sh_stiffW: r.sh_stiffW || "120",
    sh_stiffThk: r.sh_stiffThk || String(Math.max(8, Math.round(t * 0.75))),
    sh_stiffQty: r.sh_stiffQty || String(Math.max(1, Math.round(L / 3000))),
  }));

  // ------------------------------------------------------------------- head
  const headRows = eq.parts.head?.length ? eq.parts.head : [defaultRow("head"), defaultRow("head")];
  parts.head = headRows.map((r) => ({
    ...r,
    hd_id: String(D),
    hd_type: headType,
    hd_mat: fam.plate,
    hd_nomThk: String(headNominal),
    hd_minThk: String(round5(info.headRequired)),
  }));

  // ----------------------------------------------------------------- nozzle
  parts.nozzle = (eq.parts.nozzle ?? []).map((r) => {
    const size = r.nz_size || '4"';
    const sch = r.nz_sch || "40";
    const od = pipeOd(size);
    const wall = pipeWall(size, sch);
    const padNeeded = P > 500 || od >= 200;
    const padOd = Math.round((od + 2 * Math.max(50, 2 * nominal)) / 10) * 10;
    return {
      ...r,
      nz_size: size,
      nz_sch: sch,
      nz_pipeThk: wall ? wall.toFixed(2) : r.nz_pipeThk || "",
      nz_rating: higherRating(rating, r.nz_rating || rating),
      nz_face: r.nz_face || "RF",
      nz_type: r.nz_type || "Pipe",
      nz_cat: categoryFor(size),
      nz_length: String(projectionFor(size)),
      nz_pipeMat: fam.pipe,
      nz_flgMat: fam.forge,
      nz_blindMat: fam.forge,
      nz_padMat: fam.plate,
      // material sub-block fields are prefixed noz_ (1.3.8.x), not nz_
      noz_boltMat: boltMat,
      noz_nutMat: nutMat,
      noz_washerMat: "F436 Hardened",
      nz_gskMat: fam.ss ? "SS316L + PTFE" : "SS316L + Graphite",
      nz_pad: padNeeded ? "Yes" : r.nz_pad || "No",
      nz_padThk: padNeeded ? String(nominal) : r.nz_padThk || "",
      nz_padId: padNeeded ? String(od) : r.nz_padId || "",
      nz_padOd: padNeeded ? String(padOd) : r.nz_padOd || "",
      nz_bolt: r.nz_bolt || "Yes",
      nz_boltType: r.nz_boltType || "UNC",
      nz_boltSpare: r.nz_boltSpare || "10",
      nz_gsk: r.nz_gsk || "Yes",
      nz_gskType: r.nz_gskType || "Spiral Wound",
      nz_gskThk: r.nz_gskThk || "4.5",
      nz_gskSpare: r.nz_gskSpare || "10",
    };
  });

  // ----------------------------------------------------------------- manway
  parts.manway = (eq.parts.manway ?? []).map((r) => ({
    ...r,
    mw_size: D >= 1800 ? '24"' : '20"',
    mw_rating: higherRating(rating, r.mw_rating || rating),
    mw_mat: fam.forge,
    mw_bolt: r.mw_bolt || "Yes",
    mw_boltType: r.mw_boltType || "UNC",
    mw_boltSpare: r.mw_boltSpare || "10",
    mw_gsk: r.mw_gsk || "Yes",
    mw_gskType: r.mw_gskType || "Spiral Wound",
    mw_gskThk: r.mw_gskThk || "4.5",
    mw_gskMat: fam.ss ? "SS316L + PTFE" : "SS316L + Graphite",
    mw_gskSpare: r.mw_gskSpare || "10",
  }));

  // ---------------------------------------------------------------- support
  parts.support = (eq.parts.support ?? [defaultRow("support")]).map((r) => ({
    ...r,
    su_skirt: vertical ? "Yes" : "No",
    su_skirtH: vertical ? String(Math.max(1000, Math.round((L * 0.15) / 100) * 100)) : "",
    su_skirtThk: vertical ? String(Math.max(8, Math.round(t * 0.75))) : "",
    su_saddle: vertical ? "No" : "Yes",
    su_saddleQty: vertical ? "" : "2",
    su_saddleH: vertical ? "" : String(Math.max(500, Math.round((D / 2 - 100) / 50) * 50)),
    su_leg: vertical ? r.su_leg || "No" : "No",
  }));

  // ------------------------------------------------------ ladders / platform
  parts.ladder = (eq.parts.ladder ?? [defaultRow("ladder")]).map((r) => ({
    ...r,
    ld_monkey: vertical ? String(L + 1200) : "0",
    ld_stairs: vertical && L > 12000 ? String(L) : "0",
  }));
  const platformArea = Math.round(((Math.PI / 4) * Math.pow(D / 1000, 2) * 1.15) * 10) / 10;
  parts.platform = (eq.parts.platform ?? [defaultRow("platform")]).map((r) => ({
    ...r,
    pf_area: String(Math.max(1.5, platformArea)),
  }));

  // ---------------------------------------------------------------- internals
  parts.rungs = (eq.parts.rungs ?? []).map((r) => ({
    ...r,
    rn_dia: "10",
    rn_len: String(Math.max(200, D - 50)),
    rn_mat: fam.plate,
    rn_qty: String(Math.max(1, Math.floor(L / 300))),
  }));
  parts.baffle = (eq.parts.baffle ?? []).map((r) => ({
    ...r,
    bf_thk: String(Math.max(6, Math.round(t * 0.5))),
    bf_mat: fam.plate,
    bf_qty: r.bf_qty || (isExchanger(eq) ? "18" : "1"),
  }));
  parts.demister = (eq.parts.demister ?? []).map((r) => ({
    ...r,
    dm_thk: "150",
    dm_dia: String(Math.max(300, D - 40)),
    dm_mat: "SA-240 Gr.304",
  }));
  parts.coalescer = (eq.parts.coalescer ?? []).map((r) => ({
    ...r,
    co_thk: "100",
    co_dia: String(Math.max(300, D - 100)),
  }));
  parts.vortex = (eq.parts.vortex ?? []).map((r) => ({
    ...r,
    vx_dia: r.vx_dia || eq.parts.nozzle?.[0]?.nz_size || '6"',
    vx_thk: String(Math.max(6, Math.round(t * 0.5))),
    vx_h: "300",
  }));
  parts.boot = (eq.parts.boot ?? []).map((r) => ({
    ...r,
    bt_cap: r.bt_cap || "Ellipsoidal",
    bt_size: isSeparator(eq) ? (D >= 1200 ? '8"' : '6"') : r.bt_size || '6"',
    bt_sch: r.bt_sch || "40",
    bt_mat: fam.pipe,
    bt_pad: r.bt_pad || "No",
  }));
  parts.skirtOpening = (eq.parts.skirtOpening ?? []).map((r) => ({
    ...r,
    so_size: vertical ? (D >= 1800 ? '20"' : '18"') : r.so_size || '18"',
    so_sch: "STD",
    so_mat: fam.pipe,
  }));

  return parts;
}

/** Header-derived design flags: inspection class drives RT / joint efficiency. */
function withHeaderFlags(eq: Equipment): Equipment {
  const full = eq.inspection === "3.2";
  const fam = familyOf(eq.parts.shell?.[0]?.sh_mat || "SA-516 Gr.70");
  const thickness = eq.shellThk || num(eq.parts.shell?.[0]?.sh_thk, 12);
  const pwhtNeeded = (fam.ss && thickness >= 12) || (!fam.ss && thickness > 38);
  return {
    ...eq,
    radiography: full ? "Full RT" : "Spot RT",
    jointEfficiency: full ? 1 : 0.85,
    pWHT: pwhtNeeded ? "Yes" : eq.pWHT,
  };
}

/** Full header → sheet refresh. Returns a new equipment object. */
export function applyHeaderDefaults(eq: Equipment): Equipment {
  const flagged = withHeaderFlags(eq);
  return { ...flagged, parts: deriveParts(flagged) };
}

/** Short human summary of what the header filled in, for the step-3 panel. */
export function defaultsSummary(eq: Equipment): string[] {
  const D = eq.diameter || 0;
  const L = eq.ttLength || 0;
  const t = eq.shellThk || 0;
  const fam = familyOf(eq.parts.shell?.[0]?.sh_mat || "SA-516 Gr.70");
  return [
    `Shell ${D} ID × ${L} T/T × ${t} mm — ${eq.parts.shell?.length ?? 0} segment(s)`,
    `Heads ${eq.parts.head?.length ?? 0} no · ${headTypeOf(eq.headType)} × ${t} mm (${fam.plate})`,
    `Nozzles ${eq.parts.nozzle?.length ?? 0} no — size kept, rating ${ratingFor(eq.designPressure)}, necks per schedule`,
    `Flanges / manways — ${fam.forge} forgings, bolting ${eq.mdmt <= -29 ? "SA-320 L7 / SA-194 4" : "SA-193 B7 / SA-194 2H"}`,
    `Supports — ${isVertical(eq) ? "skirt" : "saddles"}, ${isVertical(eq) ? "ladder + platform" : "no ladder"}`,
    `Inspection ${eq.inspection} — ${eq.inspection === "3.2" ? "Full RT, E = 1.00" : "Spot RT, E = 0.85"}, PWHT ${eq.pWHT}`,
  ];
}
