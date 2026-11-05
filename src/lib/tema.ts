// ---------------------------------------------------------------------------
// Shell & tube heat exchanger design — TEMA 9th edition + ASME VIII Div. 1.
//
// The estimator enters the process duty (required surface, design pressure and
// temperature on both sides, tube geometry, TEMA type). This module sizes the
// exchanger the way a TEMA/ASME designer would:
//
//   TEMA RCB-7.2 / 7.3   tubesheet thickness (bending, gasketed plate)
//   ASME UG-34(c)(2)     flat-plate cross-check on the same tubesheet
//   TEMA RCB-2.6         minimum tube wall for internal pressure
//   TEMA RCB-4.5         tube count in the bundle for the tube layout angle
//   TEMA RG-7.11         cross-baffle spacing limits (0.2 – 1.0 × shell ID)
//   TEMA RCB-4.7         tie rod / spacer count
//   TEMA RG-6.4          minimum nozzle sizes
//   ASME UG-27(c)(1)     shell thickness, circumferential stress
//   ASME UG-32(d)        2:1 ellipsoidal head thickness
//   ASME UG-99(b)        hydrostatic test pressure
//   ASME B16.5           flange class from the pressure–temperature rating
//   API 560              fired heater coil, casing and burner screening
//
// Every result carries the clause it came from and the margin against the
// thickness actually taken, so the wizard can show a real design sheet.
// ---------------------------------------------------------------------------

import { headThickness, shellCircumferential, shellLongitudinal } from "./asme";
import { allowableStress, materialByName } from "./catalog";
import type { HeNozzleRow } from "./types";

export type TubePattern = "30" | "45" | "90";

/**
 * shell-tube   standard TEMA exchanger (E/F/G shell)
 * kettle       K shell reboiler — enlarged shell for vapour disengagement
 * bayonet      long bayonet / hairpin tubes in a vertical shell
 * fired-heater process heater — radiant + convection coil, not a TEMA item
 */
export type ExchangerKind = "shell-tube" | "kettle" | "bayonet" | "fired-heater";

