// ---------------------------------------------------------------------------
// Proposal preparation
//
// One document model behind every offer the company issues: a technical offer,
// a commercial offer, a full techno-commercial offer, or an unpriced commercial
// offer for commercial review without prices. Nothing here is typed twice — the
// equipment schedule comes from the design pages, the prices from the BOQ
// roll-up, the freight line from the logistics basis, and the payment schedule
// from the material content of the quoted price.
// ---------------------------------------------------------------------------
import type {
  Equipment,
  LogisticsSettings,
  ProjectInfo,
  ProposalSettings,
  RateBook,
  ScopeParty,
} from "./types";
import { buildBoq, buildEquipmentBom, rollupCost } from "./bom";
import { destinationOf, landedCost, WORKSHOP } from "./logistics";
import { formatMoney, getCurrency, type CurrencyDef } from "./currency";

export type ScopeMark = "R" | "A" | "C" | "I" | "-";

export const SCOPE_MARKS: { mark: ScopeMark; label: string }[] = [
  { mark: "R", label: "Responsible / executes" },
  { mark: "A", label: "Approves" },
  { mark: "C", label: "Consulted / reviews" },
  { mark: "I", label: "Informed" },
  { mark: "-", label: "Not in scope" },
];

export type ScopeGroupId = "design" | "fabrication";

export interface ScopeGroupDef {
  id: ScopeGroupId;
  title: string;
  note: string;
}

/** The two halves of an offer matrix: what we guarantee, and where the shop scope stops. */
export const SCOPE_GROUPS: ScopeGroupDef[] = [
  {
    id: "design",
    title: "Process design and guarantees",
    note: "Engineering, manufacture, testing and delivery by Ramsis Engineering at the Sitra workshop.",
  },
  {
    id: "fabrication",
    title: "Fabrication engineering and shop limits",
    note: "Shop-level scope retained by the client or its nominated fabricator, and the basis or limit that applies to it.",
  },
];

export interface ScopeRowDef {
  id: string;
  item: string;
  group: ScopeGroupId;
  /** basis, limit or exclusion printed against the line */
  basis?: string;
  defaults: Record<ScopeParty, ScopeMark>;
}

/**
 * Scope of supply split three ways — the plant owner, the EPC that places the PO,
 * and us — with the basis or limit stated once per line. Duplicated lines (NDE and
 * pressure testing, heat treatment, painting, internals, code stamp and third-party
 * inspection) are carried once, under the party that actually executes them.
 */
