// ---------------------------------------------------------------------------
// ASME BPVC Section VIII Division 1 calculation routines
// All lengths in mm, pressures in MPa unless stated.
// ---------------------------------------------------------------------------
import { allowableStress, yieldStress, materialByName, pipeOd, pipeWall } from "./catalog";

export interface DesignInput {
  pressure: number; // kPa(g) internal design pressure
  temperature: number; // deg C
  externalPressure: number; // kPa(g) (positive magnitude)
  insideDiameter: number; // mm
  material: string;
  ca: number; // mm corrosion allowance
  E: number; // joint efficiency
  headType: string;
  shellLength: number; // mm, tangent to tangent
}

export interface ThicknessResult {
  label: string;
  required: number; // mm incl. CA
  base: number; // mm without CA
  formula: string;
  clause: string;
}

const toMPa = (kPa: number) => kPa / 1000;

// --- UG-27 -----------------------------------------------------------------
export function shellCircumferential(P: number, D: number, S: number, E: number, ca: number) {
  const R = D / 2;
  const base = (P * R) / (S * E - 0.6 * P);
  return { base, required: base + ca, formula: "t = P·R / (S·E − 0.6·P) + CA", clause: "UG-27(c)(1)" };
}

export function shellLongitudinal(P: number, D: number, S: number, E: number, ca: number) {
  const R = D / 2;
  const base = (P * R) / (2 * S * E + 0.4 * P);
  return { base, required: base + ca, formula: "t = P·R / (2·S·E + 0.4·P) + CA", clause: "UG-27(c)(2)" };
}

// --- UG-32 heads -----------------------------------------------------------
export function headThickness(
  type: string,
  P: number,
  D: number,
  S: number,
  E: number,
  ca: number,
): ThicknessResult {
  let base = 0;
  let formula = "";
  let clause = "UG-32";
  switch (type) {
    case "Hemispherical":
      base = (P * (D / 2)) / (2 * S * E - 0.2 * P);
      formula = "t = P·R / (2·S·E − 0.2·P) + CA";
      clause = "UG-32(f)";
      break;
    case "Torispherical (F&D)": {
      const L = D; // crown radius = D for standard F&D
      base = (0.885 * P * L) / (S * E - 0.1 * P);
      formula = "t = 0.885·P·L / (S·E − 0.1·P) + CA,  L = D";
      clause = "UG-32(e)";
      break;
    }
    case "Flat (UG-34)": {
      const C = 0.33;
      base = D * Math.sqrt((C * P) / (S * E));
      formula = "t = d·√(C·P / (S·E)) + CA,  C = 0.33";
      clause = "UG-34";
      break;
    }
    case "Conical 60 deg": {
      const alpha = 30 * (Math.PI / 180);
      base = (P * D) / (2 * Math.cos(alpha) * (S * E - 0.6 * P));
      formula = "t = P·D / (2·cosα·(S·E − 0.6·P)) + CA,  α = 30°";
      clause = "UG-32(g)";
      break;
    }
    case "2:1 Ellipsoidal":
    default:
      base = (P * D) / (2 * S * E - 0.2 * P);
      formula = "t = P·D / (2·S·E − 0.2·P) + CA";
      clause = "UG-32(d)";
      break;
  }
  return { label: type, required: base + ca, base, formula, clause };
}

// --- MAWP ------------------------------------------------------------------
export function mawpFromThickness(
  type: string,
  t: number,
  D: number,
  S: number,
  E: number,
): number {
  // MPa, t is the nominal (uncorroded) thickness
  switch (type) {
    case "Hemispherical":
      return (2 * S * E * t) / (D / 2 + 0.2 * t) / 1;
    case "Flat (UG-34)":
      return (S * E * Math.pow(t / D, 2)) / 0.33;
    case "Torispherical (F&D)":
      return (S * E * t) / (0.885 * D + 0.1 * t);
    case "Conical 60 deg": {
      const c = Math.cos(30 * (Math.PI / 180));
      return (2 * S * E * t * c) / (D + 1.2 * t * c);
    }
    case "2:1 Ellipsoidal":
    default:
      return (2 * S * E * t) / (D + 0.2 * t);
  }
}

export function shellMawpCirc(t: number, D: number, S: number, E: number) {
  const R = D / 2;
  return (S * E * t) / (R + 0.6 * t);
}

