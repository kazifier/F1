// ---------------------------------------------------------------------------
// Heat exchanger part sheet + BOM.
//
// One place that turns the TEMA/ASME design (./tema) into the 20 procurement
// components the legacy BOQ carries for a shell & tube exchanger, with quantity,
// unit, weight, weld length and the code clause each line comes from.
// ---------------------------------------------------------------------------

import type { BomItem, ItemCategory } from "./bom";
import { materialByName } from "./catalog";
import { flangeClass, designExchanger, type ExchangerDesign, type ExchangerSpec } from "./tema";
import type { Equipment, RateBook } from "./types";
import type { ExchangerUnit } from "../data/exchangers";

export interface HeComponent {
  key: string;
  label: string;
  unit: string;
  qty: number;
  weight: number; // kg, total for the item (all shells)
  weld: number; // m of weld
  category: ItemCategory;
  material: string;
  thickness?: number;
  /** from the TEMA/ASME design rather than estimator input */
  derived: boolean;
  detail: string;
}

export const HE_COMPONENTS = [
  "Shell",
  "Shell cover",
  "Channel shell",
  "Channel head",
  "Channel cover",
  "Tubes",
  "Stationary tubesheet",
  "Floating tubesheet",
  "Floating head cover",
  "Cross baffles",
  "Tie rods",
  "Spacers",
  "Girth flanges",
  "Nozzles",
  "Saddle supports",
  "Impingement plate",
  "Pass partition plates",
  "Expansion joint",
  "Lifting lugs",
  "Test ring / misc",
] as const;
export type HeComponentName = (typeof HE_COMPONENTS)[number];

const mmToM = (v: number) => v / 1000;

/** kg for a plate of area (m²) and thickness (mm) */
const plateKg = (areaM2: number, thk: number, mat: string) =>
  areaM2 * mmToM(thk) * (materialByName(mat).density || 7850);