/** scope definitions — ordered for reading by SCOPE_SEQUENCE below */
const SCOPE_DEFS: ScopeRowDef[] = [
  {
    id: "process",
    group: "design",
    item: "Process design and datasheet",
    basis: "Process and thermal design basis, equipment datasheet and the guarantee figures issued for approval.",
    defaults: { endUser: "I", client: "A", ramsis: "R" },
  },
  {
    id: "design",
    group: "design",
    item: "Mechanical design calculations to ASME VIII Div.1",
    defaults: { endUser: "I", client: "A", ramsis: "R" },
  },
  {
    id: "drawings",
    group: "design",
    item: "GA, detailed fabrication drawings, nozzle orientation, weld map and cutting plan",
    defaults: { endUser: "I", client: "A", ramsis: "R" },
  },
  {
    id: "asbuilt",
    group: "design",
    item: "As-built drawings and the final documentation dossier",
    defaults: { endUser: "I", client: "C", ramsis: "R" },
  },
  {
    id: "itp",
    group: "design",
    item: "Inspection and test plan (ITP) and quality dossier",
    defaults: { endUser: "I", client: "A", ramsis: "R" },
  },
  {
    id: "material",
    group: "design",
    item: "Raw material procurement, mill certification and traceability",
    basis: "BOM-listed plates, heads, pipes, flanges, SRN nozzles and fasteners; final grades and quantities confirmed on the approved drawings.",
    defaults: { endUser: "-", client: "C", ramsis: "R" },
  },
  {
    id: "fabrication",
    group: "design",
    item: "Plate rolling, forming, shop fabrication, fit-up and assembly",
    basis: "Cutting, forming, fit-up and welding to the approved drawings and procedures.",
    defaults: { endUser: "-", client: "C", ramsis: "R" },
  },
  {
    id: "welding",
    group: "design",
    item: "Welding, WPS / PQR and welder qualification to ASME IX",
    defaults: { endUser: "-", client: "C", ramsis: "R" },
  },
  {
    id: "nde",
    group: "design",
    item: "Non-destructive examination (RT / UT / MT / PT)",
    defaults: { endUser: "I", client: "C", ramsis: "R" },
  },
  {
    id: "hydro",
    group: "design",
    item: "Hydrostatic test and dimensional inspection",
    defaults: { endUser: "I", client: "C", ramsis: "R" },
  },
  {
    id: "special",
    group: "design",
    item: "Special testing — PMI, hardness, impact, ferrite and cladding bond",
    basis: "Performed where supplementary tests are specified; other tests by agreement.",
    defaults: { endUser: "-", client: "C", ramsis: "R" },
  },
  {
    id: "pwht",
    group: "design",
    item: "Post-weld heat treatment (where specified)",
    defaults: { endUser: "-", client: "C", ramsis: "R" },
  },
  {
    id: "painting",
    group: "design",
    item: "Surface preparation and protective painting",
    basis: "Coating system, surface area, preparation grade and DFT to be agreed.",
    defaults: { endUser: "-", client: "C", ramsis: "R" },
  },
  {
    id: "stamp",
    group: "design",
    item: "ASME ‘U’ stamp design certification and National Board registration",
    defaults: { endUser: "I", client: "C", ramsis: "R" },
  },
  {
    id: "tpi",
    group: "design",
    item: "Third-party inspection (TPI) and client witness points",
    defaults: { endUser: "I", client: "R", ramsis: "C" },
  },
  {
    id: "nameplate",
    group: "design",
    item: "Equipment name plate",
    defaults: { endUser: "-", client: "I", ramsis: "R" },
  },
  {
    id: "lugs",
    group: "design",
    item: "Lifting lugs, trunnions, external support cleats, rings and earthing lugs",
    defaults: { endUser: "-", client: "C", ramsis: "R" },
  },
  {
    id: "saddles",
    group: "design",
    item: "Transportation saddles",
    basis: "Where required for the agreed transport mode.",
    defaults: { endUser: "-", client: "C", ramsis: "R" },
  },
  {
    id: "internals",
    group: "design",
    item: "Supply and fitting of internals (trays, demister, vortex breaker, distributor pipes, support rings)",
    basis: "BOM-listed internals only; catalyst and unlisted accessories are excluded.",
    defaults: { endUser: "-", client: "C", ramsis: "R" },
  },
  {
    id: "nitrogen",
    group: "design",
    item: "Nitrogen purging",
    basis: "Where specified on the datasheet.",
    defaults: { endUser: "-", client: "I", ramsis: "R" },
  },
  {
    id: "spares",
    group: "design",
    item: "Pre-commissioning spares — 200% gaskets, 10% bolts and nuts",
    defaults: { endUser: "-", client: "I", ramsis: "R" },
  },
  {
    id: "mdr",
    group: "design",
    item: "Manufacturing record book (MDR)",
    basis: "Agreed drawings, material certificates and inspection records, issued in PDF.",
    defaults: { endUser: "-", client: "A", ramsis: "R" },
  },
  {
    id: "packing",
    group: "design",
    item: "Seaworthy packing, marking and preservation",
    basis: "Suitable for the quoted Incoterm; export crating as a separately agreed option.",
    defaults: { endUser: "-", client: "I", ramsis: "R" },
  },
  {
    id: "transport",
    group: "design",
    item: "Transport from workshop to site",
    basis: "Per the quoted Incoterm; unloading and site storage by others.",
    defaults: { endUser: "-", client: "A", ramsis: "R" },
  },
  {
    id: "pm",
    group: "design",
    item: "Project management, expediting and progress reporting",
    defaults: { endUser: "I", client: "A", ramsis: "R" },
  },
  {
    id: "site",
    group: "design",
    item: "Site installation, commissioning and insulation / fireproofing",
    basis: "By others; support clips are supplied and welded. Insulation and refractory excluded unless added by written agreement.",
    defaults: { endUser: "R", client: "A", ramsis: "-" },
  },
  {
    id: "lifting",
    group: "design",
    item: "Lifting tools and tackles for site erection",
    basis: "By others; the equipment's own lifting lugs are in our scope.",
    defaults: { endUser: "R", client: "I", ramsis: "-" },
  },
  {
    id: "fabeng",
    group: "fabrication",
    item: "Fabrication engineering — shop drawings, weld maps and fabrication procedures",
    basis: "Based on the client-approved design; shop procedures and weld maps by the fabricator.",
    defaults: { endUser: "I", client: "R", ramsis: "C" },
  },
  {
    id: "cladding",
    group: "fabrication",
    item: "Cladding indicated in the BOM",
    basis: "Plate and head cladding as listed; method, coverage and inspection to be agreed.",
    defaults: { endUser: "-", client: "R", ramsis: "C" },
  },
  {
    id: "supports",
    group: "fabrication",
    item: "Supports and attachments beyond the BOM",
    basis: "BOM-listed saddle, skirt, ring and lug components only; final arrangement per the drawings.",
    defaults: { endUser: "-", client: "R", ramsis: "C" },
  },
  {
    id: "consumables",
    group: "fabrication",
    item: "Fabrication consumables",
    basis: "Welding and grinding consumables for the agreed shop scope.",
    defaults: { endUser: "-", client: "C", ramsis: "R" },
  },
  {
    id: "traceqc",
    group: "fabrication",
    item: "Material traceability and shop quality control",
    basis: "Certificate review, identification, visual and dimensional inspection.",
    defaults: { endUser: "I", client: "C", ramsis: "R" },
  },
  {
    id: "preservation",
    group: "fabrication",
    item: "Basic preservation and identification",
    basis: "Temporary protection, flange covers, tagging and loose-item identification; export packing is covered above.",
    defaults: { endUser: "-", client: "I", ramsis: "R" },
  },
];

/**
 * The order the matrix is printed in: the sequence in which the work actually
 * happens on the shop route, from process design through to dispatch, followed
 * by the shop-level block.
 */
const SCOPE_SEQUENCE = [
  "process",
  "design",
  "drawings",
  "itp",
  "pm",
  "material",
  "fabrication",
  "welding",
  "lugs",
  "saddles",
  "internals",
  "nde",
  "pwht",
  "hydro",
  "special",
  "painting",
  "nameplate",
  "nitrogen",
  "stamp",
  "tpi",
  "mdr",
  "spares",
  "asbuilt",
  "packing",
  "transport",
  "site",
  "lifting",
  "fabeng",
  "cladding",
  "supports",
  "consumables",
  "traceqc",
  "preservation",
];

