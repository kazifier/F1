import { useMemo, useRef, useState } from "react";
import { useStore, newEquipment, fmt } from "../lib/store";
import { applyHeaderDefaults, defaultsSummary } from "../lib/autofill";
import { readDocument, isSupported, documentsToText, type ExtractedDoc } from "../lib/documents";
import {
  FIELD_META,
  FIELD_ORDER,
  SAMPLE_DATASHEET,
  headerFrom,
  nozzleRowsFrom,
  nozzleSummary,
  rulesExtract,
  type ExtractedNozzle,
  type Extraction,
  type FieldKey,
} from "../lib/intake";
import {
  AI_PRESETS,
  loadAiSettings,
  saveAiSettings,
  hasKey,
  runAiExtraction,
  testConnection,
  type AiSettings,
  type ProviderId,
} from "../lib/ai";
import type { Equipment } from "../lib/types";

type Target = "new" | string;

export default function IntakePage() {
  const { equipment, addEquipment, updateEquipment, applyDefaults, setActiveEquipment } = useStore();
  const [docs, setDocs] = useState<ExtractedDoc[]>([]);
  const [filesBusy, setFilesBusy] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [selected, setSelected] = useState<Set<FieldKey>>(new Set());
  const [edits, setEdits] = useState<Partial<Record<FieldKey, string>>>({});
  const [takeNozzles, setTakeNozzles] = useState(true);
  const [target, setTarget] = useState<Target>("new");
  const [applied, setApplied] = useState<{ id: string; summary: string[] } | null>(null);
  const [settings, setSettings] = useState<AiSettings>(loadAiSettings);
  const [conn, setConn] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const savedSettings = (patch: Partial<AiSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAiSettings(next);
    setConn(null);
  };

  const accept = async (files: FileList | File[]) => {
    setError(null);
    setApplied(null);
    const list = Array.from(files);
    for (const file of list) {
      if (!isSupported(file)) {
        setError(`${file.name} is not a supported file type (PDF, DOCX, XLSX, CSV, TXT or an image).`);
        continue;
      }
      setFilesBusy(`Reading ${file.name}…`);
      try {
        const doc = await readDocument(file);
        setDocs((d) => [...d.filter((x) => x.name !== doc.name), doc]);
      } catch (err) {
        setError(`${file.name}: ${(err as Error).message}`);
      }
    }
    setFilesBusy(null);
  };

  const addSample = () => {
    setError(null);
    setApplied(null);
    setDocs((d) => [
      ...d.filter((x) => x.name !== "10-V-203 datasheet.txt"),
      { name: "10-V-203 datasheet.txt", kind: "text", pages: [{ label: "text", text: SAMPLE_DATASHEET }], chars: SAMPLE_DATASHEET.length, images: 0 },
    ]);
  };

  const useResult = (result: Extraction) => {
    setExtraction(result);
    setEdits({});
    setSelected(new Set(FIELD_ORDER.filter((k) => result.values[k])));
    setTakeNozzles(result.nozzles.length > 0);
    setApplied(null);
  };

  const runRules = () => {
    setError(null);
    if (!docs.length) {
      setError("Add at least one document first.");
      return;
    }
    const text = documentsToText(docs);
    const result = rulesExtract(text, docs.map((d) => d.name));
    if (!Object.keys(result.values).length && !result.nozzles.length) {
      setError("The rule-based reader did not recognise any design data in this text. Add an API key and use the AI reader.");
      return;
    }
    useResult(result);
  };

  const runAi = async () => {
    setError(null);
    setConn(null);
    if (!docs.length) {
      setError("Add at least one document first.");
      return;
    }
    const ctrl = new AbortController();
    setBusy("Contacting the model…");
    try {
      const result = await runAiExtraction(docs, {
        settings,
        signal: ctrl.signal,
        onProgress: setBusy,
      });
      useResult(result);
      setBusy(null);
    } catch (err) {
      setBusy(null);
      setError((err as Error).message);
    }
  };

  const checkConnection = async () => {
    setConn("Testing…");
    setError(null);
    try {
      setConn(await testConnection(settings));
    } catch (err) {
      setConn(null);
      setError((err as Error).message);
    }
  };

  const toggle = (key: FieldKey) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const targetEquipment = target === "new" ? undefined : equipment.find((e) => e.id === target);

  const apply = () => {
    if (!extraction) return;
    const keys = FIELD_ORDER.filter((k) => selected.has(k));
    const patch = headerFrom(extraction, keys);
    for (const key of keys) {
      if (edits[key] === undefined) continue;
      const meta = FIELD_META[key];
      const raw = edits[key];
      (patch as Record<string, unknown>)[key] = meta.kind === "number" ? Number(raw) : raw;
    }
    const rows = takeNozzles ? nozzleRowsFrom(extraction) : undefined;

    if (!targetEquipment) {
      const base = newEquipment(
        (patch.type as string) ?? "Pressure Vessel",
        (patch.tag as string) ?? "",
        (patch.name as string) ?? "",
      );
      const merged: Equipment = {
        ...base,
        ...patch,
        parts: { ...base.parts, ...(rows ? { nozzle: rows } : {}) },
      };
      const final = applyHeaderDefaults(merged);
      addEquipment(final);
      setActiveEquipment(final.id);
      setApplied({ id: final.id, summary: defaultsSummary(final) });
      return;
    }

    updateEquipment(targetEquipment.id, {
      ...patch,
      parts: { ...targetEquipment.parts, ...(rows ? { nozzle: rows } : {}) },
    });
    applyDefaults(targetEquipment.id);
    const updated = useStore.getState().equipment.find((e) => e.id === targetEquipment.id);
    setApplied({ id: targetEquipment.id, summary: updated ? defaultsSummary(updated) : [] });
  };

  const summary = useMemo(() => {
    if (!extraction) return { found: 0, low: 0, nozzles: 0 };
    const found = Object.values(extraction.values).filter(Boolean).length;
    const low = Object.values(extraction.values).filter((v) => v && v.confidence < 0.6).length;
    return { found, low, nozzles: extraction.nozzles.length };
  }, [extraction]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>AI document intake</h2>
          <div className="sub">
            Drop a datasheet, specification, drawing or quotation and let the model fill the estimate. Everything is
            read in this browser; only the extraction request leaves it.
          </div>
        </div>
        <div className="actions">
          <span className={`pill${hasKey(settings) ? " ok" : " warn"}`}>{hasKey(settings) ? "Model connected" : "No API key — rules only"}</span>
          <button className="btn" onClick={runRules} disabled={!docs.length || !!busy}>
            Read with rules
          </button>
          <button className="btn btn-primary" onClick={runAi} disabled={!docs.length || !!busy || !hasKey(settings)}>
            {busy ? "Extracting…" : "Extract with AI"}
          </button>
        </div>
      </div>

      {error && (
        <div className="callout bad" style={{ marginBottom: 14, whiteSpace: "pre-wrap" }}>
          {error}
        </div>
      )}
      {busy && <div className="callout" style={{ marginBottom: 14 }}>{busy}</div>}
      {applied && (
        <div className="callout good" style={{ marginBottom: 14 }}>
          <b>Applied to {equipment.find((e) => e.id === applied.id)?.tag || "new equipment"}.</b>{" "}
          <a href="#/estimator" onClick={() => useStore.getState().setStep(4)}>Open the part sheet</a> to review the
          derived data. {applied.summary.length > 0 && <span className="dim">{applied.summary.join(" · ")}</span>}
        </div>
      )}

      <div className="grid g2">
        <div className="card">
          <div className="card-head">
            <h3>Documents</h3>
            <span className="hint">PDF · DOCX · XLSX/CSV · images</span>
          </div>
          <div className="card-body">
            <div
              className={`dropzone${dragging ? " active" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void accept(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
              }}
            >
              <b>Drop files here</b> or click to browse
              <div className="small dim" style={{ marginTop: 4 }}>
                PDFs are read page by page; drawing pages are also sent as images so title blocks and dimension strings are
                read, not just the typed text.
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json,.png,.jpg,.jpeg,.webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files) void accept(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="row mt8" style={{ gap: 8 }}>
              <button className="btn btn-sm" onClick={addSample}>
                Load sample datasheet
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => { setDocs([]); setExtraction(null); setApplied(null); }} disabled={!docs.length}>
                Clear
              </button>
              {filesBusy && <span className="small dim">{filesBusy}</span>}
            </div>

            {docs.length > 0 && (
              <table className="data mt12">
                <thead>
                  <tr>
                    <th>File</th>
                    <th className="num">Pages</th>
                    <th className="num">Text</th>
                    <th className="num">Images</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.name}>
                      <td>
                        {d.name}
                        {d.note && <div className="tiny dim">{d.note}</div>}
                      </td>
                      <td className="num">{d.pages.length}</td>
                      <td className="num">{fmt(d.chars / 1000, 1)}k</td>
                      <td className="num">{d.images}</td>
                      <td className="right">
                        <button className="btn btn-sm btn-ghost" onClick={() => setDocs((x) => x.filter((y) => y.name !== d.name))}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>AI engine</h3>
            <span className="hint">key stays in this browser</span>
          </div>
          <div className="card-body">
            <div className="grid g3">
              <label className="field">
                <span>Provider</span>
                <select
                  value={settings.provider}
                  onChange={(e) => {
                    const provider = e.target.value as ProviderId;
                    const preset = AI_PRESETS[provider];
                    savedSettings({ provider, endpoint: preset.endpoint, model: preset.model });
                  }}
                >
                  {Object.entries(AI_PRESETS).map(([id, p]) => (
                    <option key={id} value={id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ gridColumn: "span 2" }}>
                <span>Model</span>
                <input value={settings.model} onChange={(e) => savedSettings({ model: e.target.value })} />
              </label>
              <label className="field" style={{ gridColumn: "span 2" }}>
                <span>API key</span>
                <input
                  type="password"
                  placeholder="paste key — stored only in this browser"
                  value={settings.apiKey}
                  onChange={(e) => savedSettings({ apiKey: e.target.value })}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>Page images</span>
                <select value={settings.vision ? "yes" : "no"} onChange={(e) => savedSettings({ vision: e.target.value === "yes" })}>
                  <option value="yes">Send (vision)</option>
                  <option value="no">Text only</option>
                </select>
              </label>
              <label className="field" style={{ gridColumn: "span 3" }}>
                <span>Endpoint base URL</span>
                <input value={settings.endpoint} onChange={(e) => savedSettings({ endpoint: e.target.value })} />
              </label>
            </div>
            <div className="row between mt8">
              <span className="small dim">{AI_PRESETS[settings.provider].note}</span>
              <button className="btn btn-sm" onClick={checkConnection} disabled={!hasKey(settings) || conn === "Testing…"}>
                {conn === "Testing…" ? "Testing…" : "Test connection"}
              </button>
            </div>
            {conn && <div className="small" style={{ color: "var(--green)", marginTop: 6 }}>{conn}</div>}
            <div className="callout mt12 small">
              Cost control: text is capped at ~100k characters and at most 8 page images are sent. Turn images off for
              text-only datasheets. Without a key the <b>rule-based reader</b> still pulls tagged fields and nozzle tables
              from any PDF/Word/Excel text.
            </div>
          </div>
        </div>
      </div>

      {extraction && (
        <>
          <div className="card mt12">
            <div className="card-head">
              <h3>Review the extracted data</h3>
              <span className="hint">
                {extraction.source === "ai" ? `model: ${extraction.model}` : "rule-based"} · {summary.found} fields ·{" "}
                {summary.nozzles} nozzles{summary.low ? ` · ${summary.low} low confidence` : ""}
              </span>
            </div>
            <div className="card-body tight scroll-x">
              <table className="data review">
                <thead>
                  <tr>
                    <th style={{ width: 34 }} />
                    <th>Field</th>
                    <th>Extracted</th>
                    <th>Unit</th>
                    <th style={{ width: 120 }}>Confidence</th>
                    <th>Where it came from</th>
                    {targetEquipment && <th>Current</th>}
                  </tr>
                </thead>
                <tbody>
                  {FIELD_ORDER.filter((k) => extraction.values[k]).map((key) => {
                    const found = extraction.values[key]!;
                    const meta = FIELD_META[key];
                    const current = targetEquipment ? (targetEquipment as unknown as Record<string, unknown>)[key] : undefined;
                    const low = found.confidence < 0.6;
                    return (
                      <tr key={key} className={selected.has(key) ? "" : "off"}>
                        <td>
                          <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} />
                        </td>
                        <td>{meta.label}</td>
                        <td>
                          {meta.kind === "select" && meta.options ? (
                            <select
                              className="cell"
                              value={edits[key] ?? String(found.value)}
                              onChange={(e) => setEdits((x) => ({ ...x, [key]: e.target.value }))}
                              style={{ minWidth: 170 }}
                            >
                              {!meta.options.includes(String(found.value)) && (
                                <option value={String(found.value)}>{String(found.value)}</option>
                              )}
                              {meta.options.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="cell"
                              type={meta.kind === "number" ? "number" : "text"}
                              value={edits[key] ?? String(found.value)}
                              onChange={(e) => setEdits((x) => ({ ...x, [key]: e.target.value }))}
                              style={{ minWidth: meta.kind === "number" ? 90 : 200 }}
                            />
                          )}
                        </td>
                        <td className="dim small">{meta.unit ?? ""}</td>
                        <td>
                          <span className={`conf${low ? " low" : ""}`} title={`${Math.round(found.confidence * 100)}%`}>
                            <i style={{ width: `${Math.max(4, Math.round(found.confidence * 100))}%` }} />
                          </span>
                        </td>
                        <td className="tiny dim" style={{ maxWidth: 320 }}>{found.source}</td>
                        {targetEquipment && <td className="mono small dim">{String(current ?? "—")}</td>}
                      </tr>
                    );
                  })}
                  {summary.found === 0 && (
                    <tr>
                      <td colSpan={7} className="dim">
                        No header fields were recognised.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {extraction.nozzles.length > 0 && (
            <div className="card mt12">
              <div className="card-head">
                <h3>Nozzles &amp; openings</h3>
                <div className="row">
                  <span className="hint">rating/pad are re-checked against design pressure on apply</span>
                  <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={takeNozzles} onChange={(e) => setTakeNozzles(e.target.checked)} />
                    use these rows
                  </label>
                </div>
              </div>
              <div className="card-body tight scroll-x">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Mark</th>
                      <th>Size</th>
                      <th>Schedule</th>
                      <th>Rating</th>
                      <th>Facing</th>
                      <th>Details</th>
                      <th className="num">Conf.</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraction.nozzles.map((n: ExtractedNozzle, i) => (
                      <tr key={`${n.mark}-${i}`}>
                        <td className="mono">{n.mark}</td>
                        <td className="mono">{n.size}</td>
                        <td className="mono">{n.schedule}</td>
                        <td className="mono">{n.rating}</td>
                        <td className="mono">{n.facing}</td>
                        <td className="small">{nozzleSummary(n).split(" · ").slice(5).join(" · ") || "—"}</td>
                        <td className="num">{Math.round(n.confidence * 100)}%</td>
                        <td className="tiny dim" style={{ maxWidth: 320 }}>{n.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(extraction.notes.length > 0 || extraction.warnings.length > 0) && (
            <div className="card mt12">
              <div className="card-head"><h3>Model notes</h3></div>
              <div className="card-body">
                {extraction.warnings.map((w, i) => (
                  <div className="callout warn small" key={`w${i}`} style={{ marginBottom: 6 }}>{w}</div>
                ))}
                {extraction.notes.map((n, i) => (
                  <div className="small dim" key={`n${i}`}>· {n}</div>
                ))}
              </div>
            </div>
          )}

          <div className="card mt12">
            <div className="card-head">
              <h3>Apply</h3>
              <span className="hint">header values re-derive the whole part sheet</span>
            </div>
            <div className="card-body">
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <label className="field" style={{ minWidth: 280 }}>
                  <span>Target</span>
                  <select value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="new">Create new equipment</option>
                    {equipment.map((e) => (
                      <option key={e.id} value={e.id}>
                        Replace / merge into {e.tag} — {e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-primary" onClick={apply} disabled={!selected.size && !takeNozzles}>
                  Apply {selected.size} field{selected.size === 1 ? "" : "s"}
                  {takeNozzles && extraction.nozzles.length ? ` + ${extraction.nozzles.length} nozzles` : ""}
                </button>
                <button className="btn btn-ghost" onClick={() => { setExtraction(null); setApplied(null); }}>
                  Discard
                </button>
              </div>
              <div className="callout small mt12">
                Anything left unchecked is not written. After applying, missing part-sheet values are still derived from
                the header by the normal rules — so an incomplete datasheet still produces a complete estimate you can
                correct by hand.
              </div>
            </div>
          </div>
        </>
      )}

      {!extraction && (
        <div className="callout mt12 small">
          <b>How it works:</b> the browser extracts text (and page images) from each file, then either a vision-capable
          model or the built-in rule matcher proposes header fields and a nozzle list. Nothing is written to the estimate
          until you review and press Apply. Values the model is unsure about are shown at low confidence — check those
          against the datasheet.
        </div>
      )}
    </div>
  );
}