/** the 20-row component sheet for one exchanger */
export function exchangerComponents(eq: Equipment, design?: ExchangerDesign): HeComponent[] {
  const spec = eq.he;
  if (!spec) return [];
  const d = design ?? designExchanger(spec);
  const shells = d.spec.shells;
  const fixed = d.fixedTubesheet;
  const rating = flangeClass(Math.max(spec.shellPressure, spec.tubePressure));
  const D = d.shellId;
  const L = spec.tubeLength;
  const headArea = 1.084 * Math.pow(mmToM(D), 2);
  const extra = (name: string) => Number(eq.heExtras?.[name]?.qty) || 0;

  const shellW = d.weights.shell * shells;
  const channelW = d.weights.channel * shells;
  const headW = (d.weights.heads / 3) * shells;
  const tubesW = d.weights.tubes;
  const tsW = d.weights.tubesheets * shells;
  const baffleW = d.weights.baffles * shells;
  const nozzleW = d.weights.nozzles * shells;

  const flangeKg = Math.max(40, plateKg((Math.PI / 4) * Math.pow(mmToM(D + 140), 2) * 0.35, 60, spec.shellMat));
  const saddleKg = 0.18 * Math.max(60, d.weights.shell);

  const rows: Array<Omit<HeComponent, "derived" | "detail"> & { derived?: boolean; detail?: string }> = [
    {
      key: "Shell",
      label: "Shell",
      unit: "no",
      qty: shells,
      weight: shellW,
      weld: shells * (Math.PI * mmToM(D + d.shellThk) * 2 + mmToM(L)),
      category: "Plate",
      material: spec.shellMat,
      thickness: d.shellThk,
      derived: true,
      detail: `Ø${D} × ${d.shellThk} mm × ${L} mm long, TEMA shell type ${spec.tema[1] ?? "E"}`,
    },
    {
      key: "Shell cover",
      label: "Shell cover",
      unit: "no",
      qty: shells,
      weight: headW,
      weld: shells * Math.PI * mmToM(D),
      category: "Plate",
      material: spec.shellMat,
      thickness: d.headThk,
      derived: true,
      detail: `2:1 ellipsoidal, ${d.headThk} mm (ASME UG-32(d))`,
    },
    {
      key: "Channel shell",
      label: "Channel shell",
      unit: "no",
      qty: shells,
      weight: channelW,
      weld: shells * Math.PI * mmToM(D + d.channelThk) * 1.5,
      category: "Plate",
      material: spec.channelMat,
      thickness: d.channelThk,
      derived: true,
      detail: `Ø${D} × ${d.channelThk} mm, design ${Math.max(spec.shellPressure, spec.tubePressure)} kPa(g)`,
    },
    {
      key: "Channel head",
      label: "Channel head",
      unit: "no",
      qty: shells,
      weight: headW,
      weld: shells * Math.PI * mmToM(D),
      category: "Plate",
      material: spec.channelMat,
      thickness: d.headThk,
      derived: true,
      detail: "Bonnet / removable channel head, 2:1 ellipsoidal",
    },
    {
      key: "Channel cover",
      label: "Channel cover",
      unit: "no",
      qty: shells,
      weight: headW * 0.9,
      weld: 0,
      category: "Plate",
      material: spec.channelMat,
      thickness: d.headThk,
      derived: true,
      detail: `Flanged cover ${rating} at ${Math.max(spec.shellPressure, spec.tubePressure)} kPa(g)`,
    },
    {
      key: "Tubes",
      label: "Tubes",
      unit: "no",
      qty: d.tubesTotal,
      weight: tubesW,
      weld: 0,
      category: "Pipe",
      material: spec.tubeMat,
      thickness: spec.tubeThk,
      derived: true,
      detail: `${spec.tubeOd} OD × ${spec.tubeThk} mm × ${mmToM(L).toFixed(2)} m, ${spec.pattern}° ${spec.pitch} mm pitch, ${spec.tubePasses} pass`,
    },
    {
      key: "Stationary tubesheet",
      label: "Stationary tubesheet",
      unit: "no",
      qty: shells,
      weight: tsW / 2,
      weld: 0,
      category: "Plate",
      material: spec.tubesheetMat,
      thickness: d.tubesheetThk,
      derived: true,
      detail: `${d.tubesheetThk} mm per TEMA RCB-7.2`,
    },
    {
      key: "Floating tubesheet",
      label: "Floating tubesheet",
      unit: "no",
      qty: fixed ? 0 : shells,
      weight: fixed ? 0 : tsW / 2,
      weld: 0,
      category: "Plate",
      material: spec.tubesheetMat,
      thickness: d.tubesheetThk,
      derived: true,
      detail: fixed ? "not applicable — fixed tubesheet (TEMA M/N)" : `${d.tubesheetThk} mm, floating head`,
    },
    {
      key: "Floating head cover",
      label: "Floating head cover",
      unit: "no",
      qty: fixed ? 0 : shells,
      weight: fixed ? 0 : plateKg(headArea * 0.55, d.headThk, spec.shellMat) * shells,
      weld: fixed ? 0 : shells * Math.PI * mmToM(D + 40),
      category: "Plate",
      material: spec.shellMat,
      thickness: d.headThk,
      derived: true,
      detail: fixed ? "not applicable — fixed tubesheet" : "TEMA S/T rear head with backing device",
    },
    {
      key: "Cross baffles",
      label: "Cross baffles",
      unit: "no",
      qty: d.baffleCount * shells,
      weight: baffleW,
      weld: 0,
      category: "Plate",
      material: spec.shellMat,
      thickness: Math.max(6, spec.tubeOd * 0.3),
      derived: true,
      detail: `${d.baffleCut}% cut, ${d.baffleSpacing} mm c/c (TEMA RG-7.11)`,
    },
    {
      key: "Tie rods",
      label: "Tie rods",
      unit: "no",
      qty: d.tieRods * shells,
      weight: shells * (Math.PI / 4) * Math.pow(mmToM(12.7), 2) * mmToM(L) * 7850 * d.tieRods,
      weld: 0,
      category: "Structure",
      material: "IS 2062 E250",
      derived: true,
      detail: `${d.tieRods} × 12.7 mm rods (TEMA RCB-4.7)`,
    },
    {
      key: "Spacers",
      label: "Spacers",
      unit: "no",
      qty: Math.max(0, d.baffleCount - 1) * shells,
      weight: shells * 0.35 * Math.max(0, d.baffleCount - 1) * d.tieRods,
      weld: 0,
      category: "Structure",
      material: "IS 2062 E250",
      derived: true,
      detail: `${d.baffleCount - 1} spacer sleeves per rod`,
    },
    {
      key: "Girth flanges",
      label: "Girth flanges",
      unit: "no",
      qty: 2 * shells,
      weight: flangeKg * 2 * shells,
      weld: shells * Math.PI * mmToM(D + 60) * 2,
      category: "Flange",
      material: spec.channelMat,
      thickness: 60,
      derived: true,
      detail: `ASME B16.5 / B16.47 ${rating} girth joints`,
    },
    {
      key: "Nozzles",
      label: "Nozzles",
      unit: "no",
      qty: 6 * shells,
      weight: nozzleW,
      weld: shells * 6 * 0.55,
      category: "Pipe",
      material: spec.shellMat,
      derived: true,
      detail: `2 shell / 2 channel / vent + drain, ${rating}, with flanges, gaskets and bolting`,
    },
    {
      key: "Saddle supports",
      label: "Saddle supports",
      unit: "no",
      qty: 2 * shells,
      weight: saddleKg * 2 * shells,
      weld: shells * 4,
      category: "Structure",
      material: "IS 2062 E250",
      derived: true,
      detail: "Two saddles per shell, fixed + sliding",
    },
    {
      key: "Impingement plate",
      label: "Impingement plate",
      unit: "no",
      qty: shells,
      weight: shells * plateKg((Math.PI / 4) * Math.pow(mmToM(D * 0.45), 2), 8, spec.shellMat),
      weld: shells * 1.2,
      category: "Plate",
      material: spec.shellMat,
      thickness: 8,
      derived: true,
      detail: "TEMA RG-6.6 impingement protection at the inlet",
    },
    {
      key: "Pass partition plates",
      label: "Pass partition plates",
      unit: "no",
      qty: Math.max(1, spec.tubePasses - 1) * shells,
      weight: shells * plateKg(mmToM(D) * mmToM(L) * 0.8, 10, spec.shellMat) * Math.max(1, spec.tubePasses - 1),
      weld: shells * mmToM(L) * Math.max(1, spec.tubePasses - 1),
      category: "Plate",
      material: spec.shellMat,
      thickness: 10,
      derived: true,
      detail: `${spec.tubePasses} tube passes — ${spec.tubePasses - 1} partition plates`,
    },
    {
      key: "Expansion joint",
      label: "Expansion joint",
      unit: "no",
      qty: extra("Expansion joint"),
      weight: 0,
      weld: 0,
      category: "Structure",
      material: spec.shellMat,
      derived: false,
      detail: "estimator input — fixed tubesheet exchangers only",
    },
    {
      key: "Lifting lugs",
      label: "Lifting lugs",
      unit: "no",
      qty: extra("Lifting lugs"),
      weight: 0,
      weld: 0,
      category: "Structure",
      material: "IS 2062 E250",
      derived: false,
      detail: "estimator input — bundle pulling / erection",
    },
    {
      key: "Test ring / misc",
      label: "Test ring / misc",
      unit: "lot",
      qty: extra("Test ring / misc"),
      weight: 0,
      weld: 0,
      category: "Structure",
      material: "IS 2062 E250",
      derived: false,
      detail: "estimator input — test rings, nameplate, earthing",
    },
  ];

  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    unit: r.unit,
    qty: r.qty,
    weight: r.weight,
    weld: r.weld,
    category: r.category,
    material: r.material,
    thickness: r.thickness,
    derived: r.derived ?? false,
    detail: r.detail ?? "",
  }));
}