export const SCOPE_ROWS: ScopeRowDef[] = SCOPE_SEQUENCE.map((id) => {
  const row = SCOPE_DEFS.find((r) => r.id === id);
  if (!row) throw new Error(`scope row ${id} is missing from SCOPE_DEFS`);
  return row;
});

export const scopeMark = (settings: ProposalSettings, row: ScopeRowDef, party: ScopeParty): ScopeMark => {
  const set = settings.scope?.[`${row.id}|${party}`];
  return (set as ScopeMark) || row.defaults[party];
};

// ---------------------------------------------------------------------------
// Document model — renderer independent, so Word and PDF print the same thing
// ---------------------------------------------------------------------------
export interface DocTable {
  head: string[];
  rows: string[][];
  /** relative column widths */
  widths?: number[];
  align?: ("left" | "right" | "center")[];
  /** the last row is a total — render it emphasised */
  emphasiseLast?: boolean;
  /** full-width band rows inserted before the given row index */
  bands?: { before: number; title: string }[];
  /** secondary text printed under a cell in a smaller muted face */
  sub?: (string | undefined)[][];
  /** programme bars, one per row, drawn inside the bar column */
  bars?: { start: number; days: number }[];
  barTotal?: number;
  barColumn?: number;
}

export interface DocSubsection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface DocSection {
  no: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  /** numbered list, each entry optionally carrying sub-numbered lines */
  items?: { text: string; subs?: string[] }[];
  subsections?: DocSubsection[];
  table?: DocTable;
  note?: string;
  /** opens a new part of the offer: a page break, a part heading, and numbering restarts */
  part?: string;
}

export interface DocMeta {
  label: string;
  value: string;
}

export interface PaymentMilestone {
  no: number;
  trigger: string;
  kind: "Material" | "Progress" | "Retention";
  pct: number;
  amount: number;
}

export interface MaterialCoverage {
  material: number;
  materialPct: number;
  materialPaidPct: number;
  materialPaid: number;
  covered: boolean;
}

export interface PriceRow {
  tag: string;
  description: string;
  qty: number;
  weight: number;
  unitPrice: number;
  amount: number;
  kind: "equipment" | "freight";
}

export interface PlanActivity {
  seq: number;
  code: string;
  activity: string;
  days: number;
  startDay: number;
  finishDay: number;
  startWeek: number;
  finishWeek: number;
}

export interface ManufacturingPlan {
  activities: PlanActivity[];
  totalDays: number;
  deliveryDays: number;
  deliveryWeeks: number;
  pwht: boolean;
}

export interface ProposalDoc {
  offerType: ProposalSettings["offerType"];
  title: string;
  subtitle: string;
  offerNo: string;
  revision: string;
  date: string;
  dateLabel: string;
  attention: string;
  client: string;
  clientAddress: string;
  endUser: string;
  subject: string;
  meta: DocMeta[];
  intro: string[];
  closing: string[];
  signature: string[];
  sections: DocSection[];
  payment: PaymentMilestone[];
  coverage: MaterialCoverage;
  deliveryWeeks: number;
  validityDays: number;
  priceRows: PriceRow[];
  plan: ManufacturingPlan;
  totals: { material: number; exWorks: number; freight: number; grand: number; weight: number };
  currency: CurrencyDef;
  priced: boolean;
  amountInWords: string;
  scopeTable: DocTable;
}

export interface ProposalInput {
  project: ProjectInfo;
  equipment: Equipment[];
  rates: RateBook;
  logistics: LogisticsSettings;
  sourcing: Record<string, string>;
  settings: ProposalSettings;
}

const fmtInt = (v: number) => Math.round(v).toLocaleString("en-US");
const fmtNum = (v: number, d = 1) =>
  Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "-";

const dateLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

const titleCase = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

// ---------------------------------------------------------------------------
// Amount in words — every offer closes with the price written out
// ---------------------------------------------------------------------------
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ""}`;
  return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` and ${below1000(n % 100)}` : ""}`;
}

export function numberInWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "Zero";
  const groups = [
    { size: 1e9, name: "Billion" },
    { size: 1e6, name: "Million" },
    { size: 1e3, name: "Thousand" },
  ];
  const parts: string[] = [];
  let rest = n;
  for (const g of groups) {
    if (rest >= g.size) {
      const count = Math.floor(rest / g.size);
      parts.push(`${below1000(count)} ${g.name}`);
      rest -= count * g.size;
    }
  }
  if (rest > 0) parts.push(below1000(rest));
  return parts.join(" ");
}

const MINOR_UNIT: Record<string, string> = {
  BHD: "fils",
  KWD: "fils",
  OMR: "baisa",
  SAR: "halalas",
  QAR: "dirhams",
  AED: "fils",
  USD: "cents",
  EUR: "cents",
};

export function amountInWords(amountBhd: number, currency: CurrencyDef): string {
  const value = amountBhd * currency.perBhd;
  const whole = Math.floor(value + 1e-9);
  const minorValue = Math.round((value - whole) * Math.pow(10, currency.decimals));
  const minor = minorValue > 0 ? ` and ${numberInWords(minorValue)} ${MINOR_UNIT[currency.code] ?? "cents"}` : "";
  return `${titleCase(currency.name)} ${numberInWords(whole)}${minor} only`;
}

