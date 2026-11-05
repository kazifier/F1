// ---------------------------------------------------------------------------
// Cross-country procurement, import and delivery.
//
// Raw material is bought where it is cheapest to land, not where it is quoted:
// every BOQ line can be sourced from a different country, and the landed cost
// adds the lane (road inside the GCC, sea + road for everything else), the
// packing that the mode demands, import duty at the destination, marine
// insurance, clearing and documentation, plus surcharges for oversize or heavy
// single pieces.
//
// All monetary values are BHD (the facility currency) and exclude VAT. Every
// rate is an estimating benchmark and is exposed for editing on the BOQ page.
// ---------------------------------------------------------------------------

import type { BoqLine } from "./bom";
import type { ItemCategory } from "./bom";
import type { LogisticsSettings } from "./types";

export interface OriginCountry {
  name: string;
  iso: string;
  region: "GCC" | "MENA" | "ASIA" | "EU" | "NA";
  /** main load port for steel / plate / pipe */
  port: string;
  /** sea freight benchmark to Bahrain, BHD per tonne */
  seaRate: number;
  /** export documentation, legalisation and inspection per shipment */
  docs: number;
  /** typical mill / stock lead time, weeks */
  leadWeeks: number;
  note: string;
}

export const ORIGIN_COUNTRIES: OriginCountry[] = [
  { name: "India", iso: "IN", region: "ASIA", port: "Mundra / Nhava Sheva", seaRate: 24, docs: 145, leadWeeks: 8, note: "Plate, pipe, forgings, structural — best landed cost for CS" },
  { name: "China", iso: "CN", region: "ASIA", port: "Shanghai / Tianjin", seaRate: 31, docs: 165, leadWeeks: 10, note: "Plate and structural; long ocean transit, watch mill certificates" },
  { name: "UAE", iso: "AE", region: "GCC", port: "Jebel Ali", seaRate: 9, docs: 70, leadWeeks: 2, note: "Stockist / trader supply, fastest GCC replenishment" },
  { name: "Saudi Arabia", iso: "SA", region: "GCC", port: "Dammam / Jubail", seaRate: 8, docs: 60, leadWeeks: 3, note: "GCC plate mills and pipe mills, road delivery" },
  { name: "Bahrain", iso: "BH", region: "GCC", port: "Khalifa Bin Salman", seaRate: 4, docs: 45, leadWeeks: 1, note: "Local supply — no import duty inside Bahrain" },
  { name: "Oman", iso: "OM", region: "GCC", port: "Sohar / Duqm", seaRate: 9, docs: 65, leadWeeks: 3, note: "Pipe and structural, GCC road" },
  { name: "Qatar", iso: "QA", region: "GCC", port: "Hamad", seaRate: 7, docs: 65, leadWeeks: 3, note: "Stockist supply, short road leg" },
  { name: "Kuwait", iso: "KW", region: "GCC", port: "Shuwaikh / Shuaiba", seaRate: 8, docs: 65, leadWeeks: 3, note: "Stockist supply, GCC road" },
  { name: "Turkey", iso: "TR", region: "MENA", port: "Mersin / Izmir", seaRate: 27, docs: 150, leadWeeks: 7, note: "Plate, pipe and forging mills; competitive on alloy steel" },
  { name: "Italy", iso: "IT", region: "EU", port: "Genoa / Taranto", seaRate: 34, docs: 190, leadWeeks: 9, note: "Stainless and alloy plate, tube; EU certificates" },
  { name: "Germany", iso: "DE", region: "EU", port: "Hamburg / Antwerp", seaRate: 36, docs: 200, leadWeeks: 10, note: "Alloy and stainless, tight dimensional tolerance" },
  { name: "Spain", iso: "ES", region: "EU", port: "Bilbao / Valencia", seaRate: 34, docs: 185, leadWeeks: 9, note: "Plate and structural" },
  { name: "United Kingdom", iso: "GB", region: "EU", port: "Felixstowe / Teesport", seaRate: 40, docs: 205, leadWeeks: 10, note: "Specialist forgings, pressure parts" },
  { name: "USA", iso: "US", region: "NA", port: "Houston / Norfolk", seaRate: 52, docs: 260, leadWeeks: 12, note: "ASME plate and forgings, highest freight and documentation burden" },
  { name: "South Korea", iso: "KR", region: "ASIA", port: "Busan / Ulsan", seaRate: 33, docs: 170, leadWeeks: 10, note: "Plate and heavy forging" },
  { name: "Japan", iso: "JP", region: "ASIA", port: "Yokohama / Kobe", seaRate: 38, docs: 185, leadWeeks: 11, note: "Premium plate and tube" },
  { name: "Egypt", iso: "EG", region: "MENA", port: "Alexandria / Damietta", seaRate: 18, docs: 120, leadWeeks: 6, note: "Regional stock and fabrication" },
  { name: "Jordan", iso: "JO", region: "MENA", port: "Aqaba", seaRate: 16, docs: 115, leadWeeks: 5, note: "Aqaba land bridge into the GCC" },
  { name: "Tunisia", iso: "TN", region: "MENA", port: "Tunis / Rades", seaRate: 30, docs: 150, leadWeeks: 8, note: "North African stock" },
  { name: "Morocco", iso: "MA", region: "MENA", port: "Casablanca", seaRate: 31, docs: 150, leadWeeks: 8, note: "North African stock" },
];

