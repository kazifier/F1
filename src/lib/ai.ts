// ---------------------------------------------------------------------------
// AI extraction — any OpenAI-compatible chat endpoint (OpenAI, Google Gemini's
// OpenAI compatibility layer, OpenRouter, a self-hosted gateway…).
// The key is entered by the user and kept in this browser only; it is never
// bundled, logged or sent anywhere except the endpoint the user chose.
// ---------------------------------------------------------------------------
import type { ExtractedDoc } from "./documents";
import { documentsToImages, documentsToText } from "./documents";
import { coerceExtraction, type Extraction } from "./intake";
import { MATERIALS, NPS_LIST } from "./catalog";

export type ProviderId = "openai" | "google" | "openrouter" | "custom";

export interface ProviderPreset {
  label: string;
  endpoint: string;
  model: string;
  note: string;
}

export const AI_PRESETS: Record<ProviderId, ProviderPreset> = {
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    note: "Native PDF vision; good structured-output compliance.",
  },
  google: {
    label: "Google Gemini (OpenAI-compatible)",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.8-flash",
    note: "Cheapest per page for long datasheets, accepts rendered page images.",
  },
  openrouter: {
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    model: "google/gemini-3.8-flash",
    note: "One key, many models — useful to compare extraction quality.",
  },
  custom: {
    label: "Self-hosted / other",
    endpoint: "http://localhost:1234/v1",
    model: "local-model",
    note: "Any server exposing POST {endpoint}/chat/completions.",
  },
};

export interface AiSettings {
  provider: ProviderId;
  endpoint: string;
  model: string;
  apiKey: string;
  /** send page rasters to a vision model — required for scanned PDFs and drawings */
  vision: boolean;
}

const STORAGE_KEY = "vessel-ai-settings-v1";

export const defaultSettings = (): AiSettings => ({
  provider: "google",
  endpoint: AI_PRESETS.google.endpoint,
  model: AI_PRESETS.google.model,
  apiKey: "",
  vision: true,
});

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    const merged = { ...defaultSettings(), ...parsed };
    // Gemini 2.5 models were retired for new API keys — move a saved preset
    // forward, otherwise a previously saved settings blob keeps failing 404.
    if (/^models\/gemini-2\.5/i.test(merged.model)) merged.model = AI_PRESETS.google.model;
    else if (/^gemini-2\.5/i.test(merged.model)) merged.model = AI_PRESETS.google.model;
    else if (/^google\/gemini-2\.5/i.test(merged.model)) merged.model = AI_PRESETS.openrouter.model;
    return merged;
  } catch {
    return defaultSettings();
  }
}

export function saveAiSettings(settings: AiSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage full / blocked — settings still work for this session
  }
}

export const hasKey = (s: AiSettings) => s.apiKey.trim().length > 8;

const joinUrl = (endpoint: string, path: string) =>
  `${endpoint.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

function errorText(status: number, body: string): string {
  let detail = body;
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    detail = typeof j.error === "string" ? j.error : (j.error?.message ?? j.message ?? body);
  } catch {
    // plain text body
  }
  const hint =
    status === 401 || status === 403
      ? " — check the API key and that the endpoint matches the key's provider."
      : status === 404
        ? /no longer available|has been retired|is deprecated/i.test(detail)
          ? " — this model has been retired by the provider; pick a current model in the AI engine card."
          : " — check the endpoint base URL (it must end at /v1 or /v1beta/openai) and the model name."
        : status === 413
          ? " — the request was too large; turn off page images or upload fewer documents."
          : status === 429
            ? " — rate limit or quota exhausted on this key."
            : "";
  return `AI request failed (${status})${hint}\n${String(detail).slice(0, 400)}`;
}

async function post(settings: AiSettings, body: Record<string, unknown>, signal?: AbortSignal) {
  const res = await fetch(joinUrl(settings.endpoint, "chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(errorText(res.status, await res.text().catch(() => "")));
  return (await res.json()) as {
    choices?: { message?: { content?: unknown } }[];
    error?: { message?: string };
  };
}

const SYSTEM_PROMPT = `You are a pressure-vessel estimating engineer reading tender documents
(datasheets, specifications, GA drawings, P&IDs, vendor quotations) for an ASME VIII Div.1 fabricator.
Extract the equipment data needed to build a material take-off. Rules:
- Read every supplied page and image. Drawings often carry the geometry in title blocks and dimension strings.
- Convert everything to the SI units the schema asks for: lengths mm, pressure kPa(g), temperature deg C.
- Use null when a value is genuinely absent. Never invent, guess or round-fill a value that is not in the document.
- If two documents disagree, take the datasheet over a drawing, and mention the conflict in "warnings".
- Materials: use the designation exactly as written (e.g. "SA-516 Gr.70", "SA-106 Gr.B", "SA-240 Gr.304L").
- Radiography must be one of "Full RT", "Spot RT", "No RT". Orientation "Horizontal" or "Vertical".
- "type" must be one of: Pressure Vessel, Column / Tower, Heat Exchanger, Storage Tank, Reactor,
  Separator, Knock Out Drum, Dish End / Head, Skid / Structural.