// --- UG-45 nozzle neck -----------------------------------------------------
export function nozzleNeckUG45(
  P: number,
  nps: string,
  schedule: string,
  Sneck: number,
  Sshell: number,
  Eshell: number,
  ca: number,
  shellRequiredT: number,
  radiographed: boolean,
) {
  const od = pipeOd(nps);
  const schT = pipeWall(nps, schedule);
  const doNoz = od || 60.3;
  // t_a : internal pressure thickness on the neck (UG-27 outside-radius form)
  const taBase = (P * doNoz) / (2 * Sneck + 0.4 * P);
  const ta = taBase + ca;
  // t_b1 : 2.5 x shell thickness (set-through / set-on without full RT)
  const tb1 = radiographed ? 0.875 * shellRequiredT : 2.5 * shellRequiredT;
  // t_b3 : standard wall thickness for the nozzle size
  const npsNum = parseFloat(nps.replace('"', "")) || 0;
  const tb3 = npsNum >= 8 ? 9.53 : 6.22;
  // UG-45(b): t = max(t_a, t_b) with t_b = min(t_b3, max(t_b1, t_b2)).
  // t_b3 caps t_b only — it must never cap t_a, so a small neck on a
  // high-pressure shell keeps its pressure thickness.
  const tb = Math.min(tb3, tb1);
  const tmin = Math.max(ta, tb);
  return {
    od: doNoz,
    scheduleThickness: schT,
    ta,
    taBase,
    tb1,
    tb3,
    tUG45: tmin,
    governing: ta >= tb ? "t_a (UG-27)" : tb1 > tb3 ? "t_b3 cap" : "t_b1 (2.5·t_s)",
    adequate: schT >= tmin,
    Sshell,
    Eshell,
  };
}

// --- UG-37 area reinforcement ---------------------------------------------
export interface ReinforcementInput {
  d: number; // finished opening diameter (mm, corroded) — nozzle ID
  shellT: number; // nominal shell thickness
  tr: number; // required shell thickness (excl. CA)
  E1: number; // joint efficiency in plane of opening
  F: number; // 1.0 for most
  tn: number; // nozzle neck thickness (nominal)
  trn: number; // required nozzle neck thickness (excl. CA)
  fr1: number; // Snozzle / Sshell
  fr2: number;
  padWidth: number; // mm radial width of repad
  padThk: number; // mm
  legShell: number; // weld leg shell-to-neck
  legPad: number; // weld leg pad-to-shell
}

export function areaReinforcement(i: ReinforcementInput) {
  const A = i.d * i.tr * i.F + 2 * i.tn * i.tr * i.F * (1 - i.fr1);
  const A1 = Math.max(
    i.d * (i.E1 * i.shellT - i.F * i.tr) - 2 * i.tn * (i.E1 * i.shellT - i.F * i.tr) * (1 - i.fr1),
    0,
  );
  const A2 = 2 * Math.max(i.tn - i.trn, 0) * Math.min(2.5 * i.shellT, 2.5 * i.tn * 1.0) * i.fr2;
  const A3 = 0; // nozzle inside projection ignored
  const A41 = 0.5 * i.legShell * i.legShell * i.fr2;
  const A42 = i.legPad > 0 ? 0.5 * i.legPad * i.legPad * 0.9 : 0;
  const A43 = 0;
  const A5 = i.padWidth > 0 ? 2 * i.padWidth * i.padThk * 0.9 : 0;
  const available = A1 + A2 + A3 + A41 + A42 + A43 + A5;
  return { A, A1, A2, A3, A41, A42, A43, A5, available, adequate: available >= A, deficit: Math.max(A - available, 0) };
}

// --- UG-28 external pressure (elastic buckling, closed form) --------------
export function externalPressureAllowable(
  Do: number,
  t: number,
  L: number,
  material: string,
  temperature: number,
) {
  const m = materialByName(material);
  const E = m.modulus;
  const Sy = yieldStress(m, temperature);
  const nu = 0.3;
  const ratio = Do / Math.max(t, 0.1);
  const LDo = L / Do;
  const tDo = t / Do;
  const denom = Math.max(LDo - 0.45 * Math.sqrt(tDo), 0.1);
  const Pcr = (2.42 * E * Math.pow(tDo, 2.5)) / (Math.pow(1 - nu * nu, 0.75) * denom); // MPa
  const Py = (2 * Sy * tDo) / Math.sqrt(Math.max(1 - nu * nu, 0.5));
  const PaElastic = Pcr / 3.0; // safety factor 3 per UG-28
  const PaYield = (2 * Sy * tDo) / 1.5;
  const Pa = Math.min(PaElastic, PaYield);
  const A = 0.125 / ratio; // ASME geometric factor (elastic region)
  return { Pa, Pcr, Py, ratio, LDo, A, limitedBy: PaElastic < PaYield ? "elastic buckling" : "yield" };
}

// --- UG-99 hydrotest -------------------------------------------------------
export function hydrotestPressure(mawp: number, Sdesign: number, Stest: number) {
  return 1.3 * mawp * Math.min(Stest / Sdesign, 1.5);
}