/** BOM lines for one exchanger, priced with the project rate book */
export function buildExchangerBom(eq: Equipment, rates: RateBook): BomItem[] {
  if (!eq.he) return [];
  const design = designExchanger(eq.he);
  const components = exchangerComponents(eq, design);
  const items: BomItem[] = [];
  for (const c of components) {
    if (c.qty <= 0 || c.weight <= 0) continue;
    const rate =
      rates.materialRate[c.material] ?? materialByName(c.material).rate;
    const surfaceArea =
      c.key === "Shell"
        ? Math.PI * mmToM(design.shellId) * mmToM(eq.he.tubeLength) * eq.he.shells
        : c.key === "Channel shell"
          ? Math.PI * mmToM(design.shellId) * 0.55 * mmToM(design.shellId) * eq.he.shells
          : undefined;
    items.push({
      uid: `${eq.id}-${c.key}`,
      equipmentId: eq.id,
      equipmentTag: eq.tag,
      equipmentName: eq.name,
      partKey: c.key,
      partLabel: c.label,
      itemCode: `${eq.tag}/${c.key.slice(0, 3).toUpperCase()}`,
      category: c.category,
      description: c.detail ? `${c.label} — ${c.detail}` : c.label,
      material: c.material,
      qty: c.qty,
      unit: c.unit,
      weight: c.weight,
      thickness: c.thickness,
      weldLength: c.weld,
      surfaceArea,
      rate,
      amount: c.weight * rate,
    });
  }
  return items;
}

