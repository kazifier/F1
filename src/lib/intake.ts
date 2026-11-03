// ---------------------------------------------------------------------------
// Document -> equipment data. Turns either an AI response or raw document text
// into a reviewable set of header values + nozzle rows for the estimator.
// Every number is normalised to the app's units: mm, kPa(g), deg C.
// ---------------------------------------------------------------------------
import { EQUIPMENT_TYPES, HEAD_TYPES, MATERIALS, NPS_LIST, RATING_LIST, pipeOd } from "./catalog";
import { defaultRow } from "./parts";
import type { Equipment, PartRow } from "./types";

export type FieldKey =
  | "tag"
  | "name"
  | "type"
  | "service"
  | "qty"
  | "orientation"
  | "diameter"
  | "ttLength"
  | "shellThk"
  | "headType"
  | "designPressure"
  | "designTemperature"
  | "mdmt"
  | "corrosionAllowance"
  | "jointEfficiency"
  | "radiography"
  | "pWHT"
  | "paintSystem"
  | "insulationThk"
  | "inspection"
  | "material";

export interface FieldMeta {
  label: string;
  unit?: string;
  kind: "text" | "number" | "select";
  options?: string[];
  hint?: string;
}

export const FIELD_META: Record<FieldKey, FieldMeta> = {
  tag: { label: "Tag no.", kind: "text", hint: "equipment tag" },
  name: { label: "Description", kind: "text" },
  type: { label: "Equipment type", kind: "select", options: EQUIPMENT_TYPES },
  service: { label: "Service", kind: "text" },
  qty: { label: "Quantity", kind: "number" },
  orientation: { label: "Orientation", kind: "select", options: ["Horizontal", "Vertical"] },
  diameter: { label: "Inside diameter", unit: "mm", kind: "number" },
  ttLength: { label: "T-T length", unit: "mm", kind: "number" },
  shellThk: { label: "Shell thickness", unit: "mm", kind: "number" },
  headType: { label: "Head type", kind: "select", options: HEAD_TYPES },
  designPressure: { label: "Design pressure", unit: "kPa(g)", kind: "number" },
  designTemperature: { label: "Design temperature", unit: "°C", kind: "number" },
  mdmt: { label: "MDMT", unit: "°C", kind: "number" },
  corrosionAllowance: { label: "Corrosion allowance", unit: "mm", kind: "number" },
  jointEfficiency: { label: "Joint efficiency E", kind: "number" },
  radiography: { label: "Radiography", kind: "select", options: ["Full RT", "Spot RT", "No RT"] },
  pWHT: { label: "PWHT", kind: "select", options: ["No", "Yes"] },
  paintSystem: { label: "Paint system", kind: "text" },
  insulationThk: { label: "Insulation", unit: "mm", kind: "number" },
  inspection: { label: "Inspection", kind: "select", options: ["3.1", "3.2"] },
  material: { label: "Shell material", kind: "text" },
};

export const FIELD_ORDER: FieldKey[] = [
  "tag",
  "name",
  "type",
  "service",
  "qty",
  "orientation",
  "diameter",
  "ttLength",
  "shellThk",
  "headType",
  "designPressure",
  "designTemperature",
  "mdmt",
  "corrosionAllowance",
  "jointEfficiency",
  "radiography",
  "pWHT",
  "insulationThk",
  "paintSystem",
  "inspection",
  "material",
];

export interface ExtractedValue {
  value: number | string;
  confidence: number; // 0..1
  source: string; // "page 2 · Design conditions"
}

export interface ExtractedNozzle {
  mark: string;
  size: string;
  schedule: string;
  rating: string;
  facing: string;
  service: string;
  repad: boolean;
  blind: boolean;
  qty: number;
  confidence: number;
  source: string;
}