export interface Destination {
  name: string;
  iso: string;
  region: "GCC" | "MENA";
  port: string;
  /** standard import duty, % of CIF */
  duty: number;
  /** duty that differs from the standard rate */
  dutyByCategory?: Partial<Record<ItemCategory, number>>;
  /** customs clearing, brokerage and release per shipment */
  clearance: number;
  /** port / site to typical project site, km */
  inlandKm: number;
  /** war-risk / political-risk surcharge on freight, % */
  warRiskPct: number;
  note: string;
}

export const DESTINATIONS: Destination[] = [
  { name: "Bahrain", iso: "BH", region: "GCC", port: "Khalifa Bin Salman", duty: 5, clearance: 160, inlandKm: 45, warRiskPct: 0, note: "GCC common tariff 5% on steel; 10% VAT not applicable to imports in transit" },
  { name: "Saudi Arabia", iso: "SA", region: "GCC", port: "Dammam / Jubail", duty: 5, clearance: 240, inlandKm: 160, warRiskPct: 0, note: "SABER / SASO conformity on most steel; GCC road from Bahrain" },
  { name: "UAE", iso: "AE", region: "GCC", port: "Jebel Ali / Khalifa", duty: 5, clearance: 200, inlandKm: 120, warRiskPct: 0, note: "5% duty, Dubai customs" },
  { name: "Qatar", iso: "QA", region: "GCC", port: "Hamad", duty: 5, clearance: 200, inlandKm: 40, warRiskPct: 0, note: "5% duty" },
  { name: "Kuwait", iso: "KW", region: "GCC", port: "Shuwaikh", duty: 5, clearance: 210, inlandKm: 60, warRiskPct: 0, note: "5% duty" },
  { name: "Oman", iso: "OM", region: "GCC", port: "Sohar / Muscat", duty: 5, clearance: 190, inlandKm: 220, warRiskPct: 0, note: "5% duty" },
  { name: "Iraq", iso: "IQ", region: "MENA", port: "Umm Qasr", duty: 15, clearance: 420, inlandKm: 550, warRiskPct: 1.2, note: "15% reconstruction tariff, slow release, high inland cost to Basra / Baghdad" },
  { name: "Jordan", iso: "JO", region: "MENA", port: "Aqaba", duty: 10, clearance: 260, inlandKm: 330, warRiskPct: 0.3, note: "10% duty, Aqaba special zone" },
  { name: "Lebanon", iso: "LB", region: "MENA", port: "Beirut", duty: 5, clearance: 300, inlandKm: 40, warRiskPct: 1.5, note: "5% duty, port congestion surcharge" },
  { name: "Libya", iso: "LY", region: "MENA", port: "Misrata / Benghazi", duty: 20, clearance: 480, inlandKm: 400, warRiskPct: 2.5, note: "20% duty, war-risk insurance, cash-basis clearing" },
  { name: "Egypt", iso: "EG", region: "MENA", port: "Alexandria / Damietta", duty: 10, clearance: 300, inlandKm: 220, warRiskPct: 0.4, note: "10% duty plus 1% development fee" },
  { name: "Algeria", iso: "DZ", region: "MENA", port: "Algiers / Skikda", duty: 30, clearance: 380, inlandKm: 300, warRiskPct: 0.8, note: "30% duty, import licence regime" },
  { name: "Morocco", iso: "MA", region: "MENA", port: "Casablanca / Tanger Med", duty: 25, clearance: 320, inlandKm: 250, warRiskPct: 0, note: "25% duty on finished goods, lower on project cargo" },
  { name: "Tunisia", iso: "TN", region: "MENA", port: "Rades", duty: 30, clearance: 330, inlandKm: 180, warRiskPct: 0, note: "30% duty, temporary admission possible" },
  { name: "Sudan", iso: "SD", region: "MENA", port: "Port Sudan", duty: 25, clearance: 400, inlandKm: 800, warRiskPct: 2, note: "25% duty, long inland haul" },
];

