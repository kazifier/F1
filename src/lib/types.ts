// ---------------------------------------------------------------------------
// Core data model for the estimator
// ---------------------------------------------------------------------------

export type FieldType = "text" | "number" | "select" | "yesno" | "date";

export interface FieldDef {
  key: string;
  ref: string; // Excel mapping reference, e.g. "1.3.10.1"
  label: string;
  type: FieldType;
  unit?: string;
  options?: string[];
  /** optional optgroups (e.g. material families with their ASME spec) */
  groups?: { label: string; options: string[] }[];
  width?: number; // editor column width (px)
  /** Only shown when another field in the same row has one of these values */
  showWhen?: { key: string; equals: string[] };
  note?: string;
}

export interface PartDef {
  key: string;
  ref: string; // Excel "1.x"
  label: string; // "Shell"
  rowLabel: string; // "Shell Segment"
  idPrefix: string; // "PV-S"
  fields: FieldDef[];
  defaultRows: number;
  maxRows: number;
  section: "main" | "internal" | "supporting";
}

export type PartRow = Record<string, string>;

export interface Equipment {
  id: string;
  type: string; // Pressure Vessel / Column / Heat Exchanger ...
  tag: string; // 10-D04
  name: string; // Water Break Tank
  service: string;
  qty: number;
  /** geometry header — drives the part sheet */
  orientation: string; // Vertical / Horizontal
  diameter: number; // mm, inside diameter
  ttLength: number; // mm, tangent to tangent
  shellThk: number; // mm, nominal shell plate
  inspection: string; // EN 10204 3.1 / 3.2
  /** design basis */
  designPressure: number; // kPa(g)
  designTemperature: number; // deg C
  mdmt: number; // deg C
  corrosionAllowance: number; // mm
  jointEfficiency: number;
  headType: string;
  insulationThk: number; // mm
  radiography: string;
  pWHT: string;
  paintSystem: string;
  parts: Record<string, PartRow[]>;
  /** column breakdown rows that are not in the take-off (fireproofing, trunnions,
   *  foundation template …) — estimator-entered quantity and amount, in BHD */
  columnExtras?: Record<string, { qty: string; amount: string }>;
  /** internally lined vessel — flange facing and RF pad carry a lining */
  lined?: boolean;
}

export interface ProjectInfo {
  projectNo: string;
  projectName: string;
  client: string;
  consultant: string;
  location: string;
  enquiryDate: string;
  preparedBy: string;
  /** display currency code; amounts are stored in BHD and converted for display */
  currency: string;
  revision: string;
}

export interface RateBook {
  // every monetary rate is in BHD (facility currency), net of VAT
  materialRate: Record<string, number>; // BHD / kg
  fabricationCmf: number; // BHD / kg carbon steel
  fabricationSsf: number; // BHD / kg stainless
  weldingRate: number; // BHD / m
  testingRate: number; // BHD / m of weld
  pwhtRate: number; // BHD / kg
  paintingRate: number; // BHD / m2
  insulationRate: Record<string, number>; // BHD / m2 by thickness
  flangeRate: Record<string, number>; // BHD / kg factor multiplier
  marginPct: number;
  overheadPct: number;
  profitPct: number;
  freightPct: number;
  /** Bahrain VAT, kept only to report the excluded amount — never added to a price */
  vatPct: number;
  /** curently always false: all quoted prices exclude VAT */
  vatIncluded: boolean;
  plateUtilisation: number; // 0..1 nesting yield
  plateWidth: number; // mm standard plate
  plateLength: number; // mm
}

export interface DatasheetInputs {
  tag: string;
  orientation: string; // Vertical / Horizontal
  shellId: number; // mm
  shellLength: number; // mm
  designPressure: number; // kPa(g)
  designTemperature: number; // C
  externalPressure: number; // kPa(g) positive number
  material: string;
  ca: number; // mm
  jointEfficiency: number;
  headType: string;
  nozzleRows: NozzleInput[];
  windSpeed: number; // m/s
  seismicCoeff: number;
}

export interface NozzleInput {
  id: string;
  mark: string;
  nps: string;
  schedule: string;
  type: string; // Pipe / Manway
  cladding: string;
  projection: number; // mm
  padThickness: number; // mm
  padOd: number; // mm
  corrodedNeck: number; // mm as-supplied neck thickness
  repad: string;
}
