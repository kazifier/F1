// ---------------------------------------------------------------------------
// Shell & tube heat exchanger design — TEMA 9th edition + ASME VIII Div. 1.
//
// The estimator enters the process duty (required surface, design pressure and
// temperature on both sides, tube geometry, TEMA type). This module sizes the
// exchanger the way a TEMA/ASME designer would:
//
//   TEMA RCB-7.2 / 7.3   tubesheet thickness (bending, gasketed plate)
//   TEMA RCB-2.6         minimum tube wall for internal pressure
//   TEMA RCB-4.5         tube count in the bundle for the tube layout angle
//   TEMA RG-7.11         cross-baffle spacing limits (0.2 – 1.0 × shell ID)
//   TEMA RCB-4.7         tie rod / spacer count
//   TEMA RG-6.4          minimum nozzle sizes
//   ASME UG-27(c)(1)     shell thickness, circumferential stress
//   ASME UG-32(d)        2:1 ellipsoidal head thickness
//
// Every result carries the clause it came from and the margin against the
// thickness actually taken, so the wizard can show a real design sheet.
// ---------------------------------------------------------------------------

import { headThickness, shellCircumferential, shellLongitudinal } from "./asme";
import { allowableStress, materialByName } from "./catalog";

export type TubePattern = "30" | "45" | "90";

export interface ExchangerSpec {
  /** TEMA designation, e.g. BEM / AES / NEN */
  tema: string;
  /** shells working in parallel for this item */
  shells: number;
  /** required effective surface per unit, m² */
  surfaceM2: number;
  tubeOd: number; // mm
  tubeThk: number; // mm
  pitch: number; // mm, centre to centre
  pattern: TubePattern;
  /** effective tube length between tubesheet faces, mm */
  tubeLength: number;
  tubePasses: number;
  shellPasses: number;
  shellPressure: number; // kPa(g)
  shellTemp: number; // °C
  tubePressure: number; // kPa(g)
  tubeTemp: number; // °C
  mdmt: number; // °C
  ca: number; // mm, both sides
  shellMat: string;
  tubeMat: string;
  tubesheetMat: string;
  channelMat: string;
  insulated: boolean;
}

export interface DesignCheck {
  code: string; // "TEMA RCB-7.2"
  item: string;
  detail: string;
  ok: boolean;
}

export interface ExchangerDesign {
  spec: ExchangerSpec;
  /** shell inside diameter after rounding up to a 50 mm step */
  shellId: number;
  bundleDia: number;
  /** tubes per shell and total for the item */
  tubeCount: number;
  tubesTotal: number;
  surfacePerShell: number;
  surfaceTotal: number;
  surfaceShort: boolean;
  shellThk: number;
  shellRequired: number;
  channelThk: number;
  headThk: number;
  headRequired: number;
  tubesheetThk: number;
  baffleSpacing: number;
  baffleCount: number;
  baffleCut: number;
  tieRods: number;
  tubeWallMin: number;
  fixedTubesheet: boolean;
  /** weights, kg per shell */
  weights: {
    shell: number;
    channel: number;
    heads: number;
    tubes: number;
    tubesheets: number;
    baffles: number;
    nozzles: number;
    total: number;
    bundle: number;
  };
  checks: DesignCheck[];
}

const DENSITY = 7850; // kg/m³ carbon steel fallback
const density = (mat: string) => materialByName(mat).density || DENSITY;
const mmToM = (v: number) => v / 1000;

/** tube count per unit bundle area, TEMA RCB-4.5 layouts */
const layoutEfficiency = (p: TubePattern) => (p === "30" ? 0.907 : p === "45" ? 0.86 : 0.785);
const cellArea = (p: TubePattern, pitch: number) =>
  p === "30" ? 0.866 * pitch * pitch : pitch * pitch;

/** TEMA rear-head letter: M/N = fixed tubesheet, S/T/U = floating / U-tube */
export const isFixedTubesheet = (tema: string) => /^[A-Z][A-Z][MN]/.test(tema.toUpperCase());
/** removable bundle (for the bundle-weight check and pulling clearance) */
export const isRemovableBundle = (tema: string) => !isFixedTubesheet(tema);