export const DEFAULT_LOGISTICS: LogisticsSettings = {
  destination: "Bahrain",
  defaultOrigin: "India",
  incoterm: "CIF",
  insurancePct: 0.35,
  dutyOverridePct: null,
  landRate: 0.045,
  seaRateFactor: 1,
  portHandling: 3.5,
  clearance: 180,
  documentation: 120,
  fuelPct: 8,
  packingPct: 0.6,
  abnormalLoadPct: 15,
};

export const originOf = (name: string) =>
  ORIGIN_COUNTRIES.find((c) => c.name === name) ?? ORIGIN_COUNTRIES[0];
export const destinationOf = (name: string) =>
  DESTINATIONS.find((c) => c.name === name) ?? DESTINATIONS[0];

export const originNames = () => ORIGIN_COUNTRIES.map((c) => c.name);
export const destinationNames = () => DESTINATIONS.map((c) => c.name);

/** approximate GCC road distances, km, between the six member states */
const GCC_ROAD: Record<string, number> = {
  "Bahrain|Saudi Arabia": 500,
  "Bahrain|UAE": 900,
  "Bahrain|Qatar": 450,
  "Bahrain|Kuwait": 750,
  "Bahrain|Oman": 1150,
  "Saudi Arabia|UAE": 1400,
  "Saudi Arabia|Qatar": 700,
  "Saudi Arabia|Kuwait": 900,
  "Saudi Arabia|Oman": 1800,
  "UAE|Qatar": 700,
  "UAE|Kuwait": 1500,
  "UAE|Oman": 600,
  "Qatar|Kuwait": 1200,
  "Qatar|Oman": 1100,
  "Kuwait|Oman": 1900,
};

export function gccRoadKm(a: string, b: string): number {
  if (a === b) return 350; // domestic haul
  return GCC_ROAD[`${a}|${b}`] ?? GCC_ROAD[`${b}|${a}`] ?? 1200;
}

/** duty for one BOQ line at the destination */
export function dutyPct(dest: Destination, category: ItemCategory, override: number | null): number {
  if (override !== null && Number.isFinite(override)) return override;
  return dest.dutyByCategory?.[category] ?? dest.duty;
}

export type CargoMode =
  | "Road (domestic)"
  | "Road (GCC)"
  | "Sea + road"
  | "Sea + road (heavy lift)"
  | "Breakbulk / heavy lift";

export interface Packing {
  mode: CargoMode;
  /** trailer / vessel / container selection */
  equipment: string;
  oversize: boolean;
  heavy: boolean;
  note: string;
}

/**
 * Mode and equipment from the cargo itself: a 22 m, 60 t column cannot go in a
 * container, and a pallet of gaskets should not charter a low-bed.
 */
