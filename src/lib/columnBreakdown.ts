// ---------------------------------------------------------------------------
// Column estimate breakdown — the 24 rows of the legacy column BOQ sheet.
//
// Rows 1-14, 16, 17 and 22 are driven by the take-off (buildEquipmentBom).
// The remaining rows (internal support, fireproofing, foundation template,
// insulation ring, lifting trunnion, tail lug, transportation saddle) are not
// part of the pressure-part take-off, so they stay open for the estimator to
// fill in — exactly like the legacy sheet, where those cells were blank.
// ---------------------------------------------------------------------------

import { rollupCost, type BomItem } from "./bom";
import type { Equipment, RateBook } from "./types";

export const COLUMN_COMPONENTS = [
  "Column Shell",
  "Column Heads",
  "Nozzle",
  "Manways",
  "External Support",
  "Internal Support",
  "Skirt",
  "Ladders",
  "Platforms",
  "Tray Assembly",
  "Internal rungs",
  "Baffles",
  "Demisters",
  "Coalescers",
  "Vortex Breaker",
  "Base Ring",
  "Boot Shell",
  "Fireproofing",
  "Foundation Template",
  "Insulation Ring",
  "Lifting Trunnion",
  "Stiffener Ring",
  "Tail Lug",
  "Transportation Saddle",
] as const;

export type ColumnComponent = (typeof COLUMN_COMPONENTS)[number];

export interface BreakdownRow {
  component: ColumnComponent;
  /** installed quantity (segments, nozzles, trays …) */
  qty: number;
  unit: string;
  /** material value from the take-off (fabrication is allocated separately) */
  amount: number;
  weight: number;
  /** true when the row comes from the take-off, false when it is estimator input */
  derived: boolean;
  detail: string;
}

const bucketOf = (it: BomItem): ColumnComponent | null => {
  const code = it.itemCode;
  const desc = it.description.toLowerCase();
  switch (it.partKey) {
    case "shell":
      if (code.endsWith("/BR")) return "Base Ring";
      if (code.endsWith("/ST")) return "Stiffener Ring";
      if (code.endsWith("/TP")) return "Column Heads"; // flat top/bottom cover
      if (code.endsWith("/CL")) return "Column Shell";
      return "Column Shell";
    case "head":
      return "Column Heads";
    case "nozzle":
      return "Nozzle";
    case "manway":
      return "Manways";
    case "support":
      return code.endsWith("/SK") ? "Skirt" : "External Support";
    case "ladder":
      return "Ladders";
    case "platform":
      return "Platforms";
    case "rungs":
      return "Internal rungs";
    case "baffle":
      return desc.startsWith("tray") ? "Tray Assembly" : "Baffles";
    case "demister":
      return "Demisters";
    case "coalescer":
      return "Coalescers";
    case "vortex":
      return "Vortex Breaker";
    case "boot":
      return "Boot Shell";
    default:
      return null;
  }
};

/** Aggregate one equipment's BOM into the legacy 24-row column breakdown. */
export function columnBreakdown(eq: Equipment, items: BomItem[]): BreakdownRow[] {
  const acc = new Map<ColumnComponent, { qty: number; unit: string; amount: number; lines: number; weight: number }>();
  for (const it of items) {
    const comp = bucketOf(it);
    if (!comp) continue;
    const e = acc.get(comp) ?? { qty: 0, unit: it.unit, amount: 0, lines: 0, weight: 0 };
    e.qty += it.qty;
    e.amount += it.amount;
    e.weight += it.weight;
    e.lines += 1;
    acc.set(comp, e);
  }
  return COLUMN_COMPONENTS.map((component) => {
    const e = acc.get(component);
    const extra = eq.columnExtras?.[component];
    if (e && (e.qty > 0 || e.amount > 0)) {
      return {
        component,
        qty: e.qty,
        unit: e.unit,
        amount: e.amount,
        weight: e.weight,
        derived: true,
        detail: `${e.lines} take-off line${e.lines === 1 ? "" : "s"}`,
      };
    }
    return {
      component,
      qty: Number(extra?.qty) || 0,
      unit: "lot",
      amount: Number(extra?.amount) || 0,
      weight: 0,
      derived: false,
      detail: "not in take-off",
    };
  });
}

/**
 * Breakdown with the equipment's fabrication, welding, testing, PWHT, finish and
 * mark-ups allocated per component by share of weight, so the rows add up to the
 * quoted price of that column rather than to material cost alone.
 */
export function columnBreakdownCost(
  eq: Equipment,
  items: BomItem[],
  rates: RateBook,
): BreakdownRow[] {
  const rows = columnBreakdown(eq, items);
  const roll = rollupCost(eq, items, rates);
  const totalWeight = rows.reduce((a, r) => a + r.weight, 0);
  const nonMaterial = Math.max(0, roll.total - roll.material);
  if (totalWeight <= 0) return rows;
  return rows.map((r) =>
    r.derived
      ? { ...r, amount: r.amount + nonMaterial * (r.weight / totalWeight) }
      : r,
  );
}

export const columnTotal = (rows: BreakdownRow[]) => rows.reduce((a, r) => a + r.amount, 0);
