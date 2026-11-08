// ---------------------------------------------------------------------------
// Mechanical classification of the exchanger scope.
//
// The TEMA letter code only describes the rear head of a shell & tube unit, so
// it cannot tell a hairpin from a kettle or a stabbed-in reboiler. This module
// puts every item into one mechanical family and derives the four things the
// shop and the estimate need from it:
//
//   mech         fixed / floating / U-tube / hairpin / kettle / stabbed-in / fired heater
//   orientation  horizontal on saddles or vertical on a skirt
//   tube joint   expanded only, expanded + seal weld, expanded + strength weld,
//                or a butt-welded coil (fired heater — no tubesheet at all)
//   criticality  Critical / High / Standard with the reason on the sheet
//
// The rules follow the project specification: UOP Std 3-11 requires strength-
// welded tube joints for hydrogen service and for CA 6 mm wet-H2S service, and
// TEMA RCB-7.3 governs the expanded joint where only a seal weld is used.
// ---------------------------------------------------------------------------

import type { ExchangerKind, ExchangerSpec } from "./tema";

export type MechType =
  | "fixed"
  | "floating"
  | "u-tube"
  | "hairpin"
  | "kettle"
  | "stabbed-in"
  | "fired-heater";

export type TubeJoint = "expanded" | "expanded+seal" | "expanded+strength" | "welded";

export type Criticality = "Critical" | "High" | "Standard";

export type Orientation = "Vertical" | "Horizontal";

export const MECH_ORDER: MechType[] = [
  "fixed",
  "floating",
  "u-tube",
  "hairpin",
  "kettle",
  "stabbed-in",
  "fired-heater",
];

export const MECH_LABEL: Record<MechType, string> = {
  fixed: "Fixed tubesheet",
  floating: "Floating head",
  "u-tube": "U-tube bundle",
  hairpin: "Hairpin",
  kettle: "Kettle reboiler",
  "stabbed-in": "Stabbed-in reboiler",
  "fired-heater": "Fired heater (API 560)",
};

export const MECH_REAR_HEAD: Record<MechType, string> = {
  fixed: "TEMA M / N — both tubesheets fixed to the shell",
  floating: "TEMA S / T — floating head with backing device or lip seal",
  "u-tube": "TEMA U — U-tube bundle, one tubesheet",
  hairpin: "two-leg hairpin element, return bend at the far end",
  kettle: "TEMA K — enlarged shell for vapour disengagement",
  "stabbed-in": "bundle inserted through a large column shell nozzle",
  "fired-heater": "API 560 process heater — coil, casing, burners, stack",
};

export const MECH_NOTE: Record<MechType, string> = {
  fixed:
    "Cheapest and most compact, but the shell carries the differential expansion — needs an expansion joint or a low ΔT.",
  floating:
    "Removable bundle, no shell-side expansion joint; the floating head and backing device carry the differential movement.",
  "u-tube":
    "One tubesheet, bundle free to expand and removable; tube-side cleaning is limited to the straight legs.",
  hairpin:
    "Two legs and a return bend per element — high surface in a long, narrow footprint; return bends are pressure-critical.",
  kettle:
    "K shell with a vapour space above the bundle; weir keeps the bundle flooded and the bundle is pulled from one end.",
  "stabbed-in":
    "Bundle inserted through a large nozzle in the column or drum shell — no separate shell-side flange, bundle pulled through the nozzle.",
  "fired-heater":
    "Not a TEMA item: radiant and convection coil, refractory casing, burners and stack per API 560.",
};

export const JOINT_LABEL: Record<TubeJoint, string> = {
  expanded: "Expanded only (rolled)",
  "expanded+seal": "Expanded + seal weld",
  "expanded+strength": "Expanded + strength weld",
  welded: "Butt-welded coil — no tubesheet",
};

export const JOINT_NOTE: Record<TubeJoint, string> = {
  expanded:
    "Rolled joint only (TEMA RCB-7.3). Permitted where the shell/tube differential and the pressure allow it and no hydrogen is present.",
  "expanded+seal":
    "Rolled then seal-welded — a leak-tight joint without claiming weld strength; used on reboilers and condensers where the two sides must not mix.",
  "expanded+strength":
    "Rolled then strength-welded per UOP Std 3-11 — the weld carries the pressure load; mandatory for hydrogen and wet H2S service.",
  welded: "Coil tubes are butt-welded to forged return bends — there is no tube-to-tubesheet joint on a fired heater.",
};

export const CRITICALITY_ORDER: Criticality[] = ["Critical", "High", "Standard"];

/** rear-head letter of a TEMA designation (third character) */
const rearHead = (tema: string) => (tema || "BEU").toUpperCase()[2] ?? "U";