export interface Extraction {
  source: "ai" | "rules";
  model?: string;
  values: Partial<Record<FieldKey, ExtractedValue>>;
  nozzles: ExtractedNozzle[];
  documents: string[];
  notes: string[];
  warnings: string[];
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// unit handling
// ---------------------------------------------------------------------------
const num = (v: unknown): number | undefined => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const m = v.replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/** length to mm */
export function toMm(value: unknown, unit?: string): number | undefined {
  const n = num(value);
  if (n === undefined) return undefined;
  const u = (unit ?? "").toLowerCase().replace(/\./g, "");
  if (u.startsWith("in") || u === '"' || u.includes("inch")) return n * 25.4;
  if (u === "cm") return n * 10;
  if (u === "m" || u === "meter" || u === "metre") return n * 1000;
  return n; // mm assumed
}

/** pressure to kPa(g) */
export function toKpa(value: unknown, unit?: string): number | undefined {
  const n = num(value);
  if (n === undefined) return undefined;
  const u = (unit ?? "").toLowerCase().replace(/\s/g, "");
  if (u.startsWith("mpa")) return n * 1000;
  if (u.startsWith("bar")) return n * 100;
  if (u.startsWith("psi")) return n * 6.894757;
  if (u.startsWith("kg")) return n * 98.0665;
  if (u.startsWith("mbar")) return n / 10;
  if (u.startsWith("pa")) return n / 1000;
  return n; // kPa assumed
}

/** temperature to deg C */
export function toC(value: unknown, unit?: string): number | undefined {
  const n = num(value);
  if (n === undefined) return undefined;
  const u = (unit ?? "").toLowerCase().replace(/[°.\s]/g, "");
  if (u.startsWith("f")) return ((n - 32) * 5) / 9;
  return n;
}

export const round = (v: number, d = 2) => +v.toFixed(d);

// ---------------------------------------------------------------------------
// canonicalisation helpers
// ---------------------------------------------------------------------------
export function canonicalMaterial(input: string): string | undefined {
  const s = input.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return undefined;
  const exact = MATERIALS.find((m) => m.name.toLowerCase().replace(/[^a-z0-9]/g, "") === s);
  if (exact) return exact.name;
  const partial = MATERIALS.find((m) => {
    const t = m.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    return t.length > 5 && (t.includes(s) || s.includes(t)) && Math.abs(t.length - s.length) < 8;
  });
  return partial?.name;
}

export function canonicalHead(input: string): string | undefined {
  const s = input.toLowerCase();
  if (/2\s*:\s*1|ellipsoid/.test(s)) return HEAD_TYPES[0];
  if (/torisph|f\s*&\s*d|flanged\s*and\s*dished|dished/.test(s)) return HEAD_TYPES[1];
  if (/hemisph/.test(s)) return HEAD_TYPES[2];
  if (/flat/.test(s)) return HEAD_TYPES[3];
  if (/con|cone/.test(s)) return HEAD_TYPES[4];
  return undefined;
}

export function canonicalType(input: string): string | undefined {
  const s = input.toLowerCase();
  if (/column|tower/.test(s)) return "Column / Tower";
  if (/exchanger/.test(s)) return "Heat Exchanger";
  if (/reactor/.test(s)) return "Reactor";
  if (/separator/.test(s)) return "Separator";
  if (/knock\s*out|ko\s*drum/.test(s)) return "Knock Out Drum";
  if (/storage|atmospheric\s*tank/.test(s)) return "Storage Tank";
  if (/head|dish/.test(s)) return "Dish End / Head";
  if (/skid|structural/.test(s)) return "Skid / Structural";
  if (/vessel|drum|tank/.test(s)) return "Pressure Vessel";
  const hit = EQUIPMENT_TYPES.find((t) => t.toLowerCase() === s.trim());
  return hit;
}

export function canonicalRating(input: string | number | undefined): string | undefined {
  if (input === undefined) return undefined;
  const s = String(input);
  const n = num(s);
  if (n === undefined) return undefined;
  return RATING_LIST.find((r) => Number(r.replace("#", "")) === n) ?? `${n}#`;
}

export function canonicalSize(input: string | number | undefined): string | undefined {
  if (input === undefined) return undefined;
  const raw = String(input).trim();
  if (NPS_LIST.includes(raw) || NPS_LIST.includes(`${raw}"`)) return NPS_LIST.includes(raw) ? raw : `${raw}"`;
  const dn = raw.match(/^\s*dn\s*(\d+(?:\.\d+)?)/i);
  if (dn) {
    const mm = Number(dn[1]);
    let best: string | undefined;
    let delta = Infinity;
    for (const nps of NPS_LIST) {
      const od = pipeOd(nps);
      const d = Math.abs(od - mm);
      if (d < delta) {
        delta = d;
        best = nps;
      }
    }
    if (best && delta <= 12) return best;
  }
  const inch = num(raw);
  if (inch === undefined) return undefined;
  if (NPS_LIST.includes(`${inch}"`)) return `${inch}"`;
  const hit = NPS_LIST.find((n) => Math.abs(parseFloat(n) - inch) < 0.01);
  return hit;
}

const bool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v > 0;
  return /^(y|yes|true|req|required)$/i.test(String(v ?? "").trim());
};