// ---------------------------------------------------------------------------
// Payment schedule — the material must be fully funded before fabrication
// ---------------------------------------------------------------------------
function buildPayment(
  settings: ProposalSettings,
  material: number,
  grand: number,
): { payment: PaymentMilestone[]; coverage: MaterialCoverage } {
  const materialPct = grand > 0 ? (material / grand) * 100 : 0;
  const r1 = (v: number) => Math.round(v * 10) / 10;

  // contractual terms, fixed by the offer: 10% advance, 15% on design, 5% on the MDR
  const advance = 10;
  const design = 15;
  const mdr = 5;
  // retention sits at the bottom of the schedule, released on final acceptance
  const retention = Math.min(
    Math.max(0, Number.isFinite(settings.retentionPct) ? settings.retentionPct : 0),
    Math.max(0, 100 - advance - design - mdr),
  );
  // the material-receipt payment carries whatever the advance leaves of the material content
  const materialReceipt = r1(
    Math.max(0, Math.min(materialPct - advance, 100 - advance - design - mdr - retention)),
  );
  // monthly progress, hydro test and dispatch share the remaining balance
  const balance = Math.max(0, r1(100 - advance - design - materialReceipt - mdr - retention));
  const monthly = r1(balance * 0.6);
  const hydro = r1(balance * 0.1);
  // dispatch absorbs the rounding so the schedule totals 100%
  const dispatchStage = r1(Math.max(0, balance - monthly - hydro));

  const rows: PaymentMilestone[] = [
    { no: 1, trigger: "Advance along with the purchase order", kind: "Material", pct: advance, amount: 0 },
    { no: 2, trigger: "Against approval of the design and drawings", kind: "Progress", pct: design, amount: 0 },
    {
      no: 3,
      trigger: "Against material received at the Ramsis premises, with mill certificates and unpriced purchase order copies",
      kind: "Material",
      pct: materialReceipt,
      amount: 0,
    },
    {
      no: 4,
      trigger: "Against monthly progressive manufacturing / fabrication milestones",
      kind: "Progress",
      pct: monthly,
      amount: 0,
    },
    {
      no: 5,
      trigger: "Against completion of the hydrostatic test on the equipment, on a progressive basis",
      kind: "Progress",
      pct: hydro,
      amount: 0,
    },
    {
      no: 6,
      trigger: "Before dispatch of the equipment from the Ramsis workshop",
      kind: "Progress",
      pct: dispatchStage,
      amount: 0,
    },
    { no: 7, trigger: "On submission of the final documentation dossier (MDR)", kind: "Progress", pct: mdr, amount: 0 },
  ];
  if (retention > 0) {
    rows.push({
      no: rows.length + 1,
      trigger: "Retention — withheld until expiry of the defects liability period and the final acceptance certificate",
      kind: "Retention",
      pct: retention,
      amount: 0,
    });
  }
  const payment = rows.map((r) => ({ ...r, amount: (r.pct / 100) * grand }));
  const materialPaidPct = r1(advance + materialReceipt);

  return {
    payment,
    coverage: {
      material,
      materialPct: r1(materialPct),
      materialPaidPct,
      materialPaid: (materialPaidPct / 100) * grand,
      covered: materialPaidPct + 1e-6 >= materialPct,
    },
  };
}

// ---------------------------------------------------------------------------
// Manufacturing schedule — the shop route after purchase order receipt
// ---------------------------------------------------------------------------
/** Condensed from the twelve-line house plan: PWHT folds into NDE, packing into dispatch. */
const PLAN_ROUTE: { code: string; activity: string; days: number }[] = [
  { code: "ENG", activity: "Engineering, datasheet and design approval", days: 12 },
  { code: "PROC", activity: "Material procurement — plate and forging mill lead time", days: 54.5 },
  { code: "RECV", activity: "Material receipt, PMI, marking and traceability", days: 5 },
  { code: "CUT", activity: "Nesting, cutting, edge preparation and rolling", days: 11 },
  { code: "FIT", activity: "Fit-up of courses, heads, nozzles and internals", days: 12.5 },
  { code: "WELD", activity: "Welding to the approved WPS / PQR", days: 25 },
  { code: "NDE", activity: "Non-destructive examination, dimensional check and PWHT", days: 9.5 },
  { code: "HYDRO", activity: "Hydrostatic test, post-test NDE and drying", days: 4 },
  { code: "FIN", activity: "Painting, nameplate, documentation, preservation, packing and dispatch", days: 8 },
  { code: "BUFF", activity: "Contingency buffer", days: 14.5 },
];

/**
 * The route runs from purchase order receipt to dispatch and is scaled to the
 * quoted delivery, so the last line is the contingency the programme actually has.
 */