export interface ExchangerSpec {
  /** TEMA designation, e.g. BEM / AES / NEN */
  tema: string;
  /** mechanical family — drives the sheet beyond the TEMA letter code */
  kind?: ExchangerKind;
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

/** fired heater screening (API 560) — only filled for kind = fired-heater */
export interface HeaterDesign {
  coilTubes: number;
  tubeLength: number;
  coilWall: number;
  coilWallRequired: number;
  coilWeight: number;
  returnBends: number;
  casingArea: number;
  refractoryArea: number;
  burners: number;
  burnerDuty: number; // kW each
  dutyKW: number;
  flux: number; // kW/m² average radiant flux
  stackDia: number;
  stackHeight: number;
}

export interface ExchangerDesign {
  spec: ExchangerSpec;
  kind: ExchangerKind;
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
  tubesheetTema: number;
  tubesheetUg34: number;
  baffleSpacing: number;
  baffleCount: number;
  baffleCut: number;
  tieRods: number;
  tubeWallMin: number;
  fixedTubesheet: boolean;
  /** ASME B16.5 class from the pressure–temperature rating at design temperature */
  flangeClass: string;
  hydrotest: number; // kPa(g), UG-99(b)
  /** flange class that covers the hydrotest at ambient */
  hydrotestClass: string;
  heater?: HeaterDesign;
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
  // a bayonet / hairpin tube is two lengths of surface per element
  const perTubeLength = spec.kind === "bayonet" ? spec.tubeLength * 2 : spec.tubeLength;
  for (let id = 250; id <= 4000; id += 50) {
    const n = tubeCountFor(id, spec);
    const s = surfaceOf(n, spec.tubeOd, perTubeLength);
    if (s >= target) return { shellId: id, tubeCount: n, surface: s };
  }
  const id = 4000;
  const n = tubeCountFor(id, spec);
  return { shellId: id, tubeCount: n, surface: surfaceOf(n, spec.tubeOd, perTubeLength) };
}

// ---------------------------------------------------------------------------
// ASME B16.5 pressure–temperature ratings, material group 1.1 (A105 / A216 WCB)
// bar(g) at the listed temperatures. Estimating reproduction — the design
// review must confirm against the current B16.5 tables.
// ---------------------------------------------------------------------------

const PT_TEMPS = [38, 100, 150, 200, 250, 300, 350, 400, 450, 500, 538];
const PT_RATING: Record<string, number[]> = {
  "150#": [19.6, 17.7, 15.8, 13.8, 12.1, 10.2, 8.8, 6.9, 5.5, 4.1, 2.8],
  "300#": [51.1, 46.6, 45.1, 43.8, 42.5, 41.0, 39.8, 38.7, 36.9, 34.0, 26.5],
  "600#": [102.1, 93.2, 90.2, 87.6, 85.0, 82.0, 79.6, 77.4, 73.8, 68.0, 53.0],
  "900#": [153.2, 139.8, 135.2, 131.4, 127.5, 123.0, 119.4, 116.1, 110.7, 102.0, 79.5],
  "1500#": [255.3, 233.0, 225.4, 219.0, 212.5, 205.0, 199.0, 193.5, 184.5, 170.0, 132.5],
  "2500#": [425.5, 388.3, 375.6, 365.0, 354.2, 341.7, 331.7, 322.5, 307.5, 283.3, 220.8],
};
const CLASSES = Object.keys(PT_RATING);

/** allowable pressure of a class at temperature, bar(g) */
function ratingAt(cls: string, temp: number): number {
  const row = PT_RATING[cls];
  if (!row) return 0;
  if (temp <= PT_TEMPS[0]) return row[0];
  for (let i = 1; i < PT_TEMPS.length; i++) {
    if (temp <= PT_TEMPS[i]) {
      const t0 = PT_TEMPS[i - 1];
      const t1 = PT_TEMPS[i];
      return row[i - 1] + ((row[i] - row[i - 1]) * (temp - t0)) / (t1 - t0);
    }
  }
  return row[row.length - 1];
}

/** lowest B16.5 class that carries the pressure at design temperature */
export function flangeClassFor(kpa: number, temp: number): string {
  const bar = kpa / 100;
  for (const cls of CLASSES) {
    if (ratingAt(cls, temp) >= bar) return cls;
  }
  return "2500#";
}

/** pressure-only screening, kept for callers that have no temperature */
function ratingFor(kpa: number): string {
  return flangeClassFor(kpa, 38);
}
export const flangeClass = (kpa: number) => ratingFor(kpa);

/**
 * Tubesheet thickness — TEMA RCB-7.2 bending with the TEMA plate coefficient,
 * cross-checked against the ASME UG-34(c)(2) flat plate (C = 0.33). The larger
 * of the two governs, which is what makes a high-pressure / large-diameter
 * exchanger come out heavy rather than thin.
 */
function tubesheetThickness(
  spec: ExchangerSpec,
  shellId: number,
): { tema: number; ug34: number; taken: number } {
  const S = allowableStress(materialByName(spec.tubesheetMat), spec.shellTemp);
  const P = Math.max(spec.shellPressure, spec.tubePressure) / 1000; // MPa
  const G = shellId + 60; // gasket reaction mean diameter
  const F = isFixedTubesheet(spec.tema) ? 0.5 : 0.45; // TEMA RCB-7.2 plate coefficient
  const tema = F * G * Math.sqrt(P / Math.max(1, S));
  const ug34 = G * Math.sqrt((0.33 * P) / Math.max(1, S)); // UG-34(c)(2), C = 0.33
  const governing = Math.max(tema, ug34);
  const taken = Math.max(20, Math.ceil((governing + spec.ca) / 5) * 5);
  return { tema, ug34, taken };
}

/** API 560 fired heater screening, used when kind = fired-heater */
function heaterDesign(spec: ExchangerSpec): HeaterDesign {
  const S = allowableStress(materialByName(spec.tubeMat), spec.tubeTemp);
  const P = Math.max(spec.tubePressure, spec.shellPressure) / 1000; // MPa
  const required = (P * spec.tubeOd) / (2 * S + P) + spec.ca;
  // API 560 requires a minimum coil wall; 6.35 mm (Sch 80 on 1") is the shop floor
  const wall = Math.max(6.35, Math.ceil(required / 1.25) * 1.25);
  const tubes = Math.max(1, Math.ceil(spec.surfaceM2 / (Math.PI * mmToM(spec.tubeOd) * mmToM(spec.tubeLength))));
  const coilWeight =
    tubes *
    Math.PI *
    mmToM(spec.tubeOd - wall) *
    mmToM(wall) *
    mmToM(spec.tubeLength) *
    density(spec.tubeMat);
  const flux = 31.5; // kW/m² average radiant flux, API 560 typical for a charge heater
  const dutyKW = spec.surfaceM2 * flux;
  const burners = Math.max(1, Math.ceil(dutyKW / 6000));
  return {
    coilTubes: tubes,
    tubeLength: spec.tubeLength,
    coilWall: wall,
    coilWallRequired: required,
    coilWeight,
    returnBends: tubes * 2,
    casingArea: spec.surfaceM2 * 0.55,
    refractoryArea: spec.surfaceM2 * 0.55,
    burners,
    burnerDuty: dutyKW / burners,
    dutyKW,
    flux,
    stackDia: Math.max(600, Math.round(Math.sqrt(dutyKW / 900) * 100) * 10),
    stackHeight: Math.max(8000, Math.round((dutyKW / 1000) * 4000)),
  };
}

export function designExchanger(input: ExchangerSpec, autoSplit = 0): ExchangerDesign {
  const kind: ExchangerKind = input.kind ?? "shell-tube";
  const spec: ExchangerSpec = { ...input, kind, shells: Math.max(1, input.shells) };
  const { shellId: bundleShellId, tubeCount, surface } = sizeShell(spec);

  // a K shell is enlarged so the vapour can disengage above the bundle
  const shellId =
    kind === "kettle" ? Math.ceil((bundleShellId * 1.45) / 50) * 50 : bundleShellId;
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

  const ts = tubesheetThickness(spec, shellId);
  const tubesheetThk = ts.taken;

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
  const tubeWallMin = Math.max(1.65, (Pt * spec.tubeOd) / (2 * St + Pt) + 0.1);

  const bundleDia = bundleShellId * 0.92;
  // cylindrical surface area (m²) — the wall thickness is applied in mass()
  const areaOf = (d: number, t: number, l: number) => Math.PI * mmToM(d + t) * mmToM(l);
  const mass = (areaM2: number, t: number, mat: string) => areaM2 * mmToM(t) * density(mat);

  const shellW = mass(areaOf(shellId, shellThk, spec.tubeLength), shellThk, spec.shellMat);
  const channelL = Math.max(300, shellId * 0.55);
  const channelW = mass(areaOf(shellId, channelThk, channelL), channelThk, spec.channelMat);
  const headArea = 1.084 * Math.pow(mmToM(shellId), 2);
  const headsW = 3 * mass(headArea, headThk, spec.shellMat); // 2 shell covers + channel head
  const tubeLengthPerTube = kind === "bayonet" ? spec.tubeLength * 2 : spec.tubeLength;
  const tubeW = tubesTotal
    ? tubeCount *
      Math.PI *
      mmToM(spec.tubeOd - spec.tubeThk) *
      mmToM(spec.tubeThk) *
      mmToM(tubeLengthPerTube) *
      density(spec.tubeMat)
    : 0;
  const tsArea = (Math.PI / 4) * Math.pow(mmToM(shellId + 80), 2);
  const tubesheetsW = kind === "bayonet" ? mass(tsArea, tubesheetThk, spec.tubesheetMat) : 2 * mass(tsArea, tubesheetThk, spec.tubesheetMat);
  const baffleT = Math.max(6, spec.tubeOd * 0.3);
  const baffleW =
    baffleCount * mass((Math.PI / 4) * Math.pow(mmToM(bundleDia), 2) * 0.78, baffleT, spec.shellMat);
  const nozzleW = 8 * mass(Math.PI * 0.3 * 0.3 * 0.25, 8, spec.shellMat); // 8 × ~10" necks
  const totalW = shellW + channelW + headsW + tubeW + tubesheetsW + baffleW + nozzleW;

  const heater = kind === "fired-heater" ? heaterDesign(spec) : undefined;
  const surfaceTotal = heater ? spec.surfaceM2 : surface * spec.shells;

  // ASME UG-99(b): 1.3 × design pressure × stress ratio, ambient stress governs
  const Sa = allowableStress(materialByName(spec.shellMat), 38);
  const hydrotest = Math.round(1.3 * Math.max(spec.shellPressure, spec.tubePressure) * (Sa / Math.max(1, S)));
  const flangeClassDesign = flangeClassFor(
    Math.max(spec.shellPressure, spec.tubePressure),
    Math.max(spec.shellTemp, spec.tubeTemp),
  );
  const hydrotestClass = flangeClassFor(hydrotest, 38);
  const classP = ratingAt(flangeClassDesign, Math.max(spec.shellTemp, spec.tubeTemp)) * 100;
  const hydroClassP = ratingAt(hydrotestClass, 38) * 100;

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
      code: "TEMA RCB-7.2 / UG-34",
      item: "Tubesheet",
      detail: `${isFixedTubesheet(spec.tema) ? "fixed" : "floating / U-tube"} plate: TEMA ${ts.tema.toFixed(
        1,
      )} mm, UG-34 ${ts.ug34.toFixed(1)} mm → taken ${tubesheetThk} mm incl. CA`,
      ok: tubesheetThk >= Math.max(ts.tema, ts.ug34) + spec.ca - 0.1,
    },
    {
      code: "ASME B16.5",
      item: "Flange class",
      detail: `${flangeClassDesign} rated ${(classP / 100).toFixed(1)} bar at ${Math.max(
        spec.shellTemp,
        spec.tubeTemp,
      )} °C for ${(Math.max(spec.shellPressure, spec.tubePressure) / 100).toFixed(1)} bar design`,
      ok: classP >= Math.max(spec.shellPressure, spec.tubePressure),
    },
    {
      code: "ASME UG-99(b)",
      item: "Hydrotest",
      detail: `test ${(hydrotest / 100).toFixed(1)} bar — covers ${hydrotestClass} at ambient (${(
        hydroClassP / 100
      ).toFixed(1)} bar)`,
      ok: hydroClassP >= hydrotest,
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
      item: heater ? "Coil surface" : "Surface",
      detail: heater
        ? `${heater.coilTubes} coil tubes × ${(heater.tubeLength / 1000).toFixed(2)} m at ${heater.flux} kW/m² = ${Math.round(
            heater.dutyKW,
          )} kW`
        : `${surfaceTotal.toFixed(0)} m² in ${spec.shells} shell${spec.shells > 1 ? "s" : ""} of ${tubeCount} tubes × ${(
            spec.tubeLength / 1000
          ).toFixed(2)} m (required ${spec.surfaceM2.toFixed(0)} m²)`,
      ok: surfaceTotal >= spec.surfaceM2 - 0.5,
    },
    ...(heater
      ? [
          {
            code: "API 560",
            item: "Coil wall",
            detail: `minimum ${heater.coilWallRequired.toFixed(1)} mm for ${P.toFixed(2)} MPa at ${spec.tubeTemp} °C, taken ${heater.coilWall.toFixed(1)} mm (Sch 80 floor)`,
            ok: heater.coilWall >= heater.coilWallRequired,
          },
          {
            code: "API 560",
            item: "Radiant flux",
            detail: `${heater.flux} kW/m² average over ${spec.surfaceM2.toFixed(0)} m² — limit 37.6 kW/m²`,
            ok: heater.flux <= 37.6,
          },
        ]
      : []),
  ];

  // a fired heater is not a TEMA item: its sheet is the coil, casing and
  // burner screening, so the tubesheet / baffle / girth-flange checks do not apply
  const checksForKind: DesignCheck[] =
    kind === "fired-heater"
      ? [
          {
            code: "TEMA",
            item: "Applicability",
            detail:
              "Fired heater — TEMA tubesheet, baffle and girth-flange rules do not apply; coil, casing and burners follow API 560",
            ok: true,
          },
          ...checks.filter((c) => c.code === "API 560" || c.item === "Coil surface"),
        ]
      : checks;

  const bundleWeight = tubeW + tubesheetsW + baffleW;
  // UOP limits bundle pulling to 20 t — add a shell in parallel until it fits
  if (bundleWeight > 20000 && autoSplit < 5 && kind !== "fired-heater") {
    return designExchanger({ ...spec, shells: spec.shells + 1 }, autoSplit + 1);
  }

  return {
    spec,
    kind,
    shellId,
    bundleDia,
    tubeCount: kind === "fired-heater" && heater ? heater.coilTubes : tubeCount,
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
    tubesheetTema: ts.tema,
    tubesheetUg34: ts.ug34,
    baffleSpacing,
    baffleCount,
    baffleCut: 25,
    tieRods,
    tubeWallMin,
    fixedTubesheet: isFixedTubesheet(spec.tema),
    flangeClass: flangeClassDesign,
    hydrotest,
    hydrotestClass,
    heater,
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
    checks: checksForKind,
  };
}

