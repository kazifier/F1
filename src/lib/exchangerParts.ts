// ---------------------------------------------------------------------------
// Heat exchanger part sheet + BOM.
//
// One place that turns the TEMA/ASME design (./tema) into the procurement
// components the BOQ carries for a shell & tube exchanger, with quantity, unit,
// weight, weld length and the code clause each line comes from.
//
// Three mechanical families are handled:
//   shell-tube / bayonet  the 20-row TEMA component sheet
//   kettle                K shell — the shell line carries the enlarged kettle
//   fired-heater          coil, casing, refractory, burners, stack (API 560)
// ---------------------------------------------------------------------------

import type { BomItem, ItemCategory } from "./bom";
import { JOINT_LABEL } from "./exchangerClass";
import { NECK_PIPE, nozzleJoints } from "./nozzleDetail";
import { materialByName } from "./catalog";
import {
  defaultExchangerNozzles,
  designExchanger,
  flangeClassFor,
  type ExchangerDesign,
  type ExchangerSpec,
} from "./tema";
import type { Equipment, HeNozzleRow, RateBook } from "./types";
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

/** fired heater sheet — replaces the TEMA components for kind = fired-heater */
export const HEATER_COMPONENTS = [
  "Radiant coil tubes",
  "Return bends",
  "Tube supports",
  "Radiant casing",
  "Refractory lining",
  "Convection coil",
  "Convection casing",
  "Burners",
  "Stack & breeching",
  "Air preheater",
  "Coil guides",
  "Ladders & platforms",
] as const;

const mmToM = (v: number) => v / 1000;

/** kg for a plate of area (m²) and thickness (mm) */
const plateKg = (areaM2: number, thk: number, mat: string) =>
  areaM2 * mmToM(thk) * (materialByName(mat).density || 7850);