export function packingFor(o: {
  /** total tonnes on the line — drives how many units move */
  weightKg: number;
  /** heaviest single piece — drives lift type and oversize */
  pieceKg?: number;
  origin: OriginCountry;
  dest: Destination;
  maxLengthMm?: number;
  maxWidthMm?: number;
  maxHeightMm?: number;
}): Packing {
  const t = o.weightKg / 1000;
  const pieceT = (o.pieceKg ?? o.weightKg) / 1000;
  const len = o.maxLengthMm ?? 0;
  const width = o.maxWidthMm ?? 0;
  const height = o.maxHeightMm ?? 0;
  const oversize = len > 12100 || width > 2400 || height > 2600;
  const heavy = pieceT > 28;
  const domestic = o.origin.name === o.dest.name;
  const bothGcc = o.origin.region === "GCC" && o.dest.region === "GCC";
  const units = Math.max(1, Math.ceil(t / (bothGcc || domestic ? 24 : 26)));
  const n40 = `× 40ft`;
  const count = (mode: string) => (units > 1 ? `${units} ${mode}` : `1 ${mode}`);

  if (heavy || len > 18000) {
    return {
      mode: domestic || bothGcc ? "Road (GCC)" : "Breakbulk / heavy lift",
      equipment:
        len > 18000
          ? `${count("extendable / blade trailer")}`
          : `${count("low-bed trailer 60 t")}`,
      oversize: true,
      heavy: true,
      note: `single piece ${pieceT.toFixed(0)} t${len ? ` × ${(len / 1000).toFixed(1)} m` : ""} of ${t.toFixed(
        0,
      )} t on the line — abnormal load, route survey and escorts`,
    };
  }
  if (oversize) {
    return {
      mode: domestic || bothGcc ? "Road (GCC)" : "Sea + road (heavy lift)",
      equipment: `${count("flat rack 40ft")} + low-bed`,
      oversize: true,
      heavy: false,
      note: `piece leaves the container envelope (${pieceT.toFixed(0)} t) — flat rack on deck, low-bed at both ends`,
    };
  }
  if (domestic) {
    return {
      mode: "Road (domestic)",
      equipment: units > 1 ? `${units} × flat-bed trailer 40ft` : "Flat-bed / closed body truck",
      oversize: false,
      heavy: false,
      note: `${t.toFixed(1)} t on ${units} load${units > 1 ? "s" : ""}, domestic delivery, no import clearance`,
    };
  }
  if (bothGcc) {
    return {
      mode: "Road (GCC)",
      equipment: units > 1 ? `${units} × flat-bed trailer 40ft` : "Flat-bed trailer / 20ft container on chassis",
      oversize: false,
      heavy: false,
      note: `${t.toFixed(1)} t on ${units} load${units > 1 ? "s" : ""}, GCC road transit with border customs transit document`,
    };
  }
  if (t <= 0.5) {
    return {
      mode: "Sea + road",
      equipment: "LCL consolidation",
      oversize: false,
      heavy: false,
      note: `${t.toFixed(2)} t — LCL groupage, CFS charges and longer transit`,
    };
  }
  if (t <= 3) {
    return {
      mode: "Sea + road",
      equipment: `${units} × 20ft container (FCL)`,
      oversize: false,
      heavy: false,
      note: `${t.toFixed(1)} t — one 20ft, cheaper than LCL at this weight`,
    };
  }
  return {
    mode: "Sea + road",
    equipment: `${units} ${n40} (FCL)`,
    oversize: false,
    heavy: false,
    note: `${t.toFixed(0)} t — ${units} × 40ft FCL at 26 t payload, port handling at both ends`,
  };
}

export interface LandedBreakdown {
  origin: string;
  lane: string;
  equipment: string;
  mode: CargoMode;
  freight: number;
  handling: number;
  packing: number;
  duty: number;
  dutyPct: number;
  insurance: number;
  surcharge: number;
  total: number;
  note: string;
}

const MIN_FREIGHT = 6; // BHD per consolidated line

/**
 * Largest single piece behind a BOQ line. A 230 t tube line is 230 t of tubes on
 * a ship, not one 230 t lift — the mode and any abnormal-load surcharge must be
 * driven by the heaviest piece that is actually handled, or every consolidated
 * line would be quoted as a heavy lift.
 */
const PIECE_CAP: Record<ItemCategory, number> = {
  Plate: 4000,
  Pipe: 2500,
  Flange: 1200,
  Fitting: 800,
  Structure: 3000,
  Consumable: 500,
  Service: 100000,
};