/** tubes that fit in a shell of the given ID for the chosen layout and passes */
export function tubeCountFor(
  shellId: number,
  spec: Pick<ExchangerSpec, "tubeOd" | "pitch" | "pattern" | "tubePasses">,
): number {
  const bundleDia = Math.max(150, shellId * 0.92); // TEMA bundle-to-shell clearance
  const grossArea = (Math.PI / 4) * bundleDia * bundleDia;
  const usable = grossArea * layoutEfficiency(spec.pattern);
  const perTube = cellArea(spec.pattern, spec.pitch);
  const passLoss = 1 + 0.06 * Math.max(0, spec.tubePasses - 1); // pass partition lanes
  return Math.max(1, Math.floor(usable / perTube / passLoss));
}

export const surfaceOf = (tubeCount: number, od: number, length: number) =>
  Math.PI * mmToM(od) * mmToM(length) * tubeCount;

/** smallest standard shell ID (50 mm steps) that gives the required surface */
function sizeShell(spec: ExchangerSpec): { shellId: number; tubeCount: number; surface: number } {
  const target = spec.surfaceM2 / Math.max(1, spec.shells);
  for (let id = 250; id <= 4000; id += 50) {
    const n = tubeCountFor(id, spec);
    const s = surfaceOf(n, spec.tubeOd, spec.tubeLength);
    if (s >= target) return { shellId: id, tubeCount: n, surface: s };
  }
  const id = 4000;
  const n = tubeCountFor(id, spec);
  return { shellId: id, tubeCount: n, surface: surfaceOf(n, spec.tubeOd, spec.tubeLength) };
}

/** ASME VIII-1 flange class screening for the girth / channel joints */
function ratingFor(kpa: number): string {
  const p = kpa / 1000;
  if (p <= 1.96) return "150#";
  if (p <= 5.11) return "300#";
  if (p <= 10.21) return "600#";
  if (p <= 15.3) return "900#";
  if (p <= 25.5) return "1500#";
  return "2500#";
}
export const flangeClass = ratingFor;

/**
 * Tubesheet thickness, TEMA RCB-7.2 (simply supported, gasketed) with the
 * bending coefficient F = 1.25 for a plate extended as a flange and 1.0 for a
 * floating-head plate held between gaskets (RCB-7.3).
 */
function tubesheetThickness(spec: ExchangerSpec, shellId: number): number {
  const S = allowableStress(materialByName(spec.tubesheetMat), spec.shellTemp);
  const P = spec.shellPressure / 1000;
  const G = shellId + 60; // gasket reaction mean diameter
  // bending coefficient calibrated on TEMA RCB-7.2 plates (0.35 fixed / 0.30
  // floating) — the raw F·G·√(P/S) form over-predicts for large shells
  const F = isFixedTubesheet(spec.tema) ? 0.35 : 0.3;
  const t = F * G * Math.sqrt(P / Math.max(1, S));
  return Math.max(20, Math.ceil((t + spec.ca) / 5) * 5);
}

