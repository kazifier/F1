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
  /** heat exchanger design basis (TEMA + ASME VIII-1) — drives the exchanger sheet */
  he?: import("./tema").ExchangerSpec;
  /** exchanger components that are not in the design (expansion joint, lugs …) */
  heExtras?: Record<string, { qty: string; amount: string }>;
  /** exchanger nozzle schedule — generated from the TEMA design, editable */
  heNozzles?: HeNozzleRow[];
}

/** one opening on a shell & tube exchanger */
export interface HeNozzleRow {
  mark: string;
  service: string; // "Shell inlet" / "Channel outlet" / "Vent" …
  nps: string; // NPS, e.g. 8"
  qty: number;
  /** design pressure the neck is checked against, kPa(g) */
  pressure: number;
  /** design temperature, °C */
  temperature: number;
  shellSide: boolean;
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
  /** welding procedure, weld layers and shop manhour basis */
  weld: WeldSettings;
}

// ---------------------------------------------------------------------------
// Welding / manhour basis — one WPS family per part & weld type
// ---------------------------------------------------------------------------

export type WeldProcess = "GTAW" | "SMAW" | "SAW" | "FCAW";

// ---------------------------------------------------------------------------
// Cross-country procurement & delivery basis
// ---------------------------------------------------------------------------

export interface LogisticsSettings {
  /** client destination country */
  destination: string;
  /** origin used for any BOQ line without its own selection */
  defaultOrigin: string;
  incoterm: "EXW" | "FOB" | "CIF" | "DAP" | "DDP";
  /** marine / transit insurance, % of material + freight */
  insurancePct: number;
  /** force one import duty rate; null uses the destination tariff */
  dutyOverridePct: number | null;
  /** road freight, BHD per tonne-km */
  landRate: number;
  /** multiplier on the lane sea-freight benchmark */
  seaRateFactor: number;
  /** port handling / THC, BHD per tonne */
  portHandling: number;
  /** customs clearing per shipment, BHD */
  clearance: number;
  /** extra documentation per shipment, BHD */
  documentation: number;
  /** bunker / fuel surcharge, % of freight */
  fuelPct: number;
  /** export packing & crating, % of material value */
  packingPct: number;
  /** abnormal / oversize load surcharge, % */
  abnormalLoadPct: number;
}
export type JointPrep = "Single V" | "Double V" | "Square";
export type GougeMethod = "None" | "Manual grinding" | "Machine grinding";
export type GougeSelect = "Auto" | "Manual grinding" | "Machine grinding";

export interface WeldSettings {
  /** shop manhour rate, BHD per manhour (default 2.00) */
  shopRate: number;
  /** root pass process — always a TIG root on these exchangers */
  rootProcess: WeldProcess;
  /** fill / cap process up to the thickness break */
  fillProcessThin: WeldProcess;
  /** fill / cap process above the thickness break */
  fillProcessThick: WeldProcess;
  /** plate thickness (mm) where the fill process changes SMAW → SAW */
  thickThreshold: number;
  /** thickness (mm) above which the joint becomes a double V (no back gouging) */
  doubleVThreshold: number;
  /** back-gouge method: auto (by equipment diameter) or forced */
  gougeMethod: GougeSelect;
  /** at or above this diameter the shop machine-grinds the back gouge */
  gougeAutoDia: number;
  /** manhours per metre of back gouge per 10 mm of depth */
  manualGougeRate: number;
  machineGougeRate: number;
  /** fit-up / handling / interpass cleaning, manhours per metre of joint */
  fitUp: number;
}

// ---------------------------------------------------------------------------
export type OfferType = "Techno-Commercial" | "Technical" | "Commercial" | "Unpriced Commercial";

export type ScopeParty = "endUser" | "client" | "ramsis";

/**
 * Proposal preparation settings. The offer is generated from the estimate, so
 * this only holds what cannot be derived: the parties, the offer number and the
 * commercial basis the estimator wants to quote.
 */
export interface ProposalSettings {
  offerType: OfferType;
  offerNo: string;
  revision: string;
  date: string;
  /** "Kind Attn. …" line */
  attention: string;
  /** client is the EPC that issues the purchase order */
  client: string;
  clientAddress: string;
  /** end user is the plant owner where the equipment is installed */
  endUser: string;
  subject: string;
  enquiryRef: string;
  validityDays: number;
  deliveryWeeks: number;
  paymentDays: number;
  advancePct: number;
  /** payment released on issue of the raw-material purchase orders */
  materialPoPct: number;
  retentionPct: number;
  warrantyMonths: number;
  warrantyExWeeks: number;
  preparedBy: string;
  preparedRole: string;
  phone: string;
  mobile: string;
  email: string;
  /** scope matrix overrides, key `${rowId}|${party}` */
  scope: Record<string, string>;
  /** free text printed under general notes */
  notes: string;
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