// ---------------------------------------------------------------------------
// AI response -> Extraction
// ---------------------------------------------------------------------------
type AnyRec = Record<string, unknown>;

const pick = (rec: AnyRec, ...keys: string[]) => {
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null && rec[k] !== "") return rec[k];
  }
  return undefined;
};

export function coerceExtraction(raw: unknown, model?: string): Extraction {
  const root = (raw ?? {}) as AnyRec;
  const eq = ((root.equipment ?? root.header ?? root) as AnyRec) ?? {};
  const conf = (root.confidence ?? {}) as AnyRec;
  const src = (root.sources ?? root.source_notes ?? {}) as AnyRec;
  const values: Partial<Record<FieldKey, ExtractedValue>> = {};

  const text = (key: FieldKey, ...keys: string[]) => {
    const v = pick(eq, key, ...keys);
    if (typeof v !== "string" || !v.trim()) return;
    values[key] = { value: v.trim(), confidence: conf[key] === undefined ? 0.7 : Number(conf[key]), source: String(src[key] ?? "document") };
  };
  const number = (key: FieldKey, unit: string | undefined, conv: (v: unknown, u?: string) => number | undefined, ...keys: string[]) => {
    const v = pick(eq, key, ...keys);
    if (v === undefined) return;
    const n = conv(v, unit);
    if (n === undefined) return;
    // snap values that are unit-conversion noise (78.74 in -> 2000.00) but keep 0.85 precision
    const rounded = Math.abs(n - Math.round(n)) < 0.02 ? Math.round(n) : round(n, 2);
    values[key] = { value: rounded, confidence: conf[key] === undefined ? 0.7 : Number(conf[key]), source: String(src[key] ?? "document") };
  };

  text("tag", "tag_no", "tagNo");
  text("name", "description");
  text("service");
  text("paintSystem", "paint_system", "paint");
  number("qty", undefined, num);

  const typeRaw = pick(eq, "type", "equipment_type");
  if (typeof typeRaw === "string") {
    const t = canonicalType(typeRaw);
    if (t) values.type = { value: t, confidence: conf.type === undefined ? 0.7 : Number(conf.type), source: String(src.type ?? "document") };
  }
  const orient = pick(eq, "orientation");
  if (typeof orient === "string" && /vert|horiz/i.test(orient)) {
    values.orientation = {
      value: /vert/i.test(orient) ? "Vertical" : "Horizontal",
      confidence: conf.orientation === undefined ? 0.8 : Number(conf.orientation),
      source: String(src.orientation ?? "document"),
    };
  }

  number("diameter", pick(eq, "diameter_unit", "diameterUnit") as string | undefined, toMm, "diameter", "insideDiameter", "id");
  number("ttLength", pick(eq, "ttLength_unit", "ttUnit") as string | undefined, toMm, "ttLength", "tt_length", "length");
  number("shellThk", pick(eq, "shellThk_unit", "thicknessUnit") as string | undefined, toMm, "shellThk", "shell_thickness");
  number("designPressure", pick(eq, "designPressure_unit", "pressureUnit") as string | undefined, toKpa, "designPressure", "design_pressure");
  number("designTemperature", pick(eq, "designTemperature_unit", "temperatureUnit") as string | undefined, toC, "designTemperature", "design_temperature");
  number("mdmt", pick(eq, "mdmt_unit") as string | undefined, toC, "mdmt");
  number("corrosionAllowance", undefined, toMm, "corrosionAllowance", "ca");
  number("jointEfficiency", undefined, num, "jointEfficiency", "E");
  number("insulationThk", undefined, toMm, "insulationThk", "insulation");

  const headRaw = pick(eq, "headType", "head");
  if (typeof headRaw === "string") {
    const h = canonicalHead(headRaw);
    if (h) values.headType = { value: h, confidence: conf.headType === undefined ? 0.7 : Number(conf.headType), source: String(src.headType ?? "document") };
  }
  const rtRaw = pick(eq, "radiography", "rt");
  if (typeof rtRaw === "string") {
    const rt = /full|100|double/i.test(rtRaw) ? "Full RT" : /spot|partial|single/i.test(rtRaw) ? "Spot RT" : /none|no\b|nil/i.test(rtRaw) ? "No RT" : undefined;
    if (rt) values.radiography = { value: rt, confidence: conf.radiography === undefined ? 0.75 : Number(conf.radiography), source: String(src.radiography ?? "document") };
  }
  const pwhtRaw = pick(eq, "pWHT", "pwht");
  if (pwhtRaw !== undefined && (typeof pwhtRaw === "string" || typeof pwhtRaw === "boolean")) {
    values.pWHT = {
      value: bool(pwhtRaw) ? "Yes" : "No",
      confidence: conf.pWHT === undefined ? 0.75 : Number(conf.pWHT),
      source: String(src.pWHT ?? "document"),
    };
  }
  const inspRaw = pick(eq, "inspection", "certification");
  if (typeof inspRaw === "string") {
    const insp = /3\s*\.\s*2|3\.2/.test(inspRaw) ? "3.2" : /3\s*\.\s*1|3\.1/.test(inspRaw) ? "3.1" : undefined;
    if (insp) values.inspection = { value: insp, confidence: conf.inspection === undefined ? 0.7 : Number(conf.inspection), source: String(src.inspection ?? "document") };
  }
  const matRaw = pick(eq, "material", "shellMaterial", "shell_material");
  if (typeof matRaw === "string") {
    const name = canonicalMaterial(matRaw) ?? matRaw.trim();
    values.material = { value: name, confidence: conf.material === undefined ? 0.7 : Number(conf.material), source: String(src.material ?? "document") };
  }

  const nozzles: ExtractedNozzle[] = [];
  const list = (root.nozzles ?? []) as AnyRec[];
  for (const n of Array.isArray(list) ? list : []) {
    const size = canonicalSize(pick(n, "size", "nps", "dn") as string | number | undefined);
    if (!size) continue;
    nozzles.push({
      mark: String(pick(n, "mark", "id", "tag") ?? `N${nozzles.length + 1}`).trim(),
      size,
      schedule: String(pick(n, "schedule", "sch") ?? "40"),
      rating: canonicalRating(pick(n, "rating", "class") as string | undefined) ?? "150#",
      facing: String(pick(n, "facing", "face") ?? "RF").toUpperCase().replace(/[^A-Z]/g, "") || "RF",
      service: String(pick(n, "service", "description") ?? ""),
      repad: bool(pick(n, "repad", "pad")),
      blind: bool(pick(n, "blind", "blindFlange")),
      qty: num(pick(n, "qty", "quantity")) ?? 1,
      confidence: n.confidence === undefined ? 0.7 : Number(n.confidence),
      source: String(n.source ?? "document"),
    });
  }

  const warnings = Array.isArray(root.warnings) ? root.warnings.map(String) : [];
  const notes = Array.isArray(root.notes) ? root.notes.map(String) : [];

  return { source: "ai", model, values, nozzles, documents: [], notes, warnings, raw };
}

