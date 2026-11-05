// ---------------------------------------------------------------------------
// Welding procedure, weld layers and shop manhours.
//
// Every priced line that carries weld length is broken into the joints a
// fabricator actually qualifies a WPS for:
//
//   shell long seam + circ seam      butt, UW-12 type 1 (double welded)
//   head / cover to shell            butt, UW-12 type 1
//   nozzle / manway to shell         full-penetration branch, UW-16
//   flange to neck                   butt / fillet, UW-21
//   tubesheet to shell / channel     TEMA RCB-9, UW-13
//   tube to tubesheet                TEMA RCB-9.2 strength weld
//   internal / structural attachment fillet, UW-18
//
// Layer build-up follows the shop practice used here:
//   root  — GTAW, always
//   fill  — SMAW up to 20 mm plate, SAW above 20 mm
//   cap   — same process as the fill
//
// Joint preparation: single V up to the double-V break; a single V that is
// welded from one side is back-gouged and re-welded (UW-35), the method being
// manual grinding on small shells and machine grinding on large ones. All
// hours are converted to money at the shop manhour rate.
// ---------------------------------------------------------------------------

import type { BomItem } from "./bom";
import type {
  Equipment,
  GougeMethod,
  JointPrep,
  RateBook,
  WeldProcess,
  WeldSettings,
} from "./types";
import { designExchanger } from "./tema";

/** effective deposition, kg of weld metal per arc hour (shop factors included) */
export const DEPOSITION: Record<WeldProcess, number> = {
  GTAW: 0.18,
  SMAW: 0.9,
  SAW: 3.2,
  FCAW: 1.6,
};

/** single pass thickness per process, mm */
const PASS_THK: Record<WeldProcess, number> = {
  GTAW: 2.5,
  SMAW: 3,
  SAW: 5,
  FCAW: 3.5,
};

export const DEFAULT_WELD: WeldSettings = {
  shopRate: 2,
  rootProcess: "GTAW",
  fillProcessThin: "SMAW",
  fillProcessThick: "SAW",
  thickThreshold: 20,
  doubleVThreshold: 25,
  gougeMethod: "Auto",
  gougeAutoDia: 1200,
  manualGougeRate: 0.55,
  machineGougeRate: 0.18,
  fitUp: 0.35,
};

/** t (mm) → joint prep for a full-penetration butt joint */
export function jointPrep(t: number, s: WeldSettings): JointPrep {
  if (t <= 3) return "Square";
  if (t > s.doubleVThreshold) return "Double V";
  return "Single V";
}

const tan30 = Math.tan(Math.PI / 6);

/** groove cross-section, mm², for a 60° included V / double V with 2 mm gap */
export function grooveArea(t: number, prep: JointPrep): number {
  const gap = 2;
  const rf = Math.min(2, t / 4);
  if (prep === "Square") return t * gap + 2 * gap;
  if (prep === "Double V") {
    const h = Math.max(0, t / 2 - rf);
    return 2 * h * h * tan30 + 2 * gap * rf;
  }
  const h = Math.max(0, t - rf);
  return h * h * tan30 + gap * rf * 2;
}

/** weld metal mass per metre of joint, kg/m */
const massPerM = (areaMm2: number) => areaMm2 * 1e-6 * 7850;

export interface WeldLayer {
  layer: string;
  process: WeldProcess;
  passes: number;
  /** kg of weld metal in this group of passes, per metre */
  massPerM: number;
  hoursPerM: number;
}

export interface WeldRow {
  key: string;
  equipmentId: string;
  tag: string;
  equipment: string;
  part: string;
  /** weld type description, e.g. "Shell longitudinal & circumferential seam" */
  weldType: string;
  codeRef: string;
  thickness: number;
  prep: JointPrep;
  gouge: GougeMethod;
  /** "1 root GTAW · 5 fill SMAW · cap" */
  layerText: string;
  layers: WeldLayer[];
  metres: number;
  hoursPerM: number;
  hours: number;
  cost: number;
  note: string;
}

export interface WeldSummary {
  rows: WeldRow[];
  hours: number;
  cost: number;
  metres: number;
  gougeMetres: number;
  byProcess: { process: WeldProcess; hours: number; mass: number }[];
  byPrep: { prep: JointPrep; metres: number; hours: number }[];
  shopRate: number;
}

// ---------------------------------------------------------------------------
// Joint families — one WPS family per part / weld type
// ---------------------------------------------------------------------------

interface Family {
  weldType: string;
  codeRef: string;
  /** full-penetration groove weld (groove area drives the layers) */
  groove: boolean;
  note: string;
}

const FALLBACK: Family = {
  weldType: "Miscellaneous butt / fillet weld",
  codeRef: "ASME IX · UW-12",
  groove: true,
  note: "generic butt joint",
};