export function mechFromTema(kind: ExchangerKind | undefined, tema: string): MechType {
  if (kind === "fired-heater") return "fired-heater";
  if (kind === "kettle") return "kettle";
  if (kind === "stabbed-in") return "stabbed-in";
  if (kind === "hairpin" || kind === "bayonet") return "hairpin";
  const rear = rearHead(tema);
  if (rear === "M" || rear === "N") return "fixed";
  if (rear === "U") return "u-tube";
  if (rear === "S" || rear === "T" || rear === "P" || rear === "W") return "floating";
  return "u-tube";
}

/** tubesheets on the item — U-tube, hairpin, kettle and stabbed-in bundles have one */
export const tubesheetCount = (mech: MechType): number =>
  mech === "fired-heater" ? 0 : mech === "fixed" || mech === "floating" ? 2 : 1;

/** lengths of tube per element — a hairpin / bayonet is two legs */
export const tubeLegs = (mech: MechType): number => (mech === "hairpin" ? 2 : 1);

/** has a floating (rear) tubesheet that moves with the bundle */
export const hasFloatingTubesheet = (mech: MechType): boolean => mech === "floating";

/**
 * Tube-to-tubesheet joint when the sheet does not state one.
 * UOP 3-11: strength weld for hydrogen / wet H2S (CA 6 mm) and above 30 bar;
 * seal weld on reboilers and condensers; rolled only on water and air coolers.
 */
export function defaultJoint(
  mech: MechType,
  spec: Pick<ExchangerSpec, "ca" | "tubeTemp" | "shellPressure" | "tubePressure">,
): TubeJoint {
  if (mech === "fired-heater") return "welded";
  const P = Math.max(spec.shellPressure, spec.tubePressure);
  if (mech === "kettle" || mech === "stabbed-in") return "expanded+seal";
  if (spec.ca >= 6 || spec.tubeTemp >= 400 || P >= 3000) return "expanded+strength";
  if (P >= 1500) return "expanded+seal";
  return "expanded";
}

export function orientationFor(mech: MechType, tubeLength: number): Orientation {
  if (mech === "fired-heater") return "Vertical";
  if (mech === "kettle" || mech === "hairpin" || mech === "stabbed-in") return "Horizontal";
  return tubeLength >= 10000 ? "Vertical" : "Horizontal";
}

export function supportFor(mech: MechType, orientation: Orientation): string {
  if (mech === "fired-heater") return "Grade mounted structural steel";
  if (mech === "stabbed-in") return "Integral — through the column shell";
  if (mech === "hairpin") return "Steel legs";
  if (mech === "kettle") return "Saddles, one fixed + one sliding";
  return orientation === "Vertical" ? "Skirt (concrete ringwall)" : "Saddles, one fixed + one sliding";
}

export function criticalityFor(mech: MechType, spec: ExchangerSpec, joint: TubeJoint): Criticality {
  if (mech === "fired-heater") return "Critical";
  if (spec.criticality) return spec.criticality;
  if (joint === "expanded+strength" || spec.ca >= 6) return "High";
  if (mech === "hairpin" || mech === "stabbed-in" || mech === "floating") return "High";
  return "Standard";
}

export interface MechInfo {
  mech: MechType;
  label: string;
  rearHead: string;
  orientation: Orientation;
  support: string;
  tubeJoint: TubeJoint;
  jointLabel: string;
  criticality: Criticality;
  reason: string;
  features: string[];
}

/** everything the classification columns show for one exchanger */
export function classifyExchanger(spec: ExchangerSpec, features: string[] = []): MechInfo {
  const mech = spec.mech ?? mechFromTema(spec.kind, spec.tema);
  const joint = spec.tubeJoint ?? defaultJoint(mech, spec);
  const orientation = spec.orientation ?? orientationFor(mech, spec.tubeLength);
  const support = spec.support ?? supportFor(mech, orientation);
  const criticality = criticalityFor(mech, spec, joint);
  return {
    mech,
    label: MECH_LABEL[mech],
    rearHead: MECH_REAR_HEAD[mech],
    orientation,
    support,
    tubeJoint: joint,
    jointLabel: JOINT_LABEL[joint],
    criticality,
    reason:
      spec.criticalityNote ??
      (criticality === "High"
        ? `${MECH_LABEL[mech]} with ${JOINT_LABEL[joint].toLowerCase()} — mechanical detail governs fabrication.`
        : `${MECH_LABEL[mech]} — standard TEMA fabrication.`),
    features: [...features, ...(spec.features ?? [])],
  };
}

/** count of each mechanical family in a scope */
export function mechCounts(list: MechType[]): Record<MechType, number> {
  const out = Object.fromEntries(MECH_ORDER.map((m) => [m, 0])) as Record<MechType, number>;
  for (const m of list) out[m] = (out[m] ?? 0) + 1;
  return out;
}