/** the component sheet for one exchanger, whichever family it belongs to */
export function exchangerComponents(eq: Equipment, design?: ExchangerDesign): HeComponent[] {
  const spec = eq.he;
  if (!spec) return [];
  const d = design ?? designExchanger(spec);
  if (d.kind === "fired-heater") return heaterComponents(eq, d);
  const shells = d.spec.shells;
  const fixed = d.mech === "fixed";
  const hairpin = d.mech === "hairpin";
  const tsCount = Math.max(1, d.tubesheetCount);
  const rating = flangeClassFor(Math.max(spec.shellPressure, spec.tubePressure), Math.max(spec.shellTemp, spec.tubeTemp));
  const D = d.shellId;
  const L = spec.tubeLength;
  const headArea = 1.084 * Math.pow(mmToM(D), 2);
  const extra = (name: string) => Number(eq.heExtras?.[name]?.qty) || 0;
  const nozzles = eq.heNozzles ?? defaultExchangerNozzles(spec, d);

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
      detail:
        d.kind === "kettle"
          ? `Kettle shell Ø${D} × ${d.shellThk} mm — enlarged over the ${Math.round(d.bundleDia)} mm bundle for vapour disengagement`
          : `Ø${D} × ${d.shellThk} mm × ${L} mm long, TEMA shell type ${spec.tema[1] ?? "E"}`,
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
      qty: d.tubesTotal * (hairpin ? 2 : 1),
      weight: tubesW,
      weld: 0,
      category: "Pipe",
      material: spec.tubeMat,
      thickness: spec.tubeThk,
      derived: true,
      detail: `${spec.tubeOd} OD × ${spec.tubeThk} mm × ${mmToM(hairpin ? L * 2 : L).toFixed(2)} m, ${spec.pattern}° ${spec.pitch} mm pitch, ${spec.tubePasses} pass${hairpin ? " — hairpin element, two legs per tube" : ""} · ${JOINT_LABEL[d.tubeJoint]}`,
    },
    {
      key: "Stationary tubesheet",
      label: "Stationary tubesheet",
      unit: "no",
      qty: shells,
      weight: tsW / tsCount,
      weld: shells * 1.5,
      category: "Plate",
      material: spec.tubesheetMat,
      thickness: d.tubesheetThk,
      derived: true,
      detail: `${d.tubesheetThk} mm — TEMA RCB-7.2 ${d.tubesheetTema.toFixed(1)} / UG-34 ${d.tubesheetUg34.toFixed(1)} mm, ${d.tubesheetCount} sheet${d.tubesheetCount === 1 ? "" : "s"} per shell`,
    },
    {
      key: "Floating tubesheet",
      label: "Floating tubesheet",
      unit: "no",
      qty: d.mech === "floating" ? shells : 0,
      weight: d.mech === "floating" ? tsW / tsCount : 0,
      weld: 0,
      category: "Plate",
      material: spec.tubesheetMat,
      thickness: d.tubesheetThk,
      derived: true,
      detail:
        d.mech === "floating"
          ? `${d.tubesheetThk} mm floating tubesheet, TEMA S/T rear head`
          : d.mech === "fixed"
            ? "not applicable — fixed tubesheet (TEMA M/N)"
            : `not applicable — ${d.mech} bundle carries one tubesheet`,
    },
    {
      key: "Floating head cover",
      label: "Floating head cover",
      unit: "no",
      qty: fixed || d.tubesheetCount === 1 ? 0 : shells,
      weight: fixed || d.tubesheetCount === 1 ? 0 : plateKg(headArea * 0.55, d.headThk, spec.shellMat) * shells,
      weld: fixed || d.tubesheetCount === 1 ? 0 : shells * Math.PI * mmToM(D + 40),
      category: "Plate",
      material: spec.shellMat,
      thickness: d.headThk,
      derived: true,
      detail: fixed
        ? "not applicable — fixed tubesheet"
        : d.tubesheetCount === 1
          ? "not applicable — U-tube / hairpin bundle, one tubesheet"
          : "TEMA S/T rear head with backing device",
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
      qty: nozzles.reduce((a, n) => a + n.qty, 0) * shells,
      weight: nozzleW,
      weld: shells * nozzles.reduce((a, n) => a + n.qty, 0) * 0.55,
      category: "Pipe",
      material: spec.shellMat,
      derived: true,
      detail: `${nozzles.length} marks (${nozzles.map((n) => n.mark).join(", ")}) at ${rating}, TEMA RG-6.4 sizes`,
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

/** API 560 fired heater sheet — coil, casing, refractory, burners, stack */
function heaterComponents(eq: Equipment, d: ExchangerDesign): HeComponent[] {
  const spec = eq.he!;
  const h = d.heater!;
  const extra = (name: string) => Number(eq.heExtras?.[name]?.qty) || 0;
  const casingT = 6;
  const casingKg = plateKg(h.casingArea, casingT, "SA-516 Gr.70");
  const refractoryKg = h.refractoryArea * 0.075 * 2200; // 75 mm ceramic fibre blanket
  const convectionTubes = Math.max(8, Math.round(h.coilTubes * 0.28));
  const convectionKg =
    convectionTubes * Math.PI * mmToM(spec.tubeOd - h.coilWall) * mmToM(h.coilWall) * mmToM(h.tubeLength) * 7850;

  const rows: Array<HeComponent> = [
    {
      key: "Radiant coil tubes",
      label: "Radiant coil tubes",
      unit: "no",
      qty: h.coilTubes,
      weight: h.coilWeight,
      weld: h.coilTubes * Math.PI * mmToM(spec.tubeOd) * 2,
      category: "Pipe",
      material: spec.tubeMat,
      thickness: h.coilWall,
      derived: true,
      detail: `${spec.tubeOd} OD × ${h.coilWall.toFixed(1)} mm, ${mmToM(h.tubeLength).toFixed(2)} m per tube, API 560 coil`,
    },
    {
      key: "Return bends",
      label: "Return bends",
      unit: "no",
      qty: h.returnBends,
      weight: h.returnBends * 4.5,
      weld: h.returnBends * 2 * Math.PI * mmToM(spec.tubeOd),
      category: "Fitting",
      material: spec.tubeMat,
      thickness: h.coilWall,
      derived: true,
      detail: `180° forged return bends, ${h.coilWall.toFixed(1)} mm wall, welded to the coil`,
    },
    {
      key: "Tube supports",
      label: "Tube supports",
      unit: "no",
      qty: Math.max(6, Math.round(h.tubeLength / 1500) * 2),
      weight: 0.35 * Math.max(6, Math.round(h.tubeLength / 1500) * 2) * 60,
      weld: Math.max(6, Math.round(h.tubeLength / 1500) * 2) * 1.6,
      category: "Structure",
      material: "SA-240 Gr.304",
      thickness: 12,
      derived: true,
      detail: "Cast / fabricated tube supports on 1.5 m pitch",
    },
    {
      key: "Radiant casing",
      label: "Radiant casing",
      unit: "m²",
      qty: Math.round(h.casingArea),
      weight: casingKg,
      weld: h.casingArea * 4,
      category: "Plate",
      material: "SA-516 Gr.70",
      thickness: casingT,
      derived: true,
      detail: `${Math.round(h.casingArea)} m² of ${casingT} mm casing plate with stiffeners`,
    },
    {
      key: "Refractory lining",
      label: "Refractory lining",
      unit: "m²",
      qty: Math.round(h.refractoryArea),
      weight: refractoryKg,
      weld: 0,
      category: "Consumable",
      material: "Ceramic fibre 75 mm",
      thickness: 75,
      derived: true,
      detail: `${Math.round(h.refractoryArea)} m² of 75 mm ceramic fibre + castable at the burner throat`,
    },
    {
      key: "Convection coil",
      label: "Convection coil",
      unit: "no",
      qty: convectionTubes,
      weight: convectionKg,
      weld: convectionTubes * Math.PI * mmToM(spec.tubeOd) * 2,
      category: "Pipe",
      material: spec.tubeMat,
      thickness: h.coilWall,
      derived: true,
      detail: `${convectionTubes} bare / studded convection tubes, ${mmToM(h.tubeLength).toFixed(2)} m`,
    },
    {
      key: "Convection casing",
      label: "Convection casing",
      unit: "m²",
      qty: Math.round(h.casingArea * 0.4),
      weight: casingKg * 0.4,
      weld: h.casingArea * 1.6,
      category: "Plate",
      material: "SA-516 Gr.70",
      thickness: casingT,
      derived: true,
      detail: "Convection section casing and transition duct",
    },
    {
      key: "Burners",
      label: "Burners",
      unit: "no",
      qty: h.burners + extra("Burners"),
      weight: (h.burners + extra("Burners")) * 180,
      weld: 0,
      category: "Fitting",
      material: "Burner assembly",
      derived: true,
      detail: `${h.burners} × ${Math.round(h.burnerDuty)} kW forced-draft burners (API 560)`,
    },
    {
      key: "Stack & breeching",
      label: "Stack & breeching",
      unit: "no",
      qty: 1,
      weight: plateKg(Math.PI * mmToM(h.stackDia) * mmToM(h.stackHeight), 6, "SA-516 Gr.70") + 900,
      weld: 2 * Math.PI * mmToM(h.stackDia) * 3,
      category: "Plate",
      material: "SA-516 Gr.70",
      thickness: 6,
      derived: true,
      detail: `Ø${h.stackDia} mm stack, ${(h.stackHeight / 1000).toFixed(1)} m with breeching and damper`,
    },
    {
      key: "Air preheater",
      label: "Air preheater",
      unit: "no",
      qty: extra("Air preheater"),
      weight: 0,
      weld: 0,
      category: "Fitting",
      material: "Air preheater",
      derived: false,
      detail: "estimator input — add when the specification calls for flue-gas heat recovery",
    },
    {
      key: "Coil guides",
      label: "Coil guides",
      unit: "no",
      qty: Math.max(4, Math.round(h.coilTubes / 12)),
      weight: Math.max(4, Math.round(h.coilTubes / 12)) * 22,
      weld: Math.max(4, Math.round(h.coilTubes / 12)) * 0.9,
      category: "Structure",
      material: "IS 2062 E250",
      derived: true,
      detail: "Coil guide clips and end supports",
    },
    {
      key: "Ladders & platforms",
      label: "Ladders & platforms",
      unit: "no",
      qty: extra("Ladders & platforms"),
      weight: 0,
      weld: 0,
      category: "Structure",
      material: "IS 2062 E250",
      derived: false,
      detail: "estimator input — burner access and stack platform",
    },
  ];

  return rows;
}

/** BOM lines for one exchanger, priced with the project rate book */
export function buildExchangerBom(eq: Equipment, rates: RateBook): BomItem[] {
  if (!eq.he) return [];
  const design = designExchanger(eq.he);
  const components = exchangerComponents(eq, design);
  const items: BomItem[] = [];
  for (const c of components) {
    if (c.qty <= 0 || c.weight <= 0) continue;
    const rate = rates.materialRate[c.material] ?? materialByName(c.material).rate;
    const surfaceArea =
      c.key === "Shell" || c.key === "Shell cover"
        ? Math.PI * mmToM(design.shellId) * mmToM(eq.he.tubeLength) * eq.he.shells
        : c.key === "Channel shell"
          ? Math.PI * mmToM(design.shellId) * 0.55 * mmToM(design.shellId) * eq.he.shells
          : c.key === "Radiant casing" || c.key === "Convection casing"
            ? c.qty
            : undefined;
    // net cut length for stock-length pipe and tube (wastage is taken off this)
    const netLength =
      c.key === "Tubes"
        ? c.qty * mmToM(eq.he.tubeLength * (design.mech === "hairpin" ? 2 : 1))
        : c.key === "Radiant coil tubes" || c.key === "Convection coil"
          ? c.qty * mmToM(eq.he.tubeLength)
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
      netLength,
      thickness: c.thickness,
      weldLength: c.weld,
      surfaceArea,
      rate,
      amount: c.weight * rate,
    });
  }

  // SRN marks are their own BOQ item: the self-reinforced neck carries the
  // opening, so procurement gets one line with dimensions and mass per mark
  // rather than a lump sum inside the "Nozzles" component.
  const shells = eq.he.shells;
  const srn = nozzleJoints(eq).filter((j) => j.type === "SRN");
  if (srn.length > 0) {
    const rate = rates.materialRate[NECK_PIPE] ?? materialByName(NECK_PIPE).rate;
    let srnKg = 0;
    let srnQty = 0;
    for (const j of srn) {
      const qty = j.qty * shells;
      const weight = j.weight * qty;
      srnKg += weight;
      srnQty += qty;
      items.push({
        uid: `${eq.id}-SRN-${j.mark}`,
        equipmentId: eq.id,
        equipmentTag: eq.tag,
        equipmentName: eq.name,
        partKey: "nozzle",
        partLabel: "SRN nozzle (forging)",
        itemCode: `${eq.tag}/SRN-${j.mark}`,
        category: "Fitting",
        description: `SRN nozzle ${j.mark} ${j.size} ${j.flange.rating} — one-piece forging, no pipe or RF pad`,
        material: j.forging.material,
        qty,
        unit: "no",
        spec: `forged · H ${j.forging.height.toFixed(0)} mm to RF face · neck Ø${j.forging.neckOd.toFixed(1)} × ${j.forging.neckThk.toFixed(1)} mm · flange Ø${j.forging.flangeOd.toFixed(0)} × ${j.forging.flangeThk.toFixed(1)} thk · ${j.forging.weight.toFixed(1)} kg/joint`,
        weight,
        thickness: j.forging.neckThk,
        weldLength: Math.PI * mmToM(j.neck.od) * 2 * qty,
        rate,
        amount: weight * rate,
      });
    }
    const agg = items.find((i) => i.partKey === "Nozzles");
    if (agg) {
      agg.qty = Math.max(0, agg.qty - srnQty);
      agg.weight = Math.max(0, agg.weight - srnKg);
      agg.amount = agg.weight * agg.rate;
      agg.description = `${agg.description} — ${srnQty} SRN mark${srnQty === 1 ? "" : "s"} listed separately`;
    }
  }
  return items;
}