// ---------------------------------------------------------------------------
// Nozzle schedule — TEMA RG-6.4 sizes, editable on the nozzle page
// ---------------------------------------------------------------------------

const npsFromOd = (od: number) => {
  const ladder = [21.3, 26.7, 33.4, 48.3, 60.3, 88.9, 114.3, 168.3, 219.1, 273.1, 323.9, 355.6, 406.4, 457, 508, 609.6];
  const names = ['1/2"', '3/4"', '1"', '1.1/2"', '2"', '3"', '4"', '6"', '8"', '10"', '12"', '14"', '16"', '18"', '20"', '24"'];
  let best = 0;
  for (let i = 0; i < ladder.length; i++) if (od >= ladder[i]) best = i;
  return names[best];
};

export function defaultExchangerNozzles(spec: ExchangerSpec, design?: ExchangerDesign): HeNozzleRow[] {
  const d = design ?? designExchanger(spec);
  const D = d.shellId;
  const big = D <= 400 ? 168.3 : D <= 700 ? 219.1 : D <= 1000 ? 273.1 : D <= 1400 ? 323.9 : D <= 1800 ? 406.4 : 508;
  const small = D <= 400 ? 114.3 : D <= 1000 ? 168.3 : 219.1;
  const shellSide = d.kind !== "kettle";
  const rows: HeNozzleRow[] = [
    { mark: "S1", service: shellSide ? "Shell inlet" : "Kettle vapour outlet", nps: npsFromOd(big), qty: 1, pressure: spec.shellPressure, temperature: spec.shellTemp, shellSide: true },
    { mark: "S2", service: "Shell outlet", nps: npsFromOd(small), qty: 1, pressure: spec.shellPressure, temperature: spec.shellTemp, shellSide: true },
    { mark: "C1", service: "Channel inlet", nps: npsFromOd(big), qty: 1, pressure: spec.tubePressure, temperature: spec.tubeTemp, shellSide: false },
    { mark: "C2", service: "Channel outlet", nps: npsFromOd(big), qty: 1, pressure: spec.tubePressure, temperature: spec.tubeTemp, shellSide: false },
    { mark: "V1", service: "Shell vent", nps: '1.1/2"', qty: 1, pressure: spec.shellPressure, temperature: spec.shellTemp, shellSide: true },
    { mark: "D1", service: "Shell drain", nps: '2"', qty: 1, pressure: spec.shellPressure, temperature: spec.shellTemp, shellSide: true },
    { mark: "V2", service: "Channel vent", nps: '1.1/2"', qty: 1, pressure: spec.tubePressure, temperature: spec.tubeTemp, shellSide: false },
    { mark: "D2", service: "Channel drain", nps: '2"', qty: 1, pressure: spec.tubePressure, temperature: spec.tubeTemp, shellSide: false },
  ];
  if (d.kind === "kettle") rows.push({ mark: "S3", service: "Kettle liquid draw-off", nps: npsFromOd(small), qty: 1, pressure: spec.shellPressure, temperature: spec.shellTemp, shellSide: true });
  if (d.kind === "fired-heater") {
    return [
      { mark: "CO1", service: "Coil inlet", nps: npsFromOd(small), qty: 1, pressure: spec.tubePressure, temperature: spec.tubeTemp, shellSide: false },
      { mark: "CO2", service: "Coil outlet", nps: npsFromOd(small), qty: 1, pressure: spec.tubePressure, temperature: spec.tubeTemp, shellSide: false },
      { mark: "B1", service: "Burner opening", nps: npsFromOd(big), qty: Math.max(1, d.heater?.burners ?? 1), pressure: 0, temperature: spec.tubeTemp, shellSide: true },
    ];
  }
  return rows;
}

/** design pressure class for the girth / channel flanges */
export const exchangerRating = (spec: ExchangerSpec) =>
  flangeClassFor(Math.max(spec.shellPressure, spec.tubePressure), Math.max(spec.shellTemp, spec.tubeTemp));

/** starting design basis for a new exchanger added from the wizard */
export const DEFAULT_EXCHANGER_SPEC: ExchangerSpec = {
  tema: "BEU",
  kind: "shell-tube",
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