- "headType" one of: 2:1 Ellipsoidal, Torispherical (F&D), Hemispherical, Flat (UG-34), Conical 60 deg.
- "inspection" is the EN 10204 certificate class: "3.1" or "3.2".
- nozzles: one entry per nozzle/manway/opening mark actually listed, with size as an NPS string (8", 2", 20").
  rating as "150#"/"300#"…, schedule as "40"/"80"/"XS" where given, facing RF/FF/RTJ.
  repad/blind true only when the document says so.
- confidence per field: 0.95 exact labelled value, 0.8 inferred from a drawing dimension or table column,
  0.5 ambiguous, 0 missing. "source" is a short quote or page/sheet reference.
Return ONLY a JSON object, no prose, with this shape:
{
  "equipment": {
    "tag": string|null, "name": string|null, "type": string|null, "service": string|null, "qty": number|null,
    "orientation": string|null, "diameter": number|null, "diameter_unit": "mm"|"m"|"inch"|null,
    "ttLength": number|null, "ttLength_unit": "mm"|"m"|null,
    "shellThk": number|null, "shellThk_unit": "mm"|null,
    "headType": string|null, "material": string|null,
    "designPressure": number|null, "designPressure_unit": "kPa"|"bar"|"psi"|"MPa"|null,
    "designTemperature": number|null, "designTemperature_unit": "C"|"F"|null,
    "mdmt": number|null, "mdmt_unit": "C"|"F"|null,
    "corrosionAllowance": number|null, "jointEfficiency": number|null,
    "radiography": string|null, "pWHT": "Yes"|"No"|null,
    "paintSystem": string|null, "insulationThk": number|null, "inspection": string|null
  },
  "nozzles": [
    { "mark": string, "size": string, "schedule": string, "rating": string, "facing": string,
      "service": string, "repad": boolean, "blind": boolean, "qty": number,
      "confidence": number, "source": string }
  ],
  "confidence": { "tag": number, "diameter": number, ... },
  "sources": { "tag": "page 1 · General", ... },
  "notes": [string],
  "warnings": [string]
}`;

export interface AiRunOptions {
  settings: AiSettings;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

/** ask the model to fill the schema from the documents */
export async function runAiExtraction(docs: ExtractedDoc[], opts: AiRunOptions): Promise<Extraction> {
  const { settings, signal, onProgress } = opts;
  if (!hasKey(settings)) throw new Error("No API key saved. Add one, or run the rule-based reader instead.");
  const text = documentsToText(docs);
  if (!text.trim() && !documentsToImages(docs, 1).length) {
    throw new Error("Nothing readable was extracted from these files. If they are scanned, upload the PDF/images again with page images enabled.");
  }

  const images = settings.vision ? documentsToImages(docs, 8) : [];
  onProgress?.(
    `Sending ${Math.round(text.length / 1000)}k characters${images.length ? ` + ${images.length} page images` : ""} to ${settings.model}…`,
  );

  const catalogHint = `Known shell materials in the estimator catalogue: ${MATERIALS.slice(0, 60)
    .map((m) => m.name)
    .join(", ")}. Known pipe sizes: ${NPS_LIST.join(", ")}.`;

  const content: unknown[] = [
    {
      type: "text",
      text: `${catalogHint}\n\nDOCUMENTS:\n${text || "(no embedded text — use the page images)"}`,
    },
    ...images.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  const body = {
    model: settings.model,
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    response_format: { type: "json_object" },
  };

  let json: Awaited<ReturnType<typeof post>>;
  try {
    json = await post(settings, body, signal);
  } catch (err) {
    // some compatible servers reject response_format — retry once without it
    if (err instanceof Error && /response_format|json_object|unsupported/i.test(err.message)) {
      onProgress?.("Endpoint rejected JSON mode — retrying without response_format…");
      const { response_format: _drop, ...rest } = body;
      json = await post(settings, rest, signal);
    } else {
      throw err;
    }
  }

  const message = json.choices?.[0]?.message?.content;
  const raw = typeof message === "string" ? message : Array.isArray(message) ? message.map((p) => (p as { text?: string }).text ?? "").join("") : "";
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(`The model did not return JSON. First 300 characters:\n${raw.slice(0, 300)}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch (err) {
    throw new Error(`Could not parse the model's JSON (${(err as Error).message}). First 300 characters:\n${raw.slice(0, 300)}`);
  }

  const extraction = coerceExtraction(parsed, settings.model);
  extraction.documents = docs.map((d) => d.name);
  if (!Object.keys(extraction.values).length && !extraction.nozzles.length) {
    extraction.warnings = [...extraction.warnings, "The model found no usable fields in these documents."];
  }
  return extraction;
}

/** tiny round-trip to check key + endpoint + model before a full run */
export async function testConnection(settings: AiSettings): Promise<string> {
  if (!hasKey(settings)) throw new Error("Enter an API key first.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const json = await post(
      settings,
      {
        model: settings.model,
        temperature: 0,
        max_tokens: 20,
        messages: [{ role: "user", content: "Reply with the single word OK." }],
      },
      ctrl.signal,
    );
    const reply = json.choices?.[0]?.message?.content;
    return typeof reply === "string" && reply.trim() ? `Connected — ${settings.model} replied “${reply.trim().slice(0, 40)}”.` : `Connected to ${settings.model}.`;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error("Timed out after 45 s — the endpoint did not answer.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
