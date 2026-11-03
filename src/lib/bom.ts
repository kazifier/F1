// ---------------------------------------------------------------------------
// Weight take-off, BOM and cost build-up
// ---------------------------------------------------------------------------
import type { Equipment, PartRow, RateBook } from "./types";
import { materialByName, pipeOd, pipeWall, flangeMass, studSpec, MATERIALS, type StudSpec } from "./catalog";
import { PART_BY_KEY } from "./parts";

// All rates are in BHD (the facility currency). Every amount in the app is a
// net price — Bahrain VAT is never added to a total.
export const DEFAULT_RATES: RateBook = {
  materialRate: Object.fromEntries(MATERIALS.map((m) => [m.name, m.rate])),
  fabricationCmf: 0.516,
  fabricationSsf: 0.853,
  weldingRate: 2.8,
  testingRate: 1.137,
  pwhtRate: 0.184,
  paintingRate: 1.837,
  insulationRate: { "50": 4.155, "75": 5.468, "100": 7.0, "125": 8.53, "150": 10.061 },
  flangeRate: { "150": 1.312, "300": 1.487, "600": 1.75, "900": 2.056, "1500": 2.45, "2500": 3.062 },
  marginPct: 5,
  overheadPct: 8,
  profitPct: 10,
  freightPct: 2.5,
  vatPct: 10,
  vatIncluded: false,
  plateUtilisation: 0.82,
  plateWidth: 1250,
  plateLength: 2500,
};

export type ItemCategory =
  | "Plate"
  | "Pipe"
  | "Flange"
  | "Fitting"
  | "Structure"
  | "Consumable"
  | "Service";

export interface BomItem {
  uid: string;
  equipmentId: string;
  equipmentTag: string;
  equipmentName: string;
  partKey: string;
  partLabel: string;
  itemCode: string;
  category: ItemCategory;
  description: string;
  material: string;
  qty: number;
  /** spare quantity held on top of the installed quantity (fasteners) */
  qtySpare?: number;
  unit: string;
  /** dimension string for bought-out items, e.g. stud/nut sizes */
  spec?: string;
  weight: number; // total kg
  thickness?: number;
  plateArea?: number; // m2 (for nesting)
  structLength?: number; // m
  weldLength?: number; // m
  surfaceArea?: number; // m2
  rate: number;
  amount: number;
}

const n = (row: PartRow | undefined, key: string): number => {
  if (!row) return 0;
  const v = parseFloat(row[key]);
  return Number.isFinite(v) ? v : 0;
};
const s = (row: PartRow | undefined, key: string): string => (row?.[key] ?? "").toString().trim();

const mmToM = (v: number) => v / 1000;

/** blank plate area factor (flat-plate area / D^2) used for head costing */
export function headAreaFactor(type: string): number {
  switch (type) {
    case "Hemispherical":
      return 1.571;
    case "Flat (UG-34)":
      return 0.785;
    case "Torispherical (F&D)":
      return 0.918;
    case "Conical 60 deg":
      return 1.05;
    case "2:1 Ellipsoidal":
    default:
      return 1.084;
  }
}

export function plateMass(areaM2: number, thkMm: number, material: string) {
  const m = materialByName(material);
  return areaM2 * (thkMm / 1000) * m.density;
}

export function shellMass(diaMm: number, thkMm: number, lenMm: number, material: string) {
  const m = materialByName(material);
  const vol = Math.PI * (diaMm + thkMm) * thkMm * lenMm; // mm3
  return (vol / 1e9) * m.density;
}

export function pipeMass(od: number, wall: number, lenMm: number, material: string) {
  const m = materialByName(material);
  const vol = Math.PI * (od - wall) * wall * lenMm;
  return (vol / 1e9) * m.density;
}

export function flangeCountMass(nps: string, rating: string) {
  return flangeMass(nps, rating);
}

/** mass of one stud (kg) from Ø and length */
const studMass = (spec: StudSpec, density: number) =>
  (Math.PI / 4) * Math.pow(spec.diaMm / 1000, 2) * (spec.length / 1000) * density;

/** mass of one heavy hex nut (kg) — hexagon area 0.866·AF² */
const nutMass = (spec: StudSpec, density: number) =>
  0.866 * Math.pow(spec.nutAf / 1000, 2) * (spec.nutThk / 1000) * density;