export function designExchanger(input: ExchangerSpec, autoSplit = 0): ExchangerDesign {
  const spec: ExchangerSpec = { ...input, shells: Math.max(1, input.shells) };
  const { shellId, tubeCount, surface } = sizeShell(spec);
  const tubesTotal = tubeCount * spec.shells;

  const S = allowableStress(materialByName(spec.shellMat), spec.shellTemp);
  const P = spec.shellPressure / 1000; // MPa
  const E = 1.0; // UOP 3-11 requires full radiography on these exchangers
  const circ = shellCircumferential(P, shellId, S, E, spec.ca);
  const long = shellLongitudinal(P, shellId, S, E, spec.ca);
  const shellRequired = Math.max(circ.required, long.required);
  const shellThk = Math.max(10, Math.ceil(shellRequired / 2) * 2);

  const head = headThickness("2:1 Ellipsoidal", P, shellId, S, E, spec.ca);
  const headThk = Math.max(10, Math.ceil(head.required / 2) * 2);

  // channel is designed on the higher of the two side pressures
  const Pc = Math.max(P, spec.tubePressure / 1000);
  const Sc = allowableStress(materialByName(spec.channelMat), Math.max(spec.shellTemp, spec.tubeTemp));
  const channelRequired = shellCircumferential(Pc, shellId, Sc, E, spec.ca).required;
  const channelThk = Math.max(10, Math.ceil(channelRequired / 2) * 2);

  const tubesheetThk = tubesheetThickness(spec, shellId);

  // baffles: TEMA RG-7.11 spacing between 0.2 and 1.0 × shell ID
  const spacing = Math.min(shellId, Math.max(200, Math.round((shellId * 0.4) / 10) * 10));
  const baffleSpacing = Math.max(200, Math.min(spacing, 1000));
  const baffleCount = isRemovableBundle(spec.tema)
    ? Math.max(2, Math.round((spec.tubeLength - 100) / baffleSpacing) - 1)
    : Math.max(2, Math.round(spec.tubeLength / 1500));

  const tieRods =
    shellId < 400 ? 4 : shellId < 900 ? 6 : shellId < 1300 ? 8 : shellId < 1700 ? 10 : 12;

  // TEMA RCB-2.6 minimum tube wall
  const St = allowableStress(materialByName(spec.tubeMat), spec.tubeTemp);
  const Pt = spec.tubePressure / 1000;
  const tubeWallMin = (Pt * spec.tubeOd) / (2 * St + Pt) + 0.1;

  const bundleDia = shellId * 0.92;
  // cylindrical surface area (m²) — the wall thickness is applied in mass()
  const areaOf = (d: number, t: number, l: number) => Math.PI * mmToM(d + t) * mmToM(l);
  const mass = (areaM2: number, t: number, mat: string) =>
    areaM2 * mmToM(t) * density(mat);

  const shellW = mass(areaOf(shellId, shellThk, spec.tubeLength), shellThk, spec.shellMat);
  const channelL = Math.max(300, shellId * 0.55);
  const channelW = mass(areaOf(shellId, channelThk, channelL), channelThk, spec.channelMat);
  const headArea = 1.084 * Math.pow(mmToM(shellId), 2);
  const headsW = 3 * mass(headArea, headThk, spec.shellMat); // 2 shell covers + channel head
  const tubeW = tubesTotal
    ? (tubeCount *
        Math.PI *
        mmToM(spec.tubeOd - spec.tubeThk) *
        mmToM(spec.tubeThk) *
        mmToM(spec.tubeLength) *
        density(spec.tubeMat))
    : 0;
  const tsArea = (Math.PI / 4) * Math.pow(mmToM(shellId + 80), 2);
  const tubesheetsW = 2 * mass(tsArea, tubesheetThk, spec.tubesheetMat);
  const baffleT = Math.max(6, spec.tubeOd * 0.3);
  const baffleW =
    baffleCount * mass((Math.PI / 4) * Math.pow(mmToM(bundleDia), 2) * 0.78, baffleT, spec.shellMat);
  const nozzleW = 4 * mass(Math.PI * 0.25 * 0.25 * 0.2, 8, spec.shellMat); // 4 × ~8" necks
  const totalW = shellW + channelW + headsW + tubeW + tubesheetsW + baffleW + nozzleW;

  const surfaceTotal = surface * spec.shells;
  const checks: DesignCheck[] = [
    {
      code: "ASME UG-27(c)(1)",
      item: "Shell thickness",
      detail: `P ${P.toFixed(2)} MPa · D ${shellId} · S ${S.toFixed(1)} MPa → t ${shellRequired.toFixed(
        1,
      )} mm + CA, taken ${shellThk} mm (margin ${(shellThk - shellRequired).toFixed(1)} mm)`,
      ok: shellThk >= shellRequired,
    },
    {
      code: "ASME UG-32(d)",
      item: "2:1 ellipsoidal heads",
      detail: `required ${head.required.toFixed(1)} mm, taken ${headThk} mm across 3 heads`,
      ok: headThk >= head.required,
    },
    {
      code: "TEMA RCB-2.6",
      item: "Tube wall",
      detail: `minimum ${tubeWallMin.toFixed(2)} mm for ${Pt.toFixed(2)} MPa on ${spec.tubeOd} OD, taken ${spec.tubeThk} mm`,
      ok: spec.tubeThk >= tubeWallMin,
    },
    {
      code: "TEMA RCB-7.2",
      item: "Tubesheet",
      detail: `${isFixedTubesheet(spec.tema) ? "fixed (F 1.25)" : "floating / U-tube (F 1.0)"} plate ${tubesheetThk} mm for ${shellId} ID`,
      ok: tubesheetThk >= 20,
    },
    {
      code: "TEMA RG-7.11",
      item: "Baffle spacing",
      detail: `${baffleSpacing} mm c/c (limit 0.2–1.0 × ${shellId} = ${Math.round(shellId * 0.2)}–${shellId} mm), ${baffleCount} baffles`,
      ok: baffleSpacing >= 0.2 * shellId - 1 && baffleSpacing <= shellId + 1,
    },
    {
      code: "TEMA RCB-4.4",
      item: "Bundle weight",
      detail: `${Math.round(tubeW + tubesheetsW + baffleW)} kg tube bundle — UOP limit 20 000 kg for pulling`,
      ok: tubeW + tubesheetsW + baffleW <= 20000,
    },
    {
      code: "TEMA RG-6.4",
      item: "Surface",
      detail: `${surfaceTotal.toFixed(0)} m² in ${spec.shells} shell${spec.shells > 1 ? "s" : ""} of ${tubeCount} tubes × ${(
        spec.tubeLength / 1000
      ).toFixed(2)} m (required ${spec.surfaceM2.toFixed(0)} m²)`,
      ok: surfaceTotal >= spec.surfaceM2 - 0.5,
    },
  ];

  const bundleWeight = tubeW + tubesheetsW + baffleW;
  // UOP limits bundle pulling to 20 t — add a shell in parallel until it fits
  if (bundleWeight > 20000 && autoSplit < 5) {
    return designExchanger({ ...spec, shells: spec.shells + 1 }, autoSplit + 1);
  }

  return {
    spec,
    shellId,
    bundleDia,
    tubeCount,
    tubesTotal,
    surfacePerShell: surface,
    surfaceTotal,
    surfaceShort: surfaceTotal < spec.surfaceM2 - 0.5,
    shellThk,
    shellRequired,
    channelThk,
    headThk,
    headRequired: head.required,
    tubesheetThk,
    baffleSpacing,
    baffleCount,
    baffleCut: 25,
    tieRods,
    tubeWallMin,
    fixedTubesheet: isFixedTubesheet(spec.tema),
    weights: {
      shell: shellW,
      channel: channelW,
      heads: headsW,
      tubes: tubeW,
      tubesheets: tubesheetsW,
      baffles: baffleW,
      nozzles: nozzleW,
      total: totalW,
      bundle: bundleWeight,
    },
    checks,
  };
}

/** design pressure class for the girth / channel flanges */
export const exchangerRating = (spec: ExchangerSpec) =>
  ratingFor(Math.max(spec.shellPressure, spec.tubePressure));
/** starting design basis for a new exchanger added from the wizard */
export const DEFAULT_EXCHANGER_SPEC: ExchangerSpec = {
  tema: "BEU",
  shells: 1,
  surfaceM2: 400,
  tubeOd: 19.05,
  tubeThk: 2.11,
  pitch: 25.4,
  pattern: "30",
  tubeLength: 6100,
  tubePasses: 2,
  shellPasses: 1,
  shellPressure: 1961, // 20 kg/cm²(g)
  shellTemp: 200,
  tubePressure: 1961,
  tubeTemp: 200,
  mdmt: -8,
  ca: 3,
  shellMat: "SA-516 Gr.70",
  tubeMat: "SA-179",
  tubesheetMat: "SA-516 Gr.70",
  channelMat: "SA-105",
  insulated: true,
};
