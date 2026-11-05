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
  /** freight on both legs */
  freight: number;
  importFreight: number;
  exportFreight: number;
  handling: number;
  packing: number;
  /** import duty into the workshop + duty at the client's border */
  duty: number;
  importDuty: number;
  exportDuty: number;
  dutyPct: number;
  importDutyPct: number;
  insurance: number;
  surcharge: number;
  importClearance: number;
  exportClearance: number;
  docs: number;
  total: number;
  note: string;
}

const MIN_FREIGHT = 6; // BHD per consolidated line

/**
 * The workshop. Every BOQ line is fabricated here, so material is imported into
 * Bahrain first and the finished equipment is exported from Bahrain to the
 * client — two customs events, not one.
 */
export const WORKSHOP = {
  country: "Bahrain",
  city: "Sitra",
  port: "Khalifa Bin Salman",
} as const;

/** export sea freight from Bahrain, BHD per tonne, by client destination */
const EXPORT_SEA_RATE: Record<string, number> = {
  Iraq: 22,
  Jordan: 26,
  Lebanon: 28,
  Libya: 38,
  Egypt: 30,
  Algeria: 42,
  Morocco: 44,
  Tunisia: 40,
  Sudan: 45,
};

/** declared export value uplift over landed material — fabrication and margin */
const EXPORT_VALUE_UPLIFT = 0.35;

/** road distance, km — Bahrain's internal haul is short, other domestic hauls are not */
function roadKm(a: string, b: string): number {
  if (a === b) return a === WORKSHOP.country ? 45 : 350;
  return gccRoadKm(a, b);
}

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
 * Landed cost of one BOQ line, on the Bahrain-workshop basis:
 *
 *   leg 1  origin -> Bahrain workshop   import freight, duty, clearing, docs
 *   leg 2  Bahrain workshop -> client    export freight, destination duty, clearing, docs
 *
 * A line bought in Bahrain skips leg 1. A client in Bahrain skips leg 2 and pays
 * no duty on locally made equipment. GCC clients take Bahrain-origin goods at
 * 0% duty under the GCC common tariff with a certificate of origin; other
 * destinations pay their own tariff on the declared export value.
 *
 * Clearing and documentation are per shipment, so shipmentPlan() carries them
 * rather than smearing them over every line.
 */