// ---------------------------------------------------------------------------
// Rule-based extraction — works with no API key at all, and as a cross-check
// on the AI answer. Deterministic, conservative, quotes what it matched.
// ---------------------------------------------------------------------------
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function lineAround(text: string, index: number): string {
  const start = text.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const end = text.indexOf("\n", index);
  return clean(text.slice(start, end === -1 ? text.length : end)).slice(0, 160);
}

interface Hit {
  value: string | number;
  quote: string;
  confidence: number;
}

function grab(text: string, re: RegExp): Hit | undefined {
  const m = re.exec(text);
  if (!m) return undefined;
  return { value: clean(m[1] ?? m[0]), quote: lineAround(text, m.index), confidence: 0.62 };
}

export function rulesExtract(text: string, documents: string[] = []): Extraction {
  const values: Partial<Record<FieldKey, ExtractedValue>> = {};
  const put = (key: FieldKey, hit: Hit | undefined, transform?: (v: string) => number | string | undefined, confidence = 0.62) => {
    if (!hit) return;
    const raw = typeof hit.value === "number" ? String(hit.value) : hit.value;
    const value = transform ? transform(raw) : raw;
    if (value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value))) return;
    values[key] = { value, confidence, source: hit.quote };
  };

  put("tag", grab(text, /(?:tag\s*(?:no\.?|number|#)?|equipment\s*tag)\s*[:\-]?\s*([A-Z0-9][A-Z0-9/_-]{2,20})/i), (v) => v.replace(/[^\x20-\x7E]/g, "").trim(), 0.8);
  if (!values.tag) put("tag", grab(text, /\b(\d{1,2}-[A-Z]{1,3}-\d{2,4}[A-Z]?)\b/), undefined, 0.7);

  put(
    "name",
    grab(text, /(?:description|equipment\s*name|item\s*name)\s*[:\-]\s*([A-Za-z0-9(),\/&.\- ]{4,70})/i),
    undefined,
    0.7,
  );
  put("service", grab(text, /(?:service|fluid|medium)\s*[:\-]\s*([A-Za-z0-9(),\/&.\- +]{3,70})/i), undefined, 0.6);

  const orient = /\b(vertical|horizontal)\b/i.exec(text);
  if (orient) {
    put("orientation", { value: orient[1], quote: lineAround(text, orient.index), confidence: 0.72 }, (v) => (/vert/i.test(v) ? "Vertical" : "Horizontal"), 0.72);
  }

  put(
    "diameter",
    grab(text, /(?:inside\s*diameter|internal\s*diameter|i\.?\s*d\.?|diameter|dia\.?)\s*(?:\(mm\))?\s*[:\-]?\s*(?:DN\s*)?([\d.,]{2,7})\s*(mm|m\b|inch|in\b|")?/i),
    (v) => {
      const n = num(v);
      return n === undefined ? undefined : round(n, 2);
    },
    0.7,
  );
  put(
    "ttLength",
    grab(text, /(?:t\s*[-/]\s*t|tangent\s*to\s*tangent|tan\s*[-–]\s*tan|seam\s*to\s*seam|s\s*[-/]\s*s|overall\s*length|length)\s*(?:\(mm\))?\s*[:\-]?\s*([\d.,]{2,7})\s*(mm|m\b)?/i),
    (v) => num(v),
    0.66,
  );
  put(
    "shellThk",
    grab(text, /(?:shell|plate|cylinder)\s*(?:thickness|thk\.?)?[^0-9\n]{0,25}?([\d.,]{1,6})\s*(mm)?/i),
    (v) => num(v),
    0.62,
  );
  put("qty", grab(text, /quantity\s*[:\(]?\s*(\d{1,3})\b/i), (v) => num(v), 0.6);

  const pr = /design\s*pressure\s*(?:\(?[a-z/]+\)?)?\s*[:\-]?\s*(?:min\.?\s*)?(-?[\d.,]+)\s*(barg|bar\s*g|bar|kpa|kpa\(g\)|mpa|psi|psig|kg\/cm2|kg\/cm²)?/i.exec(text);
  if (pr) {
    const kPa = toKpa(pr[1], pr[2] ?? "kpa");
    if (kPa !== undefined) put("designPressure", { value: kPa, quote: lineAround(text, pr.index), confidence: 0.78 }, (v) => round(Number(v), 1), 0.78);
  }
  const dt = /design\s*temp(?:erature)?\s*(?:\(?[°a-z/]+\)?)?\s*[:\-]?\s*(-?[\d.,]+)\s*[°]?\s*(c|f)\b/i.exec(text);
  if (dt) {
    const c = toC(dt[1], dt[2]);
    if (c !== undefined) put("designTemperature", { value: c, quote: lineAround(text, dt.index), confidence: 0.78 }, (v) => round(Number(v), 1), 0.78);
  }
  const mdmt = /(?:mdmt|minimum\s*design\s*(?:metal\s*)?temperature)\s*(?:\(?[°a-z/]+\)?)?\s*[:\-]?\s*(-?[\d.,]+)\s*[°]?\s*(c|f)?/i.exec(text);
  if (mdmt) {
    const c = toC(mdmt[1], mdmt[2] ?? "c");
    if (c !== undefined) put("mdmt", { value: c, quote: lineAround(text, mdmt.index), confidence: 0.7 }, (v) => round(Number(v), 1), 0.7);
  }
  put(
    "corrosionAllowance",
    grab(text, /corrosion\s*allowance\s*(?:\(mm\))?\s*[:\-]?\s*([\d.,]+)\s*(mm)?/i),
    (v) => num(v),
    0.72,
  );
  put(
    "jointEfficiency",
    grab(text, /(?:joint\s*efficiency|radiographic\s*efficiency)\s*(?:\(e\))?\s*[:=]?\s*(0?\.\d+|1(?:\.0+)?)/i),
    (v) => num(v),
    0.62,
  );
  put("insulationThk", grab(text, /insulation[^\n\d]{0,40}?([\d.,]{1,5})\s*mm/i), (v) => num(v), 0.6);
  put("paintSystem", grab(text, /paint(?:ing)?\s*(?:system|spec(?:ification)?)?\s*[:\-]\s*([^\n|]{3,60})/i), undefined, 0.6);

  const insp = /(?:inspection|en\s*10204|certificate)\s*(?:class|type)?\s*[:\-]?\s*(3\s*\.\s*[12])/i.exec(text) ?? /(3\s*\.\s*2|3\s*\.\s*1)/.exec(text);
  if (insp) {
    const v = insp[1].replace(/\s/g, "");
    put("inspection", { value: v, quote: lineAround(text, insp.index), confidence: 0.66 }, () => v, 0.66);
  }

  const head = /(2\s*:\s*1\s*ellipsoidal|ellipsoidal|torispherical|flanged\s*(?:&|and)\s*dished|hemispherical|flat\s*(?:head|plate)|conical)/i.exec(text);
  if (head) {
    const h = canonicalHead(head[1]);
    if (h) put("headType", { value: h, quote: lineAround(text, head.index), confidence: 0.72 }, () => h, 0.72);
  }
  const rt = /(full\s*(?:rt|radiograph\w*)|100%\s*(?:rt|radiograph\w*)|spot\s*(?:rt|radiograph\w*)|no\s*rt|nil\s*radiograph\w*)/i.exec(text);
  if (rt) {
    const v = /full|100/i.test(rt[1]) ? "Full RT" : /spot/i.test(rt[1]) ? "Spot RT" : "No RT";
    put("radiography", { value: v, quote: lineAround(text, rt.index), confidence: 0.68 }, () => v, 0.68);
  }
  const pwht = /(?:pwht|post\s*weld\s*heat\s*treatment)\s*[:\-]?\s*(yes|no|required|not\s*required|nil)/i.exec(text);
  if (pwht) {
    const v = /^(yes|required)$/i.test(pwht[1].replace(/\s+/g, " ")) ? "Yes" : "No";
    put("pWHT", { value: v, quote: lineAround(text, pwht.index), confidence: 0.7 }, () => v, 0.7);
  }

  // material: prefer a catalogue match, fall back to a raw ASME/ASTM designation
  const matHit = MATERIALS.map((m) => ({ name: m.name, idx: text.toLowerCase().indexOf(m.name.toLowerCase()) }))
    .filter((h) => h.idx >= 0)
    .sort((a, b) => a.idx - b.idx)[0];
  if (matHit) {
    put("material", { value: matHit.name, quote: lineAround(text, matHit.idx), confidence: 0.72 }, () => matHit.name, 0.72);
  } else {
    put("material", grab(text, /\b((?:SA|ASTM|A|EN)\s?[- ]?\d{2,4}\s?(?:Gr\.?\s?[A-Z0-9]+|TP?\d{3}|L?[A-Z]{1,2}\d?)?)/), undefined, 0.5);
  }

  if (!values.type && values.name) {
    const t = canonicalType(String(values.name.value));
    if (t) values.type = { value: t, confidence: 0.55, source: String(values.name.source) };
  }

  // nozzle schedule tables: lines that start with a mark (N1, MW1, M1, D1…)
  const nozzles: ExtractedNozzle[] = [];
  for (const raw of text.split("\n")) {
    const line = clean(raw);
    const mark = /^((?:N|MW|M|D|H|S|L)?\s?\d{1,2}[A-Z]?)\b/.exec(line);
    if (!mark) continue;
    if (!/["”]|\binch\b|\bDN\s?\d/i.test(line)) continue;
    const sizeRaw =
      /(\d+(?:\.\d+)?)\s*["”]/.exec(line)?.[1] ??
      /(\d+(?:\.\d+)?)\s*(?:inch|in)\b/i.exec(line)?.[1] ??
      undefined;
    const dn = /DN\s?(\d+)/i.exec(line)?.[1];
    const size = canonicalSize(sizeRaw ? `${sizeRaw}"` : dn ? `DN${dn}` : undefined);
    if (!size) continue;
    const rating = /(\d{3,4})\s*#/.exec(line)?.[1];
    const sch = /(?:sch\.?|schedule)\s*(\d{1,3}|XS|XXS|STD)/i.exec(line)?.[1];
    const face = /\b(RF|FF|RTJ)\b/.exec(line)?.[1];
    nozzles.push({
      mark: mark[1].replace(/\s+/g, "").toUpperCase(),
      size,
      schedule: sch ? String(sch).toUpperCase() : "40",
      rating: canonicalRating(rating) ?? "150#",
      facing: face ?? "RF",
      service: "",
      repad: /\b(repad|rf\s*pad|reinforc)/i.test(line),
      blind: /\b(blind)/i.test(line),
      qty: 1,
      confidence: 0.55,
      source: line.slice(0, 140),
    });
    if (nozzles.length >= 20) break;
  }

  const notes: string[] = [];
  if (!Object.keys(values).length) notes.push("No design-condition keywords were recognised in the extracted text.");
  notes.push("Rule-based pass (no language model): fields are matched literally, so verify every value before applying.");

  return {
    source: "rules",
    values,
    nozzles: dedupeNozzles(nozzles),
    documents,
    notes,
    warnings: [],
  };
}

function dedupeNozzles(list: ExtractedNozzle[]): ExtractedNozzle[] {
  const seen = new Set<string>();
  return list.filter((n) => {
    const key = `${n.mark}|${n.size}|${n.rating}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Extraction -> estimator data
// ---------------------------------------------------------------------------
export function headerFrom(extraction: Extraction, keys: FieldKey[]): Partial<Equipment> {
  const out: Partial<Equipment> = {};
  for (const key of keys) {
    const found = extraction.values[key];
    if (!found) continue;
    const meta = FIELD_META[key];
    const v = meta.kind === "number" ? Number(found.value) : String(found.value);
    if (meta.kind === "number" && !Number.isFinite(v as number)) continue;
    if (v === "" || v === undefined) continue;
    (out as Record<string, unknown>)[key] = v;
  }
  return out;
}

export function nozzleRowsFrom(extraction: Extraction): PartRow[] {
  return extraction.nozzles.map((n) => ({
    ...defaultRow("nozzle"),
    nz_size: n.size,
    nz_sch: n.schedule,
    nz_rating: n.rating,
    nz_face: n.facing,
    nz_type: "Pipe",
    nz_length: "150",
    nz_cat: "ISRS-Std",
    nz_pad: n.repad ? "Yes" : "No",
    nz_padThk: n.repad ? "12" : "",
    nz_blind: n.blind ? "Yes" : "No",
    nz_gsk: "Yes",
    nz_bolt: "Yes",
  }));
}

/** nozzle marks, for the review table */
export const nozzleSummary = (n: ExtractedNozzle) =>
  [n.mark, n.size, `Sch ${n.schedule}`, n.rating, n.facing, n.repad ? "RF pad" : "", n.blind ? "blind" : ""]
    .filter(Boolean)
    .join(" · ");

// ---------------------------------------------------------------------------
// sample datasheet, so the intake page is demonstrable without any API key
// ---------------------------------------------------------------------------
export const SAMPLE_DATASHEET = `PROCESS EQUIPMENT DATASHEET — DRUM 10-V-203
Client: Gulf Refining Company        Project: RFCC Revamp, Sitra, Bahrain
Rev: 1        Sheet 1 of 3        Date: 14-Feb-2026

1. GENERAL
Tag No.: 10-V-203
Description: HP Amine Flash Drum
Service: Rich amine letdown / flash
Equipment type: Horizontal pressure vessel
Quantity: 1
Design code: ASME Section VIII Division 1, 2023 Edition
Inspection certificate: EN 10204 3.1

2. DESIGN CONDITIONS
Design pressure: 18.5 barg
Design temperature: 120 °C
MDMT: -29 °C
Corrosion allowance: 3.0 mm
Joint efficiency (E): 0.85
Radiography: Spot RT
Post weld heat treatment: Yes
External design pressure: 0.35 barg (full vacuum not specified)

3. GEOMETRY
Orientation: Horizontal
Inside diameter: 2000 mm
Tangent to tangent: 6200 mm
Shell thickness (nominal): 22 mm
Head type: 2:1 Ellipsoidal
Insulation: 50 mm mineral wool, aluminium cladding
Paint system: Inorganic zinc primer + epoxy MIO, 250 µm DFT
Shipping weight (empty): 9 450 kg

4. MATERIALS
Shell / heads: SA-516 Gr.70
Nozzle necks: SA-106 Gr.B
Flanges: SA-105
Bolting: SA-193 B7 / SA-194 2H
Gasket: Spiral wound SS316 + graphite, 4.5 mm

5. NOZZLES (all flanges ASME B16.5, facing RF)
MARK   SIZE   RATING   SCHEDULE   SERVICE                 REMARKS
N1     8"     300#     Sch 40      Rich amine inlet        RF pad, 12 mm
N2     6"     300#     Sch 40      Flash vapour outlet     RF pad
N3     4"     300#     Sch 80      Lean amine outlet       RF pad
N4     2"     300#     Sch 80      Level bridle             -
N5     2"     300#     Sch 80      Pressure gauge          -
N6     1"     300#     Sch 80      Vent                    Blind flange
MW1    20"    300#     -           Manway (horizontal)     Davit, blind
MW2    20"    300#     -           Manway (horizontal)     Davit, blind

6. NOTES
1. Vessel to be supported on two saddles, 800 mm clear from shell.
2. Full radiography not required except long seams; spot RT per UW-52.
3. All nozzles shall be reinforced per UG-37/UG-45.
`;