/** datasheet item → estimator equipment (header + TEMA spec, no vessel part rows) */
export function exchangerToEquipment(u: ExchangerUnit): Equipment {
  const spec: ExchangerSpec = {
    tema: u.tema,
    kind: u.kind,
    mech: u.mech,
    orientation: u.orientation,
    support: u.support,
    tubeJoint: u.tubeJoint,
    criticality: u.criticality,
    criticalityNote: u.criticalityNote,
    features: u.features,
    maxBundleKg: u.maxBundleKg,
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
  const nozzles: HeNozzleRow[] = defaultExchangerNozzles(spec, design);
  // built by hand rather than newEquipment(): an exchanger has its own sheet
  const eq: Equipment = {
    id: `he-${u.tag}`,
    type: u.kind === "fired-heater" ? "Fired Heater" : "Heat Exchanger",
    tag: u.tag,
    name: u.name,
    service: u.service,
    qty: 1,
    orientation: u.tubeLength > 10000 ? "Vertical" : "Horizontal",
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
    heNozzles: nozzles,
  };
  return eq;
}

/** whole exchanger scope, 31 items */
export const buildExchangerScope = (units: ExchangerUnit[]) => units.map(exchangerToEquipment);

/** existing equipment rebuilt from the datasheet, keeping its id */
export function refreshExchanger(from: ExchangerUnit, id: string): Equipment {
  return { ...exchangerToEquipment(from), id };
}