export function landedCost(
  line: Pick<BoqLine, "key" | "category" | "weight" | "amount" | "description">,
  originName: string,
  settings: LogisticsSettings,
  ctx: { maxLengthMm?: number; maxWidthMm?: number; maxHeightMm?: number } = {},
): LandedBreakdown {
  const origin = originOf(originName);
  const dest = destinationOf(settings.destination);
  const home = destinationOf(WORKSHOP.country);
  const workshopOrigin = originOf(WORKSHOP.country);
  const t = line.weight / 1000;
  const piece = pieceWeightOf(line);
  const share = line.weight > 0 ? piece / line.weight : 0;

  const localPurchase = origin.name === home.name;
  const localDelivery = dest.name === home.name;

  const importPack = packingFor({ weightKg: line.weight, pieceKg: piece, origin, dest: home, ...ctx });
  const exportPack = packingFor({ weightKg: line.weight, pieceKg: piece, origin: workshopOrigin, dest, ...ctx });

  const packing = line.amount * (settings.packingPct / 100);
  const handlingRate = settings.portHandling;

  let importFreight = 0;
  let exportFreight = 0;
  let handling = 0;
  let importDuty = 0;
  let exportDuty = 0;
  let insurance = 0;
  let surcharge = 0;

  const importDutyRate = dutyPct(home, line.category, null);
  const exportDutyRate = dest.region === "GCC" ? 0 : dutyPct(dest, line.category, settings.dutyOverridePct);

  // ---- leg 1: material into the Bahrain workshop ------------------------------
  if (localPurchase) {
    importFreight = Math.max(MIN_FREIGHT, t * roadKm(home.name, home.name) * settings.landRate);
    insurance += (line.amount + importFreight) * (settings.insurancePct / 100);
  } else {
    if (origin.region === "GCC") {
      importFreight = t * roadKm(origin.name, home.name) * settings.landRate * (1 + settings.fuelPct / 100);
    } else {
      const sea = t * origin.seaRate * settings.seaRateFactor * (1 + settings.fuelPct / 100);
      importFreight = sea + t * home.inlandKm * settings.landRate;
    }
    if (importPack.heavy || importPack.oversize) {
      importFreight *= 1 + (settings.abnormalLoadPct / 100) * share;
    }
    importFreight = Math.max(MIN_FREIGHT, importFreight);
    handling += t * handlingRate;
    const cif = line.amount + importFreight;
    insurance += cif * (settings.insurancePct / 100);
    importDuty = (cif + insurance) * (importDutyRate / 100);
  }

  // ---- leg 2: finished equipment from the workshop to the client -------------
  if (!localDelivery) {
    if (dest.region === "GCC") {
      exportFreight = t * roadKm(home.name, dest.name) * settings.landRate * (1 + settings.fuelPct / 100);
    } else {
      const sea = t * (EXPORT_SEA_RATE[dest.name] ?? 32) * settings.seaRateFactor * (1 + settings.fuelPct / 100);
      exportFreight = sea + t * dest.inlandKm * settings.landRate;
    }
    if (exportPack.heavy || exportPack.oversize) {
      exportFreight *= 1 + (settings.abnormalLoadPct / 100) * share;
    }
    exportFreight = Math.max(MIN_FREIGHT, exportFreight) * (1 + dest.warRiskPct / 100);
    handling += t * handlingRate;

    const declared = (line.amount + importFreight + importDuty + packing) * (1 + EXPORT_VALUE_UPLIFT);
    const cif = declared + exportFreight;
    insurance += cif * (settings.insurancePct / 100);
    exportDuty = cif * (exportDutyRate / 100);
  }

  const freight = importFreight + exportFreight;
  if (importPack.oversize && !localPurchase) surcharge += importFreight * share * (settings.abnormalLoadPct / 100);
  if (exportPack.oversize && !localDelivery) surcharge += exportFreight * share * (settings.abnormalLoadPct / 100);

  const lane = localPurchase
    ? localDelivery
      ? `Bahrain local supply — ${WORKSHOP.city} workshop`
      : `Bahrain supply → ${WORKSHOP.city} workshop → ${dest.name}`
    : localDelivery
      ? `${origin.port} → Khalifa Bin Salman → ${WORKSHOP.city} workshop`
      : `${origin.port} → Khalifa Bin Salman → ${WORKSHOP.city} → ${dest.port}`;

  const equipment = [importPack.equipment];
  if (!localDelivery) equipment.push(exportPack.equipment);

  const noteParts = [importPack.note];
  if (!localDelivery) noteParts.push(exportPack.note);
  if (dest.region === "GCC" && !localDelivery)
    noteParts.push("GCC-origin goods clear at 0% duty with a Bahrain certificate of origin");

  return {
    origin: origin.name,
    lane,
    equipment: equipment.join(" → "),
    mode: importPack.mode,
    freight,
    importFreight,
    exportFreight,
    handling,
    packing,
    duty: importDuty + exportDuty,
    importDuty,
    exportDuty,
    dutyPct: exportDutyRate,
    importDutyPct: localPurchase ? 0 : importDutyRate,
    insurance,
    surcharge,
    importClearance: 0,
    exportClearance: 0,
    docs: 0,
    total: freight + handling + packing + importDuty + exportDuty + insurance + surcharge,
    note: noteParts.join(" · "),
  };
}

// ---------------------------------------------------------------------------
// Shipment plan — the two legs, origin by origin
// ---------------------------------------------------------------------------

export interface ShipmentLine {
  leg: "Import" | "Export";
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
  note: string;
}

export interface ShipmentPlan {
  rows: ShipmentLine[];
  weight: number;
  volume: number;
  importFreight: number;
  exportFreight: number;
  freight: number;
  handling: number;
  packing: number;
  importDuty: number;
  exportDuty: number;
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
  const home = destinationOf(WORKSHOP.country);
  const localDelivery = dest.name === home.name;