// --- Long column check (wind + seismic + weight) --------------------------
export interface ColumnCheckInput {
  Do: number;
  t: number;
  height: number; // mm, tangent + skirt
  P: number; // MPa internal
  S: number;
  E: number;
  weight: number; // kg total erected
  windSpeed: number; // m/s
  seismic: number; // coefficient
  material: string;
  temperature: number;
}

export function columnCheck(i: ColumnCheckInput) {
  const m = materialByName(i.material);
  const Do = i.Do;
  const t = i.t;
  const Ro = Do / 2;
  const q = 0.6 * i.windSpeed * i.windSpeed * 0.8; // N/m2, Cf applied
  const Hm = i.height / 1000;
  const projected = (Do / 1000) * Hm;
  const windForce = (q * projected) / 1000; // kN
  const windMoment = ((windForce * i.height) / 2) / 1000; // kNm at base
  const W = i.weight; // kg
  const seismicForce = (i.seismic * W * 9.81) / 1000; // kN
  const seismicMoment = ((seismicForce * i.height) / 2) / 1000;
  const M = Math.max(windMoment, seismicMoment); // kNm
  const Z = (Math.PI * Math.pow(Ro, 2) * t) / 1e9; // m^3 thin shell section modulus
  const sigmaB = M / Z / 1000; // MPa  (kNm / m^3 => kPa => MPa)
  const axialLoad = (W * 9.81) / 1000; // kN
  const sigmaA = axialLoad * 1000 / (Math.PI * Do * t); // MPa
  const sigmaP = (i.P * (Do - 2 * t)) / (4 * t);
  const total = sigmaP + sigmaB + sigmaA;
  const allowable = i.S * i.E;
  const compress = sigmaA + sigmaB;
  const compressAllow = (0.125 * m.modulus * t) / Ro;
  return {
    windPressure: q,
    windForce,
    windMoment,
    seismicForce,
    seismicMoment,
    governing: windMoment >= seismicMoment ? "Wind" : "Seismic",
    M,
    Z,
    sigmaB,
    sigmaA,
    sigmaP,
    total,
    allowable,
    ratio: total / allowable,
    compress,
    compressAllow,
    compressOk: compress <= compressAllow,
    ok: total <= allowable && compress <= compressAllow,
  };
}

// --- Full design summary for an equipment ---------------------------------
export interface DesignResult {
  input: DesignInput;
  S: number;
  Sy: number;
  shellCirc: { base: number; required: number; formula: string; clause: string };
  shellLong: { base: number; required: number; formula: string; clause: string };
  shellGov: number;
  head: ThicknessResult;
  extPressure: ReturnType<typeof externalPressureAllowable>;
  mawpShell: number;
  mawpHydro: number;
  Sdesign: number;
  column: ReturnType<typeof columnCheck> | null;
  serviceTempAllow: number;
}

export function runDesign(
  d: DesignInput,
  weight = 0,
  windSpeed = 39,
  seismic = 0.1,
  providedThickness = 0,
): DesignResult {
  const m = materialByName(d.material);
  const S = allowableStress(m, d.temperature);
  const Sy = yieldStress(m, d.temperature);
  const P = toMPa(d.pressure);
  const circ = shellCircumferential(P, d.insideDiameter, S, d.E, d.ca);
  const long = shellLongitudinal(P, d.insideDiameter, S, d.E, d.ca);
  const head = headThickness(d.headType, P, d.insideDiameter, S, d.E, d.ca);
  const shellGov = Math.max(circ.required, long.required);
  // provided thickness governs MAWP / external pressure / structural checks
  const tUsed = Math.max(providedThickness, shellGov);
  const ext = externalPressureAllowable(d.insideDiameter + 2 * tUsed, tUsed, d.shellLength, d.material, d.temperature);
  const mawpShell = shellMawpCirc(Math.max(tUsed - d.ca, 0.1), d.insideDiameter, S, d.E);
  const Stest = allowableStress(m, 20);
  const column = columnCheck({
    Do: d.insideDiameter + 2 * tUsed,
    t: tUsed,
    height: d.shellLength + d.insideDiameter * 0.5,
    P,
    S,
    E: d.E,
    weight,
    windSpeed,
    seismic,
    material: d.material,
    temperature: d.temperature,
  });
  return {
    input: d,
    S,
    Sy,
    shellCirc: circ,
    shellLong: long,
    shellGov,
    head,
    extPressure: ext,
    mawpShell,
    mawpHydro: hydrotestPressure(mawpShell, S, Stest),
    Sdesign: S,
    column,
    serviceTempAllow: S,
  };
}