export const pieceWeightOf = (line: { category: ItemCategory; weight: number }) =>
  Math.min(line.weight, PIECE_CAP[line.category] ?? 4000);

/**
 * Landed cost of one BOQ line: packing + freight + handling + insurance + duty
 * on the CIF value. Clearance and documentation are per shipment, so they are
 * carried by shipmentPlan() rather than smeared over the lines.
 */
export function landedCost(
  line: Pick<BoqLine, "key" | "category" | "weight" | "amount" | "description">,
  originName: string,
  settings: LogisticsSettings,
  ctx: { maxLengthMm?: number; maxWidthMm?: number; maxHeightMm?: number } = {},
): LandedBreakdown {
  const origin = originOf(originName);
  const dest = destinationOf(settings.destination);
  const t = line.weight / 1000;
  const piece = pieceWeightOf(line);
  const pack = packingFor({
    weightKg: line.weight,
    pieceKg: piece,
    origin,
    dest,
    ...ctx,
  });
  const domestic = origin.name === dest.name;
  const bothGcc = origin.region === "GCC" && dest.region === "GCC";

  const packing = line.amount * (settings.packingPct / 100);
  let freight = 0;
  if (domestic) {
    freight = t * gccRoadKm(origin.name, dest.name) * settings.landRate;
  } else if (bothGcc) {
    freight = t * gccRoadKm(origin.name, dest.name) * settings.landRate * (1 + settings.fuelPct / 100);
  } else {
    const sea = t * origin.seaRate * settings.seaRateFactor * (1 + settings.fuelPct / 100);
    const inland = t * dest.inlandKm * settings.landRate;
    freight = sea + inland;
  }
  if (pack.mode === "Breakbulk / heavy lift" || pack.mode === "Sea + road (heavy lift)") {
    freight *= 1 + settings.abnormalLoadPct / 100;
  }
  freight = Math.max(MIN_FREIGHT, freight) * (1 + dest.warRiskPct / 100);
  const handling = domestic ? 0 : t * settings.portHandling;
  const insurance = (line.amount + freight) * (settings.insurancePct / 100);

  const pct = dutyPct(dest, line.category, settings.dutyOverridePct);
  const duty = domestic ? 0 : (line.amount + freight + insurance) * (pct / 100);
  // the abnormal-load surcharge rides on the share of the freight that belongs
  // to the oversize / heavy piece, not on a whole consolidated line
  const share = line.weight > 0 ? piece / line.weight : 0;
  const surcharge = pack.oversize ? freight * share * (settings.abnormalLoadPct / 100) : 0;

  return {
    origin: origin.name,
    lane: domestic
      ? "Domestic"
      : bothGcc
        ? `${origin.name} → ${dest.name} (road ${gccRoadKm(origin.name, dest.name)} km)`
        : `${origin.port} → ${dest.port} (sea) + ${dest.inlandKm} km road`,
    equipment: pack.equipment,
    mode: pack.mode,
    freight,
    handling,
    packing,
    duty,
    dutyPct: domestic ? 0 : pct,
    insurance,
    surcharge,
    total: freight + handling + packing + duty + insurance + surcharge,
    note: pack.note,
  };
}

// ---------------------------------------------------------------------------
// Shipment plan — how the whole procurement actually moves
// ---------------------------------------------------------------------------

export interface ShipmentLine {
  origin: string;
  mode: string;
  packing: string;
  weight: number; // kg
  volume: number; // m3
  containers: string;
  freight: number;
  handling: number;
  packingCost: number;
  duty: number;
  insurance: number;
  surcharge: number;
  clearance: number;
  docs: number;
  lines: number;
  subtotal: number;
  shipping: number; // BHD / tonne for this origin
  note: string;
}

export interface ShipmentPlan {
  rows: ShipmentLine[];
  weight: number;
  volume: number;
  freight: number;
  handling: number;
  packing: number;
  duty: number;
  insurance: number;
  surcharge: number;
  clearance: number;
  docs: number;
  logistics: number;
  material: number;
  delivered: number;
  containers: number;
  abnormal: number;
}