/** datasheet item → estimator equipment (header + TEMA spec, no vessel part rows) */
export function exchangerToEquipment(u: ExchangerUnit): Equipment {
  const spec: ExchangerSpec = {
    tema: u.tema,
    shells: u.shells,
    surfaceM2: u.surfaceM2,
    tubeOd: u.tubeOd,
    tubeThk: u.tubeThk,
    pitch: u.pitch,
    pattern: u.pattern,
    tubeLength: u.tubeLength,
    tubePasses: u.tubePasses,
    shellPasses: u.shellPasses,
    shellPressure: Math.round(u.pShell * 98.0665),
    shellTemp: u.tShell,
    tubePressure: Math.round(u.pTube * 98.0665),
    tubeTemp: u.tTube,
    mdmt: u.mdmt,
    ca: u.ca,
    shellMat: u.shellMat,
    tubeMat: u.tubeMat,
    tubesheetMat: u.tubesheetMat,
    channelMat: u.channelMat,
    insulated: u.insulated,
  };
  const design = designExchanger(spec);
  // built by hand rather than newEquipment(): an exchanger has its own sheet
  const eq: Equipment = {
    id: `he-${u.tag}`,
    type: "Heat Exchanger",
    tag: u.tag,
    name: u.name,
    service: u.service,
    qty: 1,
    orientation: "Horizontal",
    diameter: design.shellId,
    ttLength: u.tubeLength,
    shellThk: design.shellThk,
    inspection: "3.2",
    designPressure: spec.shellPressure,
    designTemperature: spec.shellTemp,
    mdmt: spec.mdmt,
    corrosionAllowance: spec.ca,
    jointEfficiency: 1,
    headType: "2:1 Ellipsoidal",
    insulationThk: u.insulated ? (u.tShell > 200 ? 100 : 50) : 0,
    radiography: "Full RT",
    pWHT: spec.ca >= 6 || u.tShell > 400 ? "Yes" : "No",
    paintSystem: "Epoxy 2 coat",
    parts: {},
    he: spec,
    heExtras: {},
  };
  return eq;
}

/** whole exchanger scope, 31 items */
export const buildExchangerScope = (units: ExchangerUnit[]) => units.map(exchangerToEquipment);

/** existing equipment rebuilt from the datasheet, keeping its id */
export function refreshExchanger(from: ExchangerUnit, id: string): Equipment {
  return { ...exchangerToEquipment(from), id };
}