export function buildManufacturingPlan(settings: ProposalSettings, pwht: boolean): ManufacturingPlan {
  const route = PLAN_ROUTE.map((a) => (a.code === "NDE" && pwht ? { ...a, days: a.days + 3 } : a));
  const base = route.reduce((sum, a) => sum + a.days, 0) || 1;
  const deliveryWeeks =
    Number.isFinite(settings.deliveryWeeks) && settings.deliveryWeeks > 0 ? settings.deliveryWeeks : 40;
  const deliveryDays = deliveryWeeks * 7;
  const scale = deliveryDays / base;
  const round = (v: number) => Math.round(v * 2) / 2;

  let cursor = 0;
  const activities = route.map((a, i) => {
    const days = round(a.days * scale);
    const startDay = cursor;
    cursor = round(cursor + days);
    return {
      seq: i + 1,
      code: a.code,
      activity: a.activity,
      days,
      startDay,
      finishDay: cursor,
      startWeek: Math.floor(startDay / 7) + 1,
      finishWeek: Math.max(Math.floor(startDay / 7) + 1, Math.ceil(cursor / 7)),
    };
  });

  return { activities, totalDays: cursor, deliveryDays, deliveryWeeks, pwht };
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------
export function buildProposal(input: ProposalInput): ProposalDoc {
  const { project, equipment, rates, logistics, sourcing, settings } = input;
  const currency = getCurrency(project.currency);
  const money = (v: number) => formatMoney(v, project.currency);

  const linesPerEquipment = equipment.map((eq) => {
    const bom = buildEquipmentBom(eq, rates);
    const roll = rollupCost(eq, bom, rates);
    const weight = bom.reduce((a, i) => a + i.weight, 0) * eq.qty;
    return { eq, roll, weight };
  });

  const exWorks = linesPerEquipment.reduce((a, r) => a + r.roll.total * r.eq.qty, 0);
  const material = linesPerEquipment.reduce((a, r) => a + r.roll.material * r.eq.qty, 0);
  const weight = linesPerEquipment.reduce((a, r) => a + r.weight, 0);

  // ---- delivery leg, only when the offer is not ex-works ---------------------
  let freight = 0;
  if (logistics.incoterm !== "EXW" && equipment.length > 0) {
    const items = equipment.flatMap((eq) =>
      buildEquipmentBom(eq, rates).map((it) => ({
        ...it,
        qty: it.qty * eq.qty,
        qtySpare: (it.qtySpare ?? 0) * eq.qty,
        weight: it.weight * eq.qty,
        amount: it.amount * eq.qty,
      })),
    );
    const boq = buildBoq(equipment, items, rates);
    const landing = boq.lines.map((line) => ({
      line,
      breakdown: landedCost(line, sourcing[line.key] ?? logistics.defaultOrigin, logistics),
    }));
    const dest = destinationOf(logistics.destination);
    freight = landing.reduce(
      (a, e) => a + e.breakdown.exportFreight + e.breakdown.exportDuty + e.breakdown.insurance / 2 + e.breakdown.surcharge / 2,
      0,
    );
    if (dest.name !== WORKSHOP.country) freight += dest.clearance + logistics.documentation;
  }

  const grand = exWorks + freight;
  const priced = settings.offerType !== "Unpriced Commercial" && settings.offerType !== "Technical";
  const { payment, coverage } = buildPayment(settings, material, grand);
  const pwhtRequired = equipment.some((e) => e.pWHT === "Yes");
  const plan = buildManufacturingPlan(settings, pwhtRequired);

  const clientName = settings.client.trim() || project.client;
  const endUserName = settings.endUser.trim() || project.client;
  // a name that already ends in a full stop must not produce "Ltd.." in a sentence
  const endUserClean = endUserName.replace(/\.\s*$/, "");
  const subject =
    settings.subject.trim() ||
    `supply of ${equipment.map((e) => e.name).filter(Boolean).slice(0, 3).join(", ")}${equipment.length > 3 ? " and associated equipment" : ""}`;
  const totalQty = equipment.reduce((a, e) => a + e.qty, 0);
  const tags = equipment.map((e) => `${e.tag} (${e.name})`).join(", ");
  const dateText = dateLabel(settings.date);

  // one row per scope item, with a band wherever the group changes
  const scopeBands: { before: number; title: string }[] = [];
  SCOPE_ROWS.forEach((row, i) => {
    if (i === 0 || SCOPE_ROWS[i - 1].group !== row.group) {
      scopeBands.push({ before: i, title: SCOPE_GROUPS.find((g) => g.id === row.group)?.title ?? row.group });
    }
  });

  // the basis or limit sits under the item, in the same column, in a smaller face
  const scopeTable: DocTable = {
    head: ["#", "Scope item", "End user", "Client", "Ramsis"],
    widths: [0.4, 7.2, 0.7, 0.85, 0.7],
    align: ["center", "left", "center", "center", "center"],
    bands: scopeBands,
    sub: SCOPE_ROWS.map((row) => [undefined, row.basis, undefined, undefined, undefined]),
    rows: SCOPE_ROWS.map((row, i) => [
      String(i + 1),
      row.item,
      scopeMark(settings, row, "endUser"),
      scopeMark(settings, row, "client"),
      scopeMark(settings, row, "ramsis"),
    ]),
  };

  const priceRows: PriceRow[] = linesPerEquipment.map((r) => ({
    tag: r.eq.tag,
    description: `${r.eq.name}${r.eq.service ? ` — ${r.eq.service}` : ""}`,
    qty: r.eq.qty,
    weight: r.weight,
    unitPrice: r.roll.total,
    amount: r.roll.total * r.eq.qty,
    kind: "equipment",
  }));
  if (freight > 0) {
    priceRows.push({
      tag: "—",
      description: `Packing, freight, insurance and destination clearing to ${destinationOf(logistics.destination).name} (${logistics.incoterm})`,
      qty: 1,
      weight: 0,
      unitPrice: freight,
      amount: freight,
      kind: "freight",
    });
  }

  // ---- equipment schedule ---------------------------------------------------
  const equipmentTable: DocTable = {
    head: ["Tag", "Equipment", "Size ID × T/T", "Qty", "Material", "Weight (kg)"],
    widths: [0.9, 3.1, 1.5, 0.5, 1.5, 1.1],
    align: ["left", "left", "left", "center", "left", "right"],
    rows: linesPerEquipment.map(({ eq, weight: w }) => {
      const shellMat = eq.parts.shell?.[0]?.sh_mat || eq.parts.head?.[0]?.hd_mat || "SA-516 Gr.70";
      return [
        eq.tag,
        eq.name,
        `${fmtInt(eq.diameter)} × ${fmtInt(eq.ttLength)} mm`,
        String(eq.qty),
        shellMat,
        fmtInt(w),
      ];
    }),
  };

  const priceTable: DocTable = {
    head: ["Item", "Description", "Qty", "Weight (kg)", "Unit price", "Amount"],
    widths: [0.7, 4.2, 0.6, 1.0, 1.4, 1.5],
    align: ["left", "left", "center", "right", "right", "right"],
    emphasiseLast: true,
    rows: [
      ...priceRows.map((r) => [
        r.tag,
        r.description,
        String(r.qty),
        r.weight ? fmtInt(r.weight) : "—",
        priced ? money(r.unitPrice) : "—",
        priced ? money(r.amount) : "—",
      ]),
      [
        "",
        "Total — quoted price, excluding VAT",
        "",
        fmtInt(weight),
        "",
        priced ? money(grand) : "Withheld (unpriced commercial offer)",
      ],
    ],
  };

  const materialNos = payment
    .filter((p) => p.kind === "Material")
    .map((p) => p.no)
    .join(" and ");
  const retentionPct = Number.isFinite(settings.retentionPct) ? Math.max(0, settings.retentionPct) : 0;

  const paymentTable: DocTable = {
    head: ["No", "Milestone", "%", "Amount"],
    widths: [0.4, 6.6, 1.0, 1.6],
    align: ["center", "left", "right", "right"],
    emphasiseLast: true,
    rows: [
      ...payment.map((p) => [String(p.no), p.trigger, `${fmtNum(p.pct, 1)}%`, priced ? money(p.amount) : "—"]),
      ["", "Total", `${fmtNum(payment.reduce((a, p) => a + p.pct, 0), 1)}%`, priced ? money(grand) : "—"],
    ],
  };

  const planTable: DocTable = {
    head: ["#", "Activity", "Weeks from PO", "Duration (weeks)"],
    widths: [0.4, 4.6, 1.9, 1.3],
    align: ["center", "left", "center", "right"],
    rows: plan.activities.map((a) => [
      String(a.seq),
      a.activity,
      a.startWeek === a.finishWeek ? `W${a.startWeek}` : `W${a.startWeek} – W${a.finishWeek}`,
      fmtNum(a.days / 7, 1),
    ]),
    bars: plan.activities.map((a) => ({ start: a.startDay, days: a.days })),
    barTotal: plan.totalDays,
    barColumn: 2,
  };

  // ---- sections -------------------------------------------------------------
  const sections: DocSection[] = [];
  let no = 0;
  const add = (title: string, body: Omit<DocSection, "no" | "title"> = {}) => {
    // a section that opens a part starts on a fresh page and renumbers from 01
    if (body.part) no = 0;
    sections.push({ no: String(++no), title, ...body });
  };

  const technical = settings.offerType !== "Commercial" && settings.offerType !== "Unpriced Commercial";

  if (technical) {
    add("Applicable documents", {
      items: [
        {
          text: "Offer and enquiry",
          subs: [
            `Our offer ${settings.offerNo} Rev. ${settings.revision || "R0"} dated ${dateText}.`,
            `Enquiry ${project.projectNo} — ${project.projectName}${settings.enquiryRef ? `, RFQ reference ${settings.enquiryRef}` : ""}.`,
          ],
        },
        {
          text: "Reference documents",
          subs: [
            `Mechanical datasheet(s) and drawings issued for ${tags}, as provided by ${endUserClean}.`,
            "ASME Boiler & Pressure Vessel Code, Section VIII, Division 1 (latest edition), ASME Section IX and ASME Section V.",
          ],
        },
      ],
    });
  }

  add("Scope matrix — end user, client and Ramsis", {
    table: scopeTable,
    paragraphs: [
      "Legend: R — responsible / executes · A — approves · C — consulted / reviews · I — informed · “-” not in this scope.",
    ],
  });

  if (technical) {
    add("Manufacturing schedule after receipt of PO", {
      paragraphs: [
        `The shop route below covers ${totalQty} item(s), from purchase order receipt to dispatch, and is scaled to the ${plan.deliveryWeeks}-week delivery quoted. Stages follow one another, with planned overlap absorbed inside each stage.`,
      ],
      table: planTable,
      note: plan.pwht
        ? "PWHT is included and sits inside the NDE stage; pushing or removing it from the furnace shifts the hydrostatic test, painting and dispatch later by about half a week."
        : "PWHT is not required for this scope; if it is added, the NDE stage grows by about half a week and the hydrostatic test, painting and dispatch shift accordingly.",
    });

    add("Equipment schedule", {
      paragraphs: [
        `The offer covers ${totalQty} item(s) of pressure equipment, ${fmtInt(weight)} kg total shop weight, designed and manufactured at our Sitra workshop.`,
      ],
      table: equipmentTable,
      note: "Weights are estimating-grade and exclude packing, transport saddles and loose internals.",
    });

    add("Material certification", {
      paragraphs: [
        "Material certification for all pressure parts and parts directly welded to pressure parts is to EN 10204 type 3.1; where a type 3.1 certificate is not available, a type 3.2 certificate is produced.",
        "Material certification for non-pressure parts is to EN 10204 type 2.2. Mill test certificates are made available to the client and the third-party inspector on request before fabrication starts.",
      ],
    });

    add("Manufacturing location", {
      paragraphs: [
        `Ramsis Engineering, ${WORKSHOP.city}, Kingdom of ${WORKSHOP.country}. Port of loading: ${WORKSHOP.port}.`,
        "Coordinates: 26.074806, 50.603434. Quality system to ISO 9001:2015.",
      ],
    });

    add("Packing and transportation", {
      bullets: [
        "All parts are cleaned of loose scale, dirt and foreign material before packing and transportation.",
        "Temporary transport bracing is supplied with the equipment for horizontal transport where required.",
        "Vessels are nitrogen purged where specified, properly braced and secured to prevent damage in transit.",
        "Packing, marking and preservation are to a seaworthy standard suitable for the quoted incoterm and destination.",
      ],
    });

    add("Exclusions", {
      paragraphs: ["The following are excluded from this offer unless expressly stated elsewhere:"],
      bullets: [
        "Third-party inspection (TPI) charges for raw material and fabricated items, where the client requires a nominated agency.",
        "Cathodic protection.",
        "Insulation and fireproofing (support clips are supplied and welded).",
        "Supply of anchor bolts and foundation materials.",
        "Any work at site, site assistance, installation, erection and commissioning.",
        "Unloading, storage and preservation at site.",
        "Statutory approvals and permits other than the ASME ‘U’ stamp registration.",
      ],
    });

    add("General notes and clarifications", {
      bullets: [
        "This offer is based on the datasheet, drawings and RFQ documents issued for this enquiry; any change in scope or requirement has a commercial impact.",
        `The offer is based on a total supply quantity of ${totalQty} item(s); a change in quantity has both delivery and price implications.`,
        "The offer is based on the sizes and materials indicated on the datasheet. A higher material grade may be substituted on non-availability, with prior written approval.",
        "All material is procured from the client-approved vendor list where one is specified.",
        "Welding procedure qualification is to ASME Section IX; the quality system is to ISO 9001:2015.",
        "Weights and dimensions are estimating-grade; final values are confirmed on approved fabrication drawings.",
        "Items not expressly listed in the scope of supply are excluded.",
        ...(settings.notes.trim() ? [settings.notes.trim()] : []),
      ],
    });

    add("Delivery conditions", {
      paragraphs: [`Delivery is ${settings.deliveryWeeks} weeks from purchase order acceptance and receipt of the final approved datasheet, subject to:`],
      bullets: [
        "Drawings and documents approved within one week of submission, electronically or by courier.",
        "Removal of any engineering hold within two weeks of purchase order.",
        "No hold on any activity — design, drawings, order placement, manufacturing or inspection — due to information pending from the client or end user.",
        "No delay in approval of final documentation.",
      ],
    });

    add("Defects liability / mechanical guarantee", {
      paragraphs: [
        `${settings.warrantyMonths} months from the date the plant is put into operation, or ${settings.warrantyExWeeks} months from ex-works ${WORKSHOP.city}, ${WORKSHOP.country} delivery, whichever is earlier.`,
      ],
    });
  } else {
    add("Scope summary", {
      paragraphs: [
        `The offer covers ${totalQty} item(s) of pressure equipment — ${tags} — designed, fabricated, tested, painted and packed at our ${WORKSHOP.city} workshop to ASME Section VIII Division 1, with the scope split shown in the matrix above.`,
      ],
      bullets: [
        "Engineering: mechanical design calculations, fabrication drawings, ASME ‘U’ stamp certification.",
        "Supply: material, fabrication, welding, NDE, hydro test, painting, internals and pre-commissioning spares.",
        "Excluded: third-party inspection, insulation, fireproofing, anchor bolts and any site work.",
      ],
    });
    add("Equipment schedule", { table: equipmentTable });
  }

  // ---- commercial -----------------------------------------------------------
  if (settings.offerType !== "Technical") {
    add("Price basis", {
      part: settings.offerType === "Techno-Commercial" ? "Commercial Proposal" : undefined,
      paragraphs: [
        priced
          ? `Prices are in ${currency.name} (${currency.code}), ${logistics.incoterm === "EXW" ? `ex-works ${WORKSHOP.city}, ${WORKSHOP.country}` : `${logistics.incoterm} ${destinationOf(logistics.destination).name}`}, and exclude VAT.`
          : "This is an unpriced commercial offer: prices are deliberately withheld so that the technical and commercial terms can be reviewed and agreed before the priced offer is issued.",
        priced
          ? "Prices are firm for the validity period of this offer and include design, material, fabrication, welding, testing, painting, packing and the documentation dossier."
          : "The scope, schedule, payment terms and delivery basis below are binding on the priced offer that follows.",
      ],
      table: priceTable,
      note: priced
        ? `Amount in words: ${amountInWords(grand, currency)}.`
        : "Prices, taxes and the amount in words are issued with the priced commercial offer.",
    });

    add("Payment schedule", {
      paragraphs: [
        `Payment terms are structured so that 100% of the material cost is recovered through material payments before fabrication starts. The material content of this price is ${money(material)} (${fmtNum(coverage.materialPct, 1)}% of the quoted value); material milestones ${materialNos} total ${fmtNum(coverage.materialPaidPct, 1)}% of the price${priced ? ` — ${money(coverage.materialPaid)}` : ""}.`,
        "All payments are released against the milestone evidence stated below; material payments are supported by unpriced purchase order copies and mill certificates.",
        `The advance is 10% with the purchase order, 15% on approval of the design and drawings, and 5% on the final documentation dossier (MDR).${retentionPct > 0 ? ` A retention of ${fmtNum(retentionPct, 1)}% is withheld from the milestones and released on the final acceptance certificate.` : ""}`,
      ],
      table: paymentTable,
      note: coverage.covered
        ? "Material is fully funded by the material milestones — no material is carried by Ramsis into fabrication."
        : "Warning: the material milestones do not yet cover the material content — increase the advance or the material release percentage.",
    });

    add("Payment period", { paragraphs: [`${settings.paymentDays} days from the date of invoice submission.`] });

    add("Validity", {
      paragraphs: [
        `${settings.validityDays} days from the date of this offer (${dateText}). Prices and delivery are subject to re-confirmation after that date.`,
      ],
    });

    add("Delivery", {
      paragraphs: [
        `${settings.deliveryWeeks} weeks from purchase order acceptance and receipt of the final approved datasheet, ${logistics.incoterm === "EXW" ? `ex-works ${WORKSHOP.city}, ${WORKSHOP.country}` : `${logistics.incoterm} ${destinationOf(logistics.destination).name}`}.`,
        "Delivery is subject to drawing approval within one week of submission, removal of engineering holds within two weeks of purchase order, and no delay in the approval of final documentation.",
      ],
    });

    add("Taxes and duties", {
      paragraphs: [
        "All prices exclude VAT. Import duty, customs clearance and any local taxes at the destination are to the client's account unless the quoted incoterm is DDP.",
        `Prices are quoted in ${currency.name}; payment is in ${currency.code} unless otherwise agreed in the purchase order.`,
      ],
    });
  }

  // ---- cover letter ---------------------------------------------------------
  const offerIntro = [
    `Thank you again for considering Ramsis Engineering for ${subject} for ${endUserClean}.`,
    `We have carefully reviewed the RFQ documents and completed our ${technical ? "mechanical design" : "preliminary review"} to identify the key material requirements for ${subject}${totalQty > 1 ? ` (${totalQty} nos.)` : " (1 no.)"}.`,
    `This ${settings.offerType.toLowerCase()} offer sets out our scope, the split of responsibilities between the end user, the client and Ramsis, the delivery basis and${priced ? " our firm price" : " the commercial terms"}. It reflects our experience with comparable pressure equipment and a shop loading plan that accelerates material procurement and fabrication.`,
    "We trust our offer meets your requirements. Should you require any further information or clarification, please do not hesitate to contact us.",
  ];

  return {
    offerType: settings.offerType,
    title:
      settings.offerType === "Techno-Commercial"
        ? "TECHNO - COMMERCIAL OFFER"
        : settings.offerType === "Unpriced Commercial"
          ? "UNPRICED COMMERCIAL OFFER"
          : settings.offerType === "Technical"
            ? "TECHNICAL OFFER"
            : "COMMERCIAL OFFER",
    subtitle: `${settings.offerNo} · Rev. ${settings.revision || "R0"} · ${dateText}`,
    offerNo: settings.offerNo,
    revision: settings.revision || "R0",
    date: settings.date,
    dateLabel: dateText,
    attention: settings.attention,
    client: clientName,
    clientAddress: settings.clientAddress,
    endUser: endUserName,
    subject,
    meta: [
      { label: "Offer no.", value: `${settings.offerNo} Rev. ${settings.revision || "R0"}` },
      { label: "Date", value: dateText },
      { label: "Client (EPC)", value: clientName },
      { label: "End user", value: endUserName },
      { label: "Project", value: `${project.projectNo} — ${project.projectName}` },
      { label: "Enquiry / RFQ", value: settings.enquiryRef || project.projectNo },
      { label: "Scope", value: `${totalQty} item(s) · ${fmtInt(weight)} kg` },
      { label: "Validity", value: `${settings.validityDays} days` },
    ],
    intro: offerIntro,
    closing: ["Thanking you and assuring you of our best attention and service at all times.", "Yours faithfully,"],
    signature: [
      settings.preparedBy,
      settings.preparedRole,
      "Ramsis Engineering",
      `Kingdom of ${WORKSHOP.country}`,
      `Tel: ${settings.phone}`,
      `Mob: ${settings.mobile}`,
      `e-mail: ${settings.email}`,
    ],
    sections,
    payment,
    coverage,
    deliveryWeeks: settings.deliveryWeeks,
    validityDays: settings.validityDays,
    priceRows,
    plan,
    totals: { material, exWorks, freight, grand, weight },
    currency,
    priced,
    amountInWords: amountInWords(grand, currency),
    scopeTable,
  };
}

export const proposalFileName = (doc: ProposalDoc, ext: string) =>
  `${doc.offerNo.replace(/[^\w-]+/g, "_")}_${doc.offerType.replace(/[^\w]+/g, "_")}_${doc.revision}.${ext}`;