  const imports = new Map<string, ShipmentLine>();
  for (const { line, breakdown } of entries) {
    const origin = originOf(breakdown.origin);
    if (origin.name === home.name) continue;
    const cur =
      imports.get(origin.name) ??
      ({
        leg: "Import",
        origin: origin.name,
        mode: breakdown.mode,
        packing: "Seaworthy export packing",
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
        note: origin.note,
      } as ShipmentLine);
    cur.weight += line.weight;
    cur.volume += line.weight / 2200;
    cur.freight += breakdown.importFreight;
    cur.handling += breakdown.handling / 2;
    cur.packingCost += breakdown.packing;
    cur.duty += breakdown.importDuty;
    cur.insurance += breakdown.insurance / 2;
    cur.surcharge += breakdown.surcharge / 2;
    cur.lines += 1;
    if (breakdown.mode === "Breakbulk / heavy lift" || breakdown.mode === "Sea + road (heavy lift)") cur.mode = breakdown.mode;
    imports.set(origin.name, cur);
  }

  for (const r of imports.values()) {
    r.clearance = settings.clearance;
    r.docs = originOf(r.origin).docs + settings.documentation;
    r.containers = containersFor(r.weight / 1000, r.volume, r.mode);
    r.subtotal = r.freight + r.handling + r.packingCost + r.duty + r.insurance + r.surcharge + r.clearance + r.docs;
  }

  const rows = [...imports.values()];

  const importVolume = rows.reduce((a, r) => a + r.volume, 0);
  const exportFreight = entries.reduce((a, e) => a + e.breakdown.exportFreight, 0);
  const exportDuty = entries.reduce((a, e) => a + e.breakdown.exportDuty, 0);
  const totalWeight = entries.reduce((a, e) => a + e.line.weight, 0);

  if (!localDelivery) {
    rows.push({
      leg: "Export",
      origin: `${WORKSHOP.city}, ${WORKSHOP.country}`,
      mode: dest.region === "GCC" ? "Road (GCC)" : "Sea + road",
      packing: "Equipment seaworthy packing, skids and cradles",
      weight: totalWeight,
      volume: totalWeight / 2200,
      containers: containersFor(totalWeight / 1000, totalWeight / 2200, "Sea + road"),
      freight: exportFreight,
      handling: (totalWeight / 1000) * settings.portHandling,
      packingCost: 0,
      duty: exportDuty,
      insurance: entries.reduce((a, e) => a + e.breakdown.insurance / 2, 0),
      surcharge: entries.reduce((a, e) => a + e.breakdown.surcharge / 2, 0),
      clearance: dest.clearance,
      docs: settings.documentation + (dest.region === "GCC" ? 0 : 60),
      lines: entries.length,
      subtotal: 0,
      note:
        dest.region === "GCC"
          ? `Bahrain-origin equipment into ${dest.name} at 0% duty under the GCC common tariff — certificate of origin required`
          : `${dest.note}. Duty is charged on the declared export value (landed material + ${Math.round(
              EXPORT_VALUE_UPLIFT * 100,
            )}% fabrication uplift)`,
    });
    const last = rows[rows.length - 1];
    last.subtotal =
      last.freight + last.handling + last.packingCost + last.duty + last.insurance + last.surcharge + last.clearance + last.docs;
  }

  const sum = (k: keyof ShipmentLine) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const material = entries.reduce((a, e) => a + e.line.amount, 0);
  const logistics =
    sum("freight") + sum("handling") + sum("packingCost") + sum("duty") + sum("insurance") + sum("surcharge") + sum("clearance") + sum("docs");

  return {
    rows,
    weight: totalWeight,
    volume: importVolume,
    importFreight: rows.filter((r) => r.leg === "Import").reduce((a, r) => a + r.freight, 0),
    exportFreight,
    freight: sum("freight"),
    handling: sum("handling"),
    packing: sum("packingCost"),
    importDuty: rows.filter((r) => r.leg === "Import").reduce((a, r) => a + r.duty, 0),
    exportDuty,
    duty: sum("duty"),
    insurance: sum("insurance"),
    surcharge: sum("surcharge"),
    clearance: sum("clearance"),
    docs: sum("docs"),
    logistics,
    material,
    delivered: material + logistics,
    containers: rows
      .filter((r) => /\d+ × 40ft/.test(r.containers))
      .reduce((a, r) => a + (parseInt(r.containers, 10) || 0), 0),
    abnormal: rows.filter((r) => /heavy|Breakbulk|FR/i.test(r.mode)).length,
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