const containersFor = (t: number, m3: number, mode: string) => {
  if (/heavy|Breakbulk|flat rack/i.test(mode)) return "Breakbulk / FR";
  if (t <= 0.5) return "LCL";
  if (t <= 3 && m3 <= 15) return "LCL";
  const n40 = Math.ceil(Math.max(t / 26, m3 / 67));
  return `${n40} × 40ft`;
};

export function shipmentPlan(
  entries: { line: Pick<BoqLine, "key" | "category" | "weight" | "amount">; breakdown: LandedBreakdown }[],
  settings: LogisticsSettings,
): ShipmentPlan {
  const dest = destinationOf(settings.destination);
  const map = new Map<string, ShipmentLine>();
  for (const { line, breakdown } of entries) {
    const origin = originOf(breakdown.origin);
    const cur =
      map.get(origin.name) ??
      ({
        origin: origin.name,
        mode: breakdown.mode,
        packing: origin.region === "GCC" && dest.region === "GCC" ? "Export wrapped / open" : "Seaworthy export packing",
        weight: 0,
        volume: 0,
        containers: "",
        freight: 0,
        handling: 0,
        packingCost: 0,
        duty: 0,
        insurance: 0,
        surcharge: 0,
        clearance: 0,
        docs: 0,
        lines: 0,
        subtotal: 0,
        shipping: origin.seaRate,
        note: origin.note,
      } as ShipmentLine);
    cur.weight += line.weight;
    cur.volume += line.weight / 2200; // packed steel ≈ 2.2 t per m³
    cur.freight += breakdown.freight;
    cur.handling += breakdown.handling;
    cur.packingCost += breakdown.packing;
    cur.duty += breakdown.duty;
    cur.insurance += breakdown.insurance;
    cur.surcharge += breakdown.surcharge;
    cur.lines += 1;
    if (breakdown.mode === "Breakbulk / heavy lift" || breakdown.mode === "Sea + road (heavy lift)") cur.mode = breakdown.mode;
    map.set(origin.name, cur);
  }

  const rows = [...map.values()];
  for (const r of rows) {
    const origin = originOf(r.origin);
    const domestic = r.origin === dest.name;
    // one clearing file and one document set per origin per shipment
    r.clearance = domestic ? 0 : dest.clearance;
    r.docs = domestic ? 0 : origin.docs + settings.documentation;
    r.containers = domestic ? "Road" : containersFor(r.weight / 1000, r.volume, r.mode);
    r.subtotal =
      r.freight + r.handling + r.packingCost + r.duty + r.insurance + r.surcharge + r.clearance + r.docs;
  }

  const sum = (k: keyof ShipmentLine) => rows.reduce((a, r) => a + (r[k] as number), 0);
  const material = entries.reduce((a, e) => a + e.line.amount, 0);
  const logistics = sum("freight") + sum("handling") + sum("packingCost") + sum("duty") + sum("insurance") + sum("surcharge") + sum("clearance") + sum("docs");
  return {
    rows,
    weight: sum("weight"),
    volume: rows.reduce((a, r) => a + r.volume, 0),
    freight: sum("freight"),
    handling: sum("handling"),
    packing: sum("packingCost"),
    duty: sum("duty"),
    insurance: sum("insurance"),
    surcharge: sum("surcharge"),
    clearance: sum("clearance"),
    docs: sum("docs"),
    logistics,
    material,
    delivered: material + logistics,
    containers: rows.filter((r) => /40ft/.test(r.containers)).reduce((a, r) => a + parseInt(r.containers, 10) || 0, 0),
    abnormal: rows.filter((r) => r.clearance >= 0 && /heavy|Breakbulk|FR/i.test(r.mode)).length,
  };
}

/** cheapest origin for a line's material, by landed cost — used for the suggestion */
export function cheapestOrigin(
  line: Pick<BoqLine, "key" | "category" | "weight" | "amount" | "description">,
  settings: LogisticsSettings,
): { origin: string; total: number } {
  let best = { origin: ORIGIN_COUNTRIES[0].name, total: Number.POSITIVE_INFINITY };
  for (const c of ORIGIN_COUNTRIES) {
    const b = landedCost(line, c.name, settings);
    if (b.total < best.total) best = { origin: c.name, total: b.total };
  }
  return best;
}