export function weldFamily(part: string, itemCode = ""): Family {
  const p = `${part} ${itemCode}`.toLowerCase();
  if (/tube.?sheet/.test(p)) {
    return {
      weldType: "Tubesheet to shell / channel",
      codeRef: "TEMA RCB-9 · ASME UW-13",
      groove: true,
      note: "girth butt joint at the tubesheet",
    };
  }
  if (/^tube|tubes\b/.test(p)) {
    return {
      weldType: "Tube to tubesheet",
      codeRef: "TEMA RCB-9.2",
      groove: false,
      note: "strength weld, two ends per tube",
    };
  }
  if (/nozzle|manway/.test(p)) {
    return {
      weldType: "Nozzle / manway to shell",
      codeRef: "ASME UW-16 · UG-37",
      groove: true,
      note: "full-penetration branch connection",
    };
  }
  if (/flange/.test(p)) {
    return {
      weldType: "Flange to neck / shell",
      codeRef: "ASME UW-21",
      groove: true,
      note: "butt or fillet at the girth flange",
    };
  }
  if (/shell/.test(p)) {
    return {
      weldType: "Shell longitudinal & circumferential seam",
      codeRef: "ASME UW-12 type 1",
      groove: true,
      note: "main pressure seam",
    };
  }
  if (/head|cover|bonnet/.test(p)) {
    return {
      weldType: "Head / cover to shell",
      codeRef: "ASME UW-12 type 1",
      groove: true,
      note: "head-to-shell butt joint",
    };
  }
  if (/baffle|tray|partition|impingement/.test(p)) {
    return {
      weldType: "Internal attachment (fillet)",
      codeRef: "ASME UW-18",
      groove: false,
      note: "fillet, no groove preparation",
    };
  }
  if (/support|saddle|skirt|leg|lug|ring|structure|stiffener/.test(p)) {
    return {
      weldType: "Structural attachment (fillet)",
      codeRef: "ASME UW-18 · AISC",
      groove: false,
      note: "continuous fillet at the attachment",
    };
  }
  return FALLBACK;
}

/** the layers of one joint: TIG root, then fill and cap by process */
export function weldLayers(t: number, prep: JointPrep, s: WeldSettings, groove: boolean): WeldLayer[] {
  if (!groove) {
    // fillet: single pass groups, still a TIG root where the detail allows it
    const leg = Math.max(4, Math.min(12, t * 0.7));
    const area = 0.5 * leg * leg;
    const rootMass = massPerM(area * 0.25);
    const fillMass = massPerM(area * 0.75);
    return [
      {
        layer: "Root (fillet)",
        process: s.rootProcess,
        passes: 1,
        massPerM: rootMass,
        hoursPerM: rootMass / DEPOSITION[s.rootProcess],
      },
      {
        layer: "Fill + cap (fillet)",
        process: s.fillProcessThin,
        passes: Math.max(1, Math.ceil(leg / PASS_THK[s.fillProcessThin])),
        massPerM: fillMass,
        hoursPerM: fillMass / DEPOSITION[s.fillProcessThin],
      },
    ];
  }

  const area = grooveArea(t, prep);
  const rootDepth = Math.min(3, t * 0.35);
  const rootArea = grooveArea(rootDepth, prep === "Square" ? "Square" : "Single V");
  const rootMass = massPerM(rootArea);
  const fillMass = Math.max(0, massPerM(area - rootArea));
  const fillProcess = t <= s.thickThreshold ? s.fillProcessThin : s.fillProcessThick;
  const fillDepth = Math.max(1, t - rootDepth);
  const passes = Math.max(1, Math.ceil(fillDepth / PASS_THK[fillProcess]));

  return [
    {
      layer: `Root (${s.rootProcess})`,
      process: s.rootProcess,
      passes: 1,
      massPerM: rootMass,
      hoursPerM: rootMass / DEPOSITION[s.rootProcess],
    },
    {
      layer: `Fill + cap (${fillProcess})`,
      process: fillProcess,
      passes,
      massPerM: fillMass,
      hoursPerM: fillMass / DEPOSITION[fillProcess],
    },
  ];
}

/**
 * Back-gouge method for one equipment: manual on small shells, machine on large.
 *
 * Shop rule: every double V joint is back-gouged after the first (inner) side is
 * welded and before the second (outer) side starts. A single V is back-gouged
 * the same way once the plate is thick enough to need full penetration from
 * both faces; square groove and thin plate are not gouged at all.
 */
export function gougeFor(eq: Equipment, t: number, prep: JointPrep, s: WeldSettings): GougeMethod {
  if (prep === "Square") return "None";
  if (prep === "Single V" && t <= 8) return "None"; // single pass, no back gouge needed
  const dia = Math.max(eq.diameter || 0, eq.he ? designExchanger(eq.he).shellId : 0);
  if (s.gougeMethod !== "Auto") return s.gougeMethod;
  return dia >= s.gougeAutoDia ? "Machine grinding" : "Manual grinding";
}

/** layer build-up text for a row */
export const layerText = (layers: WeldLayer[]) =>
  layers
    .map((l) => `${l.passes} × ${l.process} ${l.layer.includes("Root") ? "root" : "fill/cap"}`)
    .join(" · ");