// ---------------------------------------------------------------------------
// Main take-off for one equipment
// ---------------------------------------------------------------------------
export function buildEquipmentBom(eq: Equipment, rates: RateBook): BomItem[] {
  const items: BomItem[] = [];
  const push = (p: Omit<BomItem, "uid" | "equipmentId" | "equipmentTag" | "equipmentName" | "amount">) => {
    const mRate = rates.materialRate[p.material] ?? materialByName(p.material).rate;
    const rate = p.rate || mRate;
    items.push({
      ...p,
      uid: `${eq.id}-${p.itemCode}-${p.description}`,
      equipmentId: eq.id,
      equipmentTag: eq.tag,
      equipmentName: eq.name,
      amount: p.weight * rate,
    });
  };

  // studs + nuts are raised as separate procurement lines with installed
  // quantity, spare quantity and dimensions on each
  const pushFasteners = (o: {
    partKey: string;
    itemCode: string;
    joint: string;
    stud: StudSpec | null;
    sparePct: number;
    boltMat: string;
    nutMat: string;
    boltType: string;
  }) => {
    const st = o.stud;
    if (!st) return;
    const spare = Math.ceil((st.count * Math.max(0, o.sparePct)) / 100);
    const thread =
      o.boltType === "Metric" ? `M${Math.round(st.diaMm)}` : o.boltType === "BSW" ? `${st.dia}" BSW` : st.thread;
    const studKg = studMass(st, materialByName(o.boltMat).density);
    const nutKg = nutMass(st, materialByName(o.nutMat).density);
    push({
      partKey: o.partKey, partLabel: "Stud bolts", itemCode: `${o.itemCode}/SB`,
      category: "Consumable", description: `Studs — ${o.joint} (${st.count}/joint)`,
      material: o.boltMat, qty: st.count, qtySpare: spare, unit: "no",
      spec: `${thread} × ${st.length} lg`,
      weight: studKg * (st.count + spare), rate: 0,
    });
    push({
      partKey: o.partKey, partLabel: "Hex nuts", itemCode: `${o.itemCode}/N`,
      category: "Consumable", description: `Nuts — ${o.joint} (2/stud)`,
      material: o.nutMat, qty: st.count * 2, qtySpare: spare * 2, unit: "no",
      spec: `Heavy hex AF ${st.nutAf} × ${st.nutThk} thk, ${thread}`,
      weight: nutKg * (st.count * 2 + spare * 2), rate: 0,
    });
  };

  for (const def of Object.values(PART_BY_KEY)) {
    const rows = eq.parts[def.key] ?? [];
    rows.forEach((row, idx) => {
      const seq = String(idx + 1).padStart(2, "0");
      const itemCode = `${def.idPrefix}-${seq}`;
      const rowName = s(row, def.fields[1]?.key) || `${def.rowLabel} ${seq}`;

      switch (def.key) {
        case "shell": {
          const dia = n(row, "sh_id");
          const thk = n(row, "sh_thk");
          const len = n(row, "sh_len");
          const mat = s(row, "sh_mat") || eq.parts.head?.[0]?.hd_mat || "SA-516 Gr.70";
          if (!dia || !thk || !len) break;
          const area = Math.PI * mmToM(dia) * mmToM(len);
          const w = shellMass(dia, thk, len, mat);
          push({
            partKey: "shell", partLabel: "Shell", itemCode,
            category: "Plate",
            description: `Shell segment Ø${dia} × ${thk} thk × ${len} long`,
            material: mat, qty: 1, unit: "no", weight: w, thickness: thk,
            plateArea: area, weldLength: 2 * Math.PI * mmToM(dia) + mmToM(len),
            surfaceArea: area, rate: 0,
          });
          // cladding
          if (s(row, "sh_cladd") === "Yes") {
            const ct = n(row, "sh_cladThk");
            const cm = s(row, "sh_cladMat") || "SA-240 Gr.304L";
            if (ct > 0) {
              push({
                partKey: "shell", partLabel: "Shell cladding", itemCode: `${itemCode}/CL`,
                category: "Plate",
                description: `Cladding ${ct} thk on shell Ø${dia}`,
                material: cm, qty: 1, unit: "no",
                weight: plateMass(area, ct, cm), thickness: ct, plateArea: area, rate: 0,
              });
            }
          }
          if (s(row, "sh_stiff") === "Yes") {
            const wdt = n(row, "sh_stiffW"), st = n(row, "sh_stiffThk"), q = n(row, "sh_stiffQty") || 1;
            if (st > 0 && wdt > 0) {
              const ringArea = Math.PI * mmToM(dia) * mmToM(wdt);
              push({
                partKey: "shell", partLabel: "Stiffener ring", itemCode: `${itemCode}/ST`,
                category: "Plate", description: `Stiffener ring ${wdt}×${st} × ${q}`,
                material: mat, qty: q, unit: "no", weight: plateMass(ringArea, st, mat) * q,
                thickness: st, plateArea: ringArea * q, weldLength: 2 * Math.PI * mmToM(dia) * q, rate: 0,
              });
            }
          }
          if (s(row, "sh_topPlate") === "Yes" || s(row, "sh_botPlate") === "Yes") {
            const cnt = (s(row, "sh_topPlate") === "Yes" ? 1 : 0) + (s(row, "sh_botPlate") === "Yes" ? 1 : 0);
            const area = (Math.PI / 4) * Math.pow(mmToM(dia), 2);
            push({
              partKey: "shell", partLabel: "Top / bottom plate", itemCode: `${itemCode}/TP`,
              category: "Plate", description: `Flat cover plate Ø${dia} × ${thk} × ${cnt}`,
              material: mat, qty: cnt, unit: "no", weight: plateMass(area, thk, mat) * cnt,
              thickness: thk, plateArea: area * cnt, rate: 0,
            });
          }
          if (s(row, "sh_baseRing") === "Yes") {
            const area = Math.PI * mmToM(dia + 300) * 0.15;
            push({
              partKey: "shell", partLabel: "Base ring", itemCode: `${itemCode}/BR`,
              category: "Plate", description: `Base ring for Ø${dia}`,
              material: mat, qty: 1, unit: "no", weight: plateMass(area, 12, mat),
              thickness: 12, plateArea: area, weldLength: Math.PI * mmToM(dia), rate: 0,
            });
          }
          break;
        }
        case "head": {
          const dia = n(row, "hd_id");
          const thk = n(row, "hd_nomThk");
          const minThk = n(row, "hd_minThk");
          const mat = s(row, "hd_mat") || "SA-516 Gr.70";
          const type = s(row, "hd_type") || eq.headType;
          if (!dia || !thk) break;
          const area = headAreaFactor(type) * Math.pow(mmToM(dia), 2);
          push({
            partKey: "head", partLabel: "Vessel head", itemCode,
            category: "Plate", description: `${type} head Ø${dia} × ${thk} thk (min ${minThk || "-"})`,
            material: mat, qty: 1, unit: "no", weight: plateMass(area, thk, mat),
            thickness: thk, plateArea: area, weldLength: Math.PI * mmToM(dia),
            surfaceArea: area, rate: 0,
          });
          break;
        }
        case "nozzle": {
          const nps = s(row, "nz_size");
          if (!nps) break;
          const sch = s(row, "nz_sch");
          const len = n(row, "nz_length") || 150;
          const od = pipeOd(nps);
          const wall = n(row, "nz_pipeThk") || pipeWall(nps, sch);
          const pmat = s(row, "noz_pipeMat") || "SA-106 Gr.B";
          const fmat = s(row, "noz_flgMat") || pmat;
          const rating = s(row, "nz_rating") || "150#";
          const ratingKey = rating.replace("#", "");
          if (wall > 0 && od > 0) {
            push({
              partKey: "nozzle", partLabel: "Nozzle neck", itemCode,
              category: "Pipe", description: `Nozzle ${rowName} ${nps} ${sch} × ${len} lg`,
              material: pmat, qty: 1, unit: "no", weight: pipeMass(od, wall, len, pmat),
              thickness: wall, weldLength: Math.PI * mmToM(od) * 2, rate: 0,
            });
          }
          const fm = flangeMass(nps, ratingKey);
          if (fm > 0) {
            push({
              partKey: "nozzle", partLabel: "Nozzle flange", itemCode: `${itemCode}/F`,
              category: "Flange", description: `${s(row, "nz_face") || "RF"} flange ${nps} ${rating} ${s(row, "nz_type") || "WN"}`,
              material: fmat, qty: 1, unit: "no", weight: fm, rate: 0,
            });
          }
          if (s(row, "nz_blind") === "Yes") {
            push({
              partKey: "nozzle", partLabel: "Blind flange", itemCode: `${itemCode}/BL`,
              category: "Flange", description: `Blind flange ${nps} ${rating}`,
              material: s(row, "noz_blindMat") || fmat, qty: 1, unit: "no",
              weight: fm * 1.15, rate: 0,
            });
          }
          if (s(row, "nz_pad") === "Yes") {
            const pod = n(row, "nz_padOd"), pthk = n(row, "nz_padThk");
            if (pod > 0 && pthk > 0) {
              const area = (Math.PI / 4) * (Math.pow(mmToM(pod), 2) - Math.pow(mmToM(od), 2));
              push({
                partKey: "nozzle", partLabel: "Reinforcement pad", itemCode: `${itemCode}/RP`,
                category: "Plate", description: `RF pad ${nps} OD ${pod} × ${pthk} thk`,
                material: s(row, "noz_padMat") || pmat, qty: 1, unit: "no",
                weight: plateMass(area, pthk, s(row, "noz_padMat") || pmat),
                thickness: pthk, plateArea: area, rate: 0,
              });
            }
          }
          if (s(row, "nz_gsk") === "Yes") {
            const spare = n(row, "nz_gskSpare") || 0;
            push({
              partKey: "nozzle", partLabel: "Gasket", itemCode: `${itemCode}/G`,
              category: "Consumable", description: `${s(row, "nz_gskType") || "SW"} gasket ${nps} ${rating}`,
              material: s(row, "nz_gskMat") || "SS316+Graphite", qty: 1 + spare / 100, unit: "set",
              weight: Math.max(0.15, (od * od) / 40000), rate: 0,
            });
          }
          if (s(row, "nz_bolt") === "Yes") {
            const gskThk = s(row, "nz_gsk") === "Yes" ? n(row, "nz_gskThk") || 4.5 : 3;
            pushFasteners({
              partKey: "nozzle", itemCode,
              joint: `${rowName} ${nps} ${rating} flange`,
              stud: studSpec(nps, rating, gskThk),
              sparePct: n(row, "nz_boltSpare"),
              boltMat: s(row, "noz_boltMat") || "SA-193 B7",
              nutMat: s(row, "noz_nutMat") || "SA-194 2H",
              boltType: s(row, "nz_boltType") || "UNC",
            });
          }
          if (s(row, "nz_elbow") === "Yes") {
            const w = pipeMass(od, wall, nps.includes("2") && od > 60 ? od * 1.5 : od * 1.5, pmat);
            push({
              partKey: "nozzle", partLabel: "Elbow", itemCode: `${itemCode}/E`,
              category: "Fitting", description: `${s(row, "nz_elbowAngle") || 90}° elbow ${nps} ${sch}`,
              material: pmat, qty: 1, unit: "no", weight: Math.max(w, 0.5), rate: 0,
            });
          }
          break;
        }
        case "manway": {
          const nps = s(row, "mw_size");
          if (!nps) break;
          const rating = s(row, "mw_rating") || "150#";
          const mat = s(row, "mw_mat") || "SA-516 Gr.70";
          const fm = flangeMass(nps, rating.replace("#", ""));
          push({
            partKey: "manway", partLabel: "Manway", itemCode,
            category: "Flange", description: `Manway ${nps} ${rating} with cover`,
            material: mat, qty: 1, unit: "no", weight: fm * 2 + 3, rate: 0,
          });
          if (s(row, "mw_gsk") === "Yes") {
            push({
              partKey: "manway", partLabel: "Manway gasket", itemCode: `${itemCode}/G`,
              category: "Consumable", description: `${s(row, "mw_gskType") || "SW"} gasket ${nps}`,
              material: s(row, "mw_gskMat") || "SS316+Graphite", qty: 1, unit: "set", weight: 0.6, rate: 0,
            });
          }
          if (s(row, "mw_bolt") === "Yes") {
            const gskThk = s(row, "mw_gsk") === "Yes" ? n(row, "mw_gskThk") || 4.5 : 3;
            pushFasteners({
              partKey: "manway", itemCode,
              joint: `Manway ${nps} ${rating} cover`,
              stud: studSpec(nps, rating, gskThk),
              sparePct: n(row, "mw_boltSpare"),
              boltMat: "SA-193 B7",
              nutMat: "SA-194 2H",
              boltType: s(row, "mw_boltType") || "UNC",
            });
          }
          if (s(row, "mw_davit") === "Yes") {
            push({
              partKey: "manway", partLabel: "Davit", itemCode: `${itemCode}/D`,
              category: "Structure", description: `Davit for manway ${nps}`,
              material: "SA-36", qty: 1, unit: "no", weight: 38, structLength: 3.2, rate: 0,
            });
          }
          break;
        }
        case "support": {
          const dia = n(eq.parts.shell?.[0], "sh_id") || n(eq.parts.head?.[0], "hd_id");
          if (s(row, "su_saddle") === "Yes") {
            const q = n(row, "su_saddleQty") || 2;
            const h = n(row, "su_saddleH") || 700;
            const w = Math.max(35, 0.00006 * dia * h) * q;
            push({
              partKey: "support", partLabel: "Saddle", itemCode: `${itemCode}/SD`,
              category: "Structure", description: `Saddle support (${q} nos) H=${h}`,
              material: "SA-516 Gr.70", qty: q, unit: "no", weight: w,
              thickness: 12, plateArea: w / 7850 / 0.012, rate: 0,
            });
          }
          if (s(row, "su_skirt") === "Yes") {
            const h = n(row, "su_skirtH") || 2000;
            const t = n(row, "su_skirtThk") || 10;
            const w = shellMass(dia, t, h, "SA-516 Gr.70");
            push({
              partKey: "support", partLabel: "Skirt", itemCode: `${itemCode}/SK`,
              category: "Plate", description: `Skirt Ø${dia} × ${t} × ${h}`,
              material: "SA-516 Gr.70", qty: 1, unit: "no", weight: w,
              thickness: t, plateArea: Math.PI * mmToM(dia) * mmToM(h),
              weldLength: Math.PI * mmToM(dia), rate: 0,
            });
          }
          if (s(row, "su_leg") === "Yes") {
            const q = n(row, "su_legQty") || 4;
            const h = 1500;
            push({
              partKey: "support", partLabel: "Leg support", itemCode: `${itemCode}/LG`,
              category: "Structure", description: `Leg support ${s(row, "su_legSize") || "L75x75x8"} × ${q}`,
              material: "SA-36", qty: q, unit: "no", weight: 14 * q, structLength: mmToM(h) * q, rate: 0,
            });
          }
          break;
        }
        case "ladder": {
          const len = n(row, "ld_monkey") || n(row, "ld_stairs");
          if (len <= 0) break;
          push({
            partKey: "ladder", partLabel: "Ladder", itemCode,
            category: "Structure", description: `Caged monkey ladder ${len} mm`,
            material: "SA-36", qty: 1, unit: "no", weight: 26 * mmToM(len), structLength: mmToM(len), rate: 0,
          });
          break;
        }
        case "platform": {
          const area = n(row, "pf_area");
          if (area <= 0) break;
          push({
            partKey: "platform", partLabel: "Platform", itemCode,
            category: "Structure", description: `Platform ${area} sq.m (grating + handrail)`,
            material: "SA-36", qty: 1, unit: "sq.m", weight: 78 * area, plateArea: area, rate: 0,
          });
          break;
        }
        case "rungs": {
          const dia = n(row, "rn_dia"), len = n(row, "rn_len"), q = n(row, "rn_qty");
          if (!dia || !len) break;
          const w = (Math.PI / 4) * Math.pow(mmToM(dia), 2) * mmToM(len) * 7850 * (q || 1);
          push({
            partKey: "rungs", partLabel: "Internal rungs", itemCode,
            category: "Structure", description: `Rung Ø${dia} × ${len} (${q} nos)`,
            material: s(row, "rn_mat") || "SA-240 Gr.304", qty: q || 1, unit: "no", weight: w, rate: 0,
          });
          break;
        }
        case "baffle": {
          const thk = n(row, "bf_thk"), q = n(row, "bf_qty") || 1;
          const kind = s(row, "bf_kind") || "Tray";
          const dia = n(row, "bf_dia") || n(eq.parts.shell?.[0], "sh_id");
          if (!thk || !dia) break;
          const area = (Math.PI / 4) * Math.pow(mmToM(dia), 2) * 0.85;
          push({
            partKey: "baffle", partLabel: kind === "Tray" ? "Tray assembly" : "Baffles / trays", itemCode,
            category: "Plate", description: `${kind} Ø${dia} × ${thk} (${q} nos)`,
            material: s(row, "bf_mat") || "SA-240 Gr.304", qty: q, unit: "no",
            weight: plateMass(area, thk, s(row, "bf_mat") || "SA-240 Gr.304") * q,
            thickness: thk, plateArea: area * q, rate: 0,
          });
          break;
        }
        case "demister": {
          const thk = n(row, "dm_thk") || 100;
          const dia = n(row, "dm_dia") || n(eq.parts.shell?.[0], "sh_id");
          if (!dia) break;
          const area = (Math.PI / 4) * Math.pow(mmToM(dia), 2);
          push({
            partKey: "demister", partLabel: "Demister", itemCode,
            category: "Structure", description: `Demister pad Ø${dia} × ${thk} mesh`,
            material: s(row, "dm_mat") || "SA-240 Gr.304", qty: 1, unit: "no",
            weight: area * mmToM(thk) * 190, rate: 0,
          });
          break;
        }
        case "coalescer": {
          const thk = n(row, "co_thk") || 100;
          const dia = n(row, "co_dia") || n(eq.parts.shell?.[0], "sh_id");
          if (!dia) break;
          const area = (Math.PI / 4) * Math.pow(mmToM(dia), 2);
          push({
            partKey: "coalescer", partLabel: "Coalescer", itemCode,
            category: "Structure", description: `Coalescer pack Ø${dia} × ${thk}`,
            material: "SA-240 Gr.304", qty: 1, unit: "no", weight: area * mmToM(thk) * 210, rate: 0,
          });
          break;
        }
        case "vortex": {
          const dia = pipeOd(s(row, "vx_dia")) || 100;
          const thk = n(row, "vx_thk") || 6;
          const h = n(row, "vx_h") || 300;
          push({
            partKey: "vortex", partLabel: "Vortex breaker", itemCode,
            category: "Plate", description: `Vortex breaker Ø${dia} × ${thk} thk × ${h} ht`,
            material: "SA-240 Gr.304", qty: 1, unit: "no",
            weight: plateMass((Math.PI / 4) * Math.pow(mmToM(dia + 2 * h), 2), thk, "SA-240 Gr.304"),
            thickness: thk, plateArea: (Math.PI / 4) * Math.pow(mmToM(dia + 2 * h), 2), rate: 0,
          });
          break;
        }
        case "boot": {
          const nps = s(row, "bt_size");
          if (!nps) break;
          const wall = n(row, "bt_plate") || pipeWall(nps, s(row, "bt_sch")) || 8;
          const len = 600;
          const od = pipeOd(nps);
          const mat = s(row, "bt_mat") || "SA-516 Gr.70";
          push({
            partKey: "boot", partLabel: "Boot", itemCode,
            category: "Pipe", description: `Boot ${nps} ${s(row, "bt_sch")} × ${len}`,
            material: mat, qty: 1, unit: "no", weight: pipeMass(od, wall, len, mat),
            thickness: wall, weldLength: Math.PI * mmToM(od) * 2, rate: 0,
          });
          break;
        }
        case "skirtOpening": {
          const nps = s(row, "so_size");
          if (!nps) break;
          const od = pipeOd(nps);
          const wall = pipeWall(nps, s(row, "so_sch")) || 6;
          push({
            partKey: "skirtOpening", partLabel: "Skirt opening", itemCode,
            category: "Pipe", description: `Skirt opening ${nps} ${s(row, "so_sch")} × 150`,
            material: s(row, "so_mat") || "SA-106 Gr.B", qty: 1, unit: "no",
            weight: pipeMass(od, wall, 150, "SA-106 Gr.B"), thickness: wall, rate: 0,
          });
          break;
        }
      }
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Cost build-up for one equipment
// ---------------------------------------------------------------------------
export interface CostRollup {
  material: number;
  fabrication: number;
  welding: number;
  testing: number;
  pwht: number;
  painting: number;
  insulation: number;
  direct: number;
  overhead: number;
  profit: number;
  freight: number;
  total: number;
  vat: number;
  /** ex-works price excluding VAT — VAT is reported for reference only */
  grand: number;
  weight: number;
}

export function rollupCost(eq: Equipment, items: BomItem[], rates: RateBook): CostRollup {
  const materialCost = items.reduce((a, i) => a + i.amount, 0);
  const weight = items.reduce((a, i) => a + i.weight, 0);
  const isSS = items.some((i) => materialByName(i.material).ss);
  const fabrication = weight * (isSS ? rates.fabricationSsf : rates.fabricationCmf);
  const weldLength = items.reduce((a, i) => a + (i.weldLength ?? 0), 0);
  const welding = weldLength * rates.weldingRate;
  const testing = weldLength * rates.testingRate * (eq.radiography === "Full RT" ? 1.6 : eq.radiography === "Spot RT" ? 1 : 0.55);
  const pwht = eq.pWHT === "Yes" ? weight * rates.pwhtRate : 0;
  const surface = estimateSurface(eq, items);
  const painting = eq.paintSystem === "None" ? 0 : surface * rates.paintingRate;
  const insThk = String(eq.insulationThk);
  const insulation = eq.insulationThk > 0 ? surface * (rates.insulationRate[insThk] ?? rates.insulationRate["50"]) : 0;
  const direct = materialCost + fabrication + welding + testing + pwht + painting + insulation;
  const overhead = (direct * rates.overheadPct) / 100;
  const profit = ((direct + overhead) * rates.profitPct) / 100;
  const freight = ((direct + overhead + profit) * rates.freightPct) / 100;
  const total = direct + overhead + profit + freight + (direct * rates.marginPct) / 100;
  const vat = (total * rates.vatPct) / 100;
  return {
    material: materialCost,
    fabrication, welding, testing, pwht, painting, insulation, direct,
    overhead, profit, freight, total, vat, grand: total, weight,
  };
}

export function estimateSurface(eq: Equipment, items: BomItem[]): number {
  const shellArea = items
    .filter((i) => i.surfaceArea)
    .reduce((a, i) => a + (i.surfaceArea ?? 0), 0);
  if (shellArea > 0) return shellArea + 2;
  const dia = parseFloat(eq.parts.shell?.[0]?.sh_id ?? "0") || 0;
  const len = parseFloat(eq.parts.shell?.[0]?.sh_len ?? "0") || 0;
  return Math.PI * mmToM(dia) * mmToM(len) + (Math.PI / 2) * Math.pow(mmToM(dia), 2);
}

// ---------------------------------------------------------------------------
// Optimised BOQ — aggregation across equipment + plate nesting
// ---------------------------------------------------------------------------
export interface BoqLine {
  key: string;
  category: ItemCategory;
  description: string;
  material: string;
  thickness?: number;
  qty: number;
  unit: string;
  qtySpare: number;
  spec?: string;
  weight: number; // aggregated weight (kg)
  plateArea: number; // m2
  weldLength: number;
  equipmentTags: string[];
  rate: number;
  amount: number;
  /** optimisation */
  platesRequired?: number;
  platesWeight?: number;
  utilisation?: number;
}

export interface BoqResult {
  lines: BoqLine[];
  byCategory: { category: ItemCategory; weight: number; amount: number; lines: number }[];
  byMaterial: { material: string; weight: number; amount: number }[];
  totals: { weight: number; amount: number; plates: number; plateWeight: number };
  suggestions: { title: string; detail: string; saving: number }[];
}

const plateAreaM2 = (rates: RateBook) => (rates.plateWidth * rates.plateLength) / 1e6;

export function buildBoq(equipment: Equipment[], items: BomItem[], rates: RateBook): BoqResult {
  const map = new Map<string, BoqLine>();
  for (const it of items) {
    const thkKey = it.thickness ? Math.round(it.thickness) : 0;
    const key = `${it.category}|${it.material}|${thkKey}|${it.partLabel}|${it.spec ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty += it.qty;
      existing.qtySpare += it.qtySpare ?? 0;
      existing.weight += it.weight;
      existing.plateArea += it.plateArea ?? 0;
      existing.weldLength += it.weldLength ?? 0;
      existing.amount += it.amount;
      if (!existing.equipmentTags.includes(it.equipmentTag)) existing.equipmentTags.push(it.equipmentTag);
    } else {
      map.set(key, {
        key,
        category: it.category,
        description: it.description,
        material: it.material,
        thickness: it.thickness,
        qty: it.qty,
        unit: it.unit,
        qtySpare: it.qtySpare ?? 0,
        spec: it.spec,
        weight: it.weight,
        plateArea: it.plateArea ?? 0,
        weldLength: it.weldLength ?? 0,
        equipmentTags: [it.equipmentTag],
        rate: it.rate,
        amount: it.amount,
      });
    }
  }
  const lines = [...map.values()].sort(
    (a, b) => a.category.localeCompare(b.category) || a.material.localeCompare(b.material) || b.weight - a.weight,
  );

  const plateA = plateAreaM2(rates);
  let totalPlates = 0;
  let totalPlateWeight = 0;
  for (const line of lines) {
    if (line.category !== "Plate" || !line.plateArea || !line.thickness) continue;
    const area = line.plateArea;
    const plates = Math.ceil(area / (plateA * rates.plateUtilisation));
    line.platesRequired = plates;
    line.platesWeight = plates * plateA * (line.thickness / 1000) * materialByName(line.material).density;
    line.utilisation = area / (plates * plateA);
    totalPlates += plates;
    totalPlateWeight += line.platesWeight;
    // use nested plate weight as purchased weight for costing
    line.weight = line.platesWeight;
    line.amount = line.weight * (rates.materialRate[line.material] ?? materialByName(line.material).rate);
  }

  // re-price material lines that were not plate (rates already applied)
  for (const line of lines) {
    if (line.category === "Plate") continue;
    const rate = line.qty > 0 ? line.amount / line.qty : 0;
    if (!Number.isFinite(rate)) line.amount = 0;
  }

  const byCategoryMap = new Map<ItemCategory, { weight: number; amount: number; lines: number }>();
  for (const l of lines) {
    const e = byCategoryMap.get(l.category) ?? { weight: 0, amount: 0, lines: 0 };
    e.weight += l.weight; e.amount += l.amount; e.lines += 1;
    byCategoryMap.set(l.category, e);
  }
  const byMaterialMap = new Map<string, { weight: number; amount: number }>();
  for (const l of lines) {
    const e = byMaterialMap.get(l.material) ?? { weight: 0, amount: 0 };
    e.weight += l.weight; e.amount += l.amount;
    byMaterialMap.set(l.material, e);
  }

  const suggestions = buildSuggestions(lines, equipment, rates);

  return {
    lines,
    byCategory: [...byCategoryMap.entries()].map(([category, v]) => ({ category, ...v })),
    byMaterial: [...byMaterialMap.entries()].map(([material, v]) => ({ material, ...v })),
    totals: {
      weight: lines.reduce((a, l) => a + l.weight, 0),
      amount: lines.reduce((a, l) => a + l.amount, 0),
      plates: totalPlates,
      plateWeight: totalPlateWeight,
    },
    suggestions,
  };
}

function buildSuggestions(lines: BoqLine[], equipment: Equipment[], rates: RateBook): BoqResult["suggestions"] {
  const out: BoqResult["suggestions"] = [];
  // 1. plate gauge rationalisation
  const plateThk = new Map<number, number>();
  for (const l of lines) {
    if (l.category !== "Plate" || !l.thickness) continue;
    plateThk.set(Math.round(l.thickness), (plateThk.get(Math.round(l.thickness)) ?? 0) + l.plateArea);
  }
  const gauges = [...plateThk.entries()].sort((a, b) => a[0] - b[0]);
  const thinGauges = gauges.filter(([, a]) => a > 0 && a < 6);
  if (gauges.length > 4) {
    const saving = gauges.slice(4).reduce((a, [, area]) => a + area, 0) * 0.012 * 7850 * 0.06;
    out.push({
      title: "Rationalise plate gauges",
      detail: `${gauges.length} different plate thicknesses are used (${gauges.map((g) => g[0]).join(", ")} mm). Consolidating to 4 standard gauges reduces setting, edge-prep and nesting loss.`,
      saving,
    });
  }
  if (thinGauges.length > 0) {
    out.push({
      title: "Check minimum plate thickness",
      detail: `Thin plate gauge(s) ${thinGauges.map((g) => g[0]).join(", ")} mm have very small areas — buying full plates for them is uneconomic. Consider standardising to the nearest thicker gauge.`,
      saving: 0,
    });
  }
  // 2. duplicate equipment
  const identical = equipment.filter((e) => e.qty > 1);
  if (identical.length > 0) {
    out.push({
      title: "Batch identical equipment",
      detail: `${identical.map((e) => `${e.tag} ×${e.qty}`).join(", ")} repeat. Release as one batch to share jigs, WPS/PQR, RT film and painting — typically 6-9% fabrication saving on repeats.`,
      saving: 0,
    });
  }
  // 3. nozzle standardisation
  const nozzleSizes = new Map<string, number>();
  for (const e of equipment) {
    for (const r of e.parts.nozzle ?? []) {
      const k = `${r.nz_size ?? ""} ${r.nz_sch ?? ""} ${r.nz_rating ?? ""}`;
      if (r.nz_size) nozzleSizes.set(k, (nozzleSizes.get(k) ?? 0) + 1);
    }
  }
  if (nozzleSizes.size > 6) {
    const singles = [...nozzleSizes.entries()].filter(([, c]) => c === 1).length;
    out.push({
      title: "Standardise nozzle sizes",
      detail: `${nozzleSizes.size} distinct nozzle size/schedule/rating combinations; ${singles} of them occur only once. Every unique combination carries its own flange PO, gasket and weld procedure — target ≤ 5 combinations.`,
      saving: singles * 850,
    });
  }
  // 4. RT / PWHT scope
  const pwhtCount = equipment.filter((e) => e.pWHT === "Yes").length;
  if (pwhtCount > 0 && pwhtCount === equipment.length) {
    out.push({
      title: "Challenge PWHT scope",
      detail: "PWHT is applied to every item. For carbon steel below 38 mm and P-No.1 material, UG-1/UCS-79 service exemptions may avoid furnace charges per item.",
      saving: 0,
    });
  }
  // 5. plate utilisation
  const lowUtil = lines.filter((l) => l.utilisation !== undefined && l.utilisation < 0.6);
  if (lowUtil.length > 0) {
    out.push({
      title: "Improve nesting yield",
      detail: `${lowUtil.length} plate group(s) nest below 60% on ${Math.round(rates.plateUtilisation * 100)}% assumed yield. Combining heads and shell courses from one plate size reduces scrap.`,
      saving: lowUtil.reduce((a, l) => a + (l.plateArea ?? 0) * 0.15 * 7850 * 0.01, 0),
    });
  }
  return out;
}

export function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const str = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