/** manhours per metre of joint, layers + fit-up + back gouge */
export function hoursPerMetre(
  t: number,
  prep: JointPrep,
  gouge: GougeMethod,
  layers: WeldLayer[],
  s: WeldSettings,
): number {
  const weld = layers.reduce((a, l) => a + l.hoursPerM, 0);
  // a double V is gouged back to the root of the first side, roughly half the plate
  const depth = prep === "Double V" ? t / 2 : t;
  const gougeH =
    gouge === "Manual grinding"
      ? (depth / 10) * s.manualGougeRate
      : gouge === "Machine grinding"
        ? (depth / 10) * s.machineGougeRate
        : 0;
  return weld + s.fitUp + gougeH;
}

// ---------------------------------------------------------------------------
// One equipment → weld schedule
// ---------------------------------------------------------------------------

export function weldSchedule(eq: Equipment, items: BomItem[], rates: RateBook): WeldRow[] {
  const s = rates.weld ?? DEFAULT_WELD;
  const rows: WeldRow[] = [];

  for (const it of items) {
    const metres = it.weldLength ?? 0;
    if (metres <= 0.01) continue;
    const fam = weldFamily(it.partLabel, it.itemCode);
    const t = it.thickness ?? (eq.he ? 12 : eq.shellThk || 12);
    const prep = fam.groove ? jointPrep(t, s) : "Square";
    const gouge = fam.groove ? gougeFor(eq, t, prep, s) : "None";
    const layers = weldLayers(t, prep, s, fam.groove);
    const hpm = hoursPerMetre(t, prep, gouge, layers, s);
    rows.push({
      key: `${eq.id}-${it.partKey}-${it.itemCode}`,
      equipmentId: eq.id,
      tag: eq.tag,
      equipment: eq.name,
      part: it.partLabel,
      weldType: fam.weldType,
      codeRef: fam.codeRef,
      thickness: t,
      prep,
      gouge,
      layerText: layerText(layers),
      layers,
      metres,
      hoursPerM: hpm,
      hours: hpm * metres,
      cost: hpm * metres * s.shopRate,
      note:
        prep === "Double V"
          ? `${fam.note} · root welded from the inside, back-gouged, then welded from the outside`
          : fam.note,
    });
  }

  // tube-to-tubesheet strength welds are counted per tube end, not as seam length
  if (eq.he) {
    const d = designExchanger(eq.he);
    if (d.tubesTotal > 0 && d.spec.kind !== "fired-heater") {
      const metres = d.tubesTotal * 2 * Math.PI * (d.spec.tubeOd / 1000);
      const t = d.spec.tubeThk;
      const prep = "Square";
      const layers = weldLayers(t, "Square", s, false);
      const handling = d.tubesTotal * 2 * 0.06; // roll + tack + weld per end
      const hpm = hoursPerMetre(t, "Square", "None", layers, s);
      rows.push({
        key: `${eq.id}-tube-weld`,
        equipmentId: eq.id,
        tag: eq.tag,
        equipment: eq.name,
        part: "Tubes",
        weldType: "Tube to tubesheet",
        codeRef: "TEMA RCB-9.2",
        thickness: t,
        prep,
        gouge: "None",
        layerText: layerText(layers),
        layers,
        metres,
        hoursPerM: hpm,
        hours: hpm * metres + handling,
        cost: (hpm * metres + handling) * s.shopRate,
        note: `${d.tubesTotal} tubes × 2 ends, rolled + sealed weld`,
      });
    }
  }

  return rows;
}

export function weldSummary(eq: Equipment, items: BomItem[], rates: RateBook): WeldSummary {
  const rows = weldSchedule(eq, items, rates);
  const byMap = new Map<WeldProcess, { hours: number; mass: number }>();
  for (const r of rows) {
    for (const l of r.layers) {
      const cur = byMap.get(l.process) ?? { hours: 0, mass: 0 };
      byMap.set(l.process, {
        hours: cur.hours + l.hoursPerM * r.metres,
        mass: cur.mass + l.massPerM * r.metres,
      });
    }
  }
  const prepMap = new Map<JointPrep, { metres: number; hours: number }>();
  for (const r of rows) {
    const cur = prepMap.get(r.prep) ?? { metres: 0, hours: 0 };
    prepMap.set(r.prep, { metres: cur.metres + r.metres, hours: cur.hours + r.hours });
  }
  return {
    rows,
    hours: rows.reduce((a, r) => a + r.hours, 0),
    cost: rows.reduce((a, r) => a + r.cost, 0),
    metres: rows.reduce((a, r) => a + r.metres, 0),
    gougeMetres: rows.filter((r) => r.gouge !== "None").reduce((a, r) => a + r.metres, 0),
    byProcess: [...byMap.entries()].map(([process, v]) => ({ process, ...v })),
    byPrep: [...prepMap.entries()].map(([prep, v]) => ({ prep, ...v })),
    shopRate: (rates.weld ?? DEFAULT_WELD).shopRate,
  };
}

/** welding cost of one equipment — the figure the price roll-up uses */
export function weldingCost(eq: Equipment, items: BomItem[], rates: RateBook): number {
  return weldSummary(eq, items, rates).cost;
}
