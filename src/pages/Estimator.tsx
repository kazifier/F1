import { useMemo, useState } from "react";
import { useStore, fmt, money, newEquipment } from "../lib/store";
import { PART_DEFS } from "../lib/parts";
import { buildEquipmentBom, rollupCost } from "../lib/bom";
import { EQUIPMENT_TYPES, HEAD_TYPES, materialGroups } from "../lib/catalog";
import { defaultsSummary, derivedInfo } from "../lib/autofill";
import { CURRENCIES, getCurrency, FX_NOTE } from "../lib/currency";
import { columnBreakdownCost, columnTotal } from "../lib/columnBreakdown";
import { COLUMN_UNITS, type ProjectUnit } from "../data/units";
import { exchangerComponents } from "../lib/exchangerParts";
import { ExchangerBasis, ExchangerDetails, ExchangerSheet } from "./estimatorExchanger";
import type { Equipment, FieldDef, RateBook } from "../lib/types";

const STEPS = [
  "Project Info",
  "Equipment Generation",
  "Equipment Name Edit",
  "Main Part Generation",
  "BOM Generation",
  "Summary",
];

export default function EstimatorPage() {
  const { project, equipment, rates, step, setStep, addEquipment, removeEquipment, updateEquipment, applyDefaults, setCell, addRow, removeRow, loadDemo, resetAll, activeEquipmentId, setActiveEquipment } = useStore();
  const [newType, setNewType] = useState(EQUIPMENT_TYPES[0]);

  const active = equipment.find((e) => e.id === activeEquipmentId) ?? equipment[0] ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Estimating wizard</h2>
          <div className="sub">
            Legacy six-step estimator rebuilt in the browser — project info, equipment generation, part
            mapping, BOM and summary. Every input from the Excel mapping sheet is captured, and the part
            quantity boxes drive how many rows the main-part grid generates.
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={loadDemo}>Reload demo project</button>
          <button className="btn btn-danger" onClick={resetAll}>Clear all</button>
        </div>
      </div>

      <div className="legacy">
        <div className="lg-steps" style={{ ["--n" as string]: STEPS.length }}>
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`lg-step ${step === i + 1 ? "active" : ""} ${step > i + 1 ? "done" : ""}`}
            >
              <div className="lbl">STEP {i + 1}</div>
              <div className="box" onClick={() => setStep(i + 1)} title="Go to step">
                {s}
              </div>
            </div>
          ))}
        </div>

        <div className="lg-toolbar">
          <button className="lg-btn" disabled={step === 1} onClick={() => setStep(Math.max(1, step - 1))}>
            Prev
          </button>
          <button className="lg-btn" disabled={step === 6} onClick={() => setStep(Math.min(6, step + 1))}>
            Next
          </button>
          <span style={{ fontSize: 10, color: "#555", alignSelf: "center", marginLeft: "auto" }}>
            {project.projectNo} · {project.projectName} · Rev {project.revision}
          </span>
        </div>

        {step === 1 && <Step1 />}
        {step === 2 && (
          <Step2
            equipment={equipment}
            activeId={active?.id ?? null}
            setActive={setActiveEquipment}
            newType={newType}
            setNewType={setNewType}
            onAdd={() => addEquipment(newEquipment(newType))}
            onRemove={removeEquipment}
            setCell={setCell}
            addRow={addRow}
            removeRow={removeRow}
            updateEquipment={updateEquipment}
          />
        )}
        {step === 3 && (
          <Step3
            equipment={equipment}
            activeId={active?.id ?? null}
            setActive={setActiveEquipment}
            updateEquipment={updateEquipment}
            applyDefaults={applyDefaults}
            onRemove={removeEquipment}
          />
        )}
        {step === 4 && (
          <Step4
            equipment={equipment}
            activeId={active?.id ?? null}
            setActive={setActiveEquipment}
            setCell={setCell}
            addRow={addRow}
            removeRow={removeRow}
            updateEquipment={updateEquipment}
          />
        )}
        {step === 5 && <Step5 />}
        {step === 6 && <Step6 />}
      </div>

      <div className="small dim mt12">
        Rates used in steps 5–6 come from the Optimised BOQ screen rate book · all amounts in{" "}
        {project.currency} and exclusive of VAT ({rates.vatPct}% Bahrain VAT is reported but never added).
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ step 1 */
function Step1() {
  const { project, setProject } = useStore();
  const F = (label: string, key: keyof typeof project, type = "text") => (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        value={String(project[key])}
        onChange={(e) => setProject({ [key]: e.target.value } as never)}
      />
    </div>
  );
  return (
    <div style={{ padding: "4px 10px 22px" }}>
      <div style={{ fontWeight: 700, color: "#8b0000", margin: "6px 0", fontSize: 11 }}>
        Project Information
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, maxWidth: 960 }}>
        {F("Project No.", "projectNo")}
        {F("Project Name", "projectName")}
        {F("Client", "client")}
        {F("Consultant / EPC", "consultant")}
        {F("Location", "location")}
        {F("Enquiry Date", "enquiryDate", "date")}
        {F("Prepared By", "preparedBy")}
        {F("Revision", "revision")}
        <div className="field">
          <label>Currency</label>
          <select value={project.currency} onChange={(e) => setProject({ currency: e.target.value })}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name} ({c.country})
              </option>
            ))}
          </select>
          <div className="help">{FX_NOTE} · prices exclude VAT</div>
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 10.5, color: "#555", lineHeight: 1.6, maxWidth: 900 }}>
        <b>Design basis carried to all equipment:</b> Division 1 of ASME VIII, inside-diameter basis,
        corrosion allowance in mm, joint efficiency per UW-12 (Type 1 double-welded butt, full RT = 1.00,
        spot = 0.85, no RT = 0.70). Rates are taken from the rate book on screen 03.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ step 2 */
interface Step2Props {
  equipment: Equipment[];
  activeId: string | null;
  setActive: (id: string) => void;
  newType: string;
  setNewType: (t: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  setCell: (id: string, part: string, idx: number, field: string, value: string) => void;
  addRow: (id: string, part: string) => void;
  removeRow: (id: string, part: string, idx: number) => void;
  updateEquipment: (id: string, patch: Partial<Equipment>) => void;
}

function Step2(p: Step2Props) {
  const rates = useStore((s) => s.rates);
  const setColumnExtra = useStore((s) => s.setColumnExtra);
  const setHeExtra = useStore((s) => s.setHeExtra);
  const active = p.equipment.find((e) => e.id === p.activeId) ?? p.equipment[0];
  return (
    <div style={{ padding: "0 8px 20px" }}>
      <div className="lg-band" style={{ marginBottom: 6 }}>
        <span>Equipment Part</span>
        <span style={{ textAlign: "center" }}>QTY</span>
      </div>

      <div className="lg-tree" style={{ paddingTop: 0 }}>
        <div className="lg-tree-row group">
          <div className="lg-part" style={{ justifyContent: "space-between", paddingRight: 8 }}>
            <span>
              <span className="twisty">[−]</span> Equipment Generation
            </span>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select
                value={p.newType}
                onChange={(e) => p.setNewType(e.target.value)}
                style={{ fontSize: 10.5, padding: "1px 3px", border: "1px solid #8a8a8a" }}
              >
                {EQUIPMENT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <button className="lg-btn" style={{ minWidth: 70, padding: "2px 8px" }} onClick={p.onAdd}>
                Add
              </button>
            </span>
          </div>
        </div>

        {p.equipment.length === 0 && (
          <div className="lg-note">No equipment yet — choose a type and press Add.</div>
        )}

        {p.equipment.map((eq) => {
          const isActive = active?.id === eq.id;
          return (
            <div key={eq.id}>
              <div className="lg-tree-row group" style={{ marginTop: 4 }}>
                <div
                  className="lg-part"
                  style={{ cursor: "pointer", justifyContent: "space-between", paddingRight: 8 }}
                  onClick={() => p.setActive(eq.id)}
                >
                  <span>
                    <span className="twisty">{isActive ? "[−]" : "[+]"}</span>
                    <b>
                      {eq.tag} - {eq.name}
                    </b>
                  </span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      className="lg-qty"
                      style={{ width: 60, border: "1px solid #8a8a8a", textAlign: "right", height: 18 }}
                      value={eq.qty}
                      onChange={(e) =>
                        p.updateEquipment(eq.id, { qty: Math.max(1, Number(e.target.value) || 1) })
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      className="lg-btn"
                      style={{ minWidth: 40, padding: "1px 6px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        p.onRemove(eq.id);
                      }}
                    >
                      Del
                    </button>
                  </span>
                </div>
              </div>

              {isActive && (
                <div className="lg-sub">
                  {/* columns show only the 24-row legacy breakdown */}
                  {!isColumnEquipment(eq) && !isExchangerEquipment(eq) && PART_DEFS.map((def) => {
                    const rows = eq.parts[def.key] ?? [];
                    return (
                      <div className="lg-tree-row" key={def.key} style={{ marginBottom: 1 }}>
                        <div
                          className={`lg-row ${def.key === "shell" ? "selected" : ""}`}
                          style={{ borderBottom: "1px solid #9a9a9a" }}
                        >
                          <span className="name">{def.label}</span>
                          <input
                            type="number"
                            min={def.defaultRows}
                            max={def.maxRows}
                            value={rows.length}
                            onChange={(e) => {
                              const target = Math.max(1, Math.min(def.maxRows, Number(e.target.value) || 1));
                              const cur = rows.length;
                              if (target > cur) for (let i = cur; i < target; i++) p.addRow(eq.id, def.key);
                              else for (let i = cur; i > target; i--) p.removeRow(eq.id, def.key, i - 1);
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {isExchangerEquipment(eq) && (
                    <>
                      {exchangerComponents(eq).map((c) => (
                        <div className="lg-tree-row" key={c.key} style={{ marginBottom: 1 }}>
                          <div className="lg-row" style={{ borderBottom: "1px solid #9a9a9a" }}>
                            <span className="name" title={c.detail}>
                              {c.label}
                            </span>
                            {c.derived ? (
                              <input
                                value={fmt(c.qty, 0)}
                                readOnly
                                tabIndex={-1}
                                title={`from TEMA / ASME design · ${c.detail}`}
                                style={{ background: "#f7f7f7", color: "#444" }}
                              />
                            ) : (
                              <input
                                value={eq.heExtras?.[c.key]?.qty ?? ""}
                                onChange={(e) => setHeExtra(eq.id, c.key, "qty", e.target.value)}
                                placeholder=""
                                inputMode="decimal"
                                aria-label={`${c.label} quantity`}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {isColumnEquipment(eq) && (
                    <>
                      {columnBreakdownCost(eq, buildEquipmentBom(eq, rates), rates).map((r) => (
                        <div className="lg-tree-row" key={r.component} style={{ marginBottom: 1 }}>
                          <div className="lg-row" style={{ borderBottom: "1px solid #9a9a9a" }}>
                            <span className="name">{r.component}</span>
                            {r.derived ? (
                              <input
                                value={fmt(r.qty, 0)}
                                readOnly
                                tabIndex={-1}
                                title={`from take-off · ${r.detail}`}
                                style={{ background: "#f7f7f7", color: "#444" }}
                              />
                            ) : (
                              <input
                                value={eq.columnExtras?.[r.component]?.qty ?? ""}
                                onChange={(e) => setColumnExtra(eq.id, r.component, "qty", e.target.value)}
                                placeholder=""
                                inputMode="decimal"
                                aria-label={`${r.component} quantity`}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="lg-note">
        QTY on each part = number of rows generated for that part in Step 4 (e.g. 4 nozzles → 4 nozzle
        rows). Select an equipment to expand its part list.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ step 3 */
/** Columns get the 24-row legacy breakdown; match by type or by datasheet tag. */
const isColumnEquipment = (eq: Equipment) =>
  /column|tower/i.test(eq.type) || COLUMN_UNITS.some((u) => u.tag === eq.tag);

/** shell & tube exchangers carry their own TEMA/ASME sheet */
const isExchangerEquipment = (eq: Equipment) => /exchanger/i.test(eq.type) || Boolean(eq.he);

function Step3(p: {
  equipment: Equipment[];
  activeId: string | null;
  setActive: (id: string) => void;
  updateEquipment: (id: string, patch: Partial<Equipment>) => void;
  applyDefaults: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const active = p.equipment.find((e) => e.id === p.activeId) ?? p.equipment[0];
  if (!p.equipment.length || !active) return <div className="lg-note">No equipment to edit.</div>;

  if (isExchangerEquipment(active)) return <ExchangerBasis eq={active} />;
  const info = derivedInfo(active);
  const shellRow = active.parts.shell?.[0] ?? {};
  const plateMat = shellRow.sh_mat ?? "SA-516 Gr.70";

  /** update + re-derive the part sheet */
  const upd = (patch: Partial<Equipment>) => {
    p.updateEquipment(active.id, patch);
    p.applyDefaults(active.id);
  };
  /** numbers: keep typing smooth, derive on blur */
  const numUpd = (patch: Partial<Equipment>) => p.updateEquipment(active.id, patch);

  return (
    <div style={{ padding: "0 10px 22px" }}>
      <div style={{ fontWeight: 700, color: "#8b0000", margin: "6px 0", fontSize: 11 }}>
        Equipment Name Edit — tag, description, geometry and design basis
      </div>

      <div className="scroll-x">
        <table className="lg-summary-table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              {["Tag No.", "Equipment Name", "Type", "Qty", "Orient.", "ID (mm)", "T-T (mm)", "Shell t", "Insp.", ""].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.equipment.map((eq) => (
              <tr
                key={eq.id}
                onClick={() => p.setActive(eq.id)}
                style={{ cursor: "pointer", background: eq.id === active.id ? "#dcecd8" : undefined }}
              >
                <td>
                  <input
                    style={{ width: 90, fontSize: 10.5 }}
                    value={eq.tag}
                    onChange={(e) => p.updateEquipment(eq.id, { tag: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td>
                  <input
                    style={{ width: 210, fontSize: 10.5 }}
                    value={eq.name}
                    onChange={(e) => p.updateEquipment(eq.id, { name: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td className="dim">{eq.type}</td>
                <td className="right">{eq.qty}</td>
                <td>{eq.orientation}</td>
                <td className="right">{fmt(eq.diameter, 0)}</td>
                <td className="right">{fmt(eq.ttLength, 0)}</td>
                <td className="right">{fmt(eq.shellThk, 0)}</td>
                <td>{eq.inspection}</td>
                <td style={{ width: 34 }}>
                  <button
                    className="lg-btn"
                    style={{ minWidth: 30, padding: "0 5px" }}
                    onClick={(e) => { e.stopPropagation(); p.onRemove(eq.id); }}
                  >
                    Del
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lg-band" style={{ margin: "10px 0 0" }}>
        <span>
          {active.tag} — {active.name}
        </span>
        <span style={{ textAlign: "right" }}>QTY {active.qty}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 330px", gap: 14, padding: "8px 2px 0" }}>
        <div>
          <div className="lg-group-title">Identification</div>
          <div className="grid g4" style={{ gap: 8 }}>
            <LgField label="Equipment type">
              <select value={active.type} onChange={(e) => upd({ type: e.target.value })}>
                {EQUIPMENT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </LgField>
            <LgField label="Tag no.">
              <input value={active.tag} onChange={(e) => p.updateEquipment(active.id, { tag: e.target.value })} />
            </LgField>
            <LgField label="Equipment name">
              <input value={active.name} onChange={(e) => p.updateEquipment(active.id, { name: e.target.value })} />
            </LgField>
            <LgField label="Qty (nos)">
              <input
                type="number"
                min={1}
                value={active.qty}
                onChange={(e) => p.updateEquipment(active.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
              />
            </LgField>
            <LgField label="Service / description" span={3}>
              <input value={active.service} onChange={(e) => p.updateEquipment(active.id, { service: e.target.value })} />
            </LgField>
          </div>

          <div className="lg-group-title" style={{ marginTop: 10 }}>
            Geometry — fills the whole part sheet
          </div>
          <div className="grid g4" style={{ gap: 8 }}>
            <LgField label="Orientation">
              <select value={active.orientation} onChange={(e) => upd({ orientation: e.target.value })}>
                <option>Vertical</option>
                <option>Horizontal</option>
              </select>
            </LgField>
            <LgField label="Inside dia (mm)">
              <input
                type="number"
                value={active.diameter}
                onChange={(e) => numUpd({ diameter: Number(e.target.value) || 0 })}
                onBlur={() => p.applyDefaults(active.id)}
              />
            </LgField>
            <LgField label="T / T length (mm)">
              <input
                type="number"
                value={active.ttLength}
                onChange={(e) => numUpd({ ttLength: Number(e.target.value) || 0 })}
                onBlur={() => p.applyDefaults(active.id)}
              />
            </LgField>
            <LgField label="Shell thickness (mm)">
              <input
                type="number"
                value={active.shellThk}
                onChange={(e) => numUpd({ shellThk: Number(e.target.value) || 0 })}
                onBlur={() => p.applyDefaults(active.id)}
              />
            </LgField>
          </div>

          <div className="lg-group-title" style={{ marginTop: 10 }}>
            Design basis
          </div>
          <div className="grid g4" style={{ gap: 8 }}>
            <LgField label="Design P (kPa g)">
              <input
                type="number"
                value={active.designPressure}
                onChange={(e) => numUpd({ designPressure: Number(e.target.value) || 0 })}
                onBlur={() => p.applyDefaults(active.id)}
              />
            </LgField>
            <LgField label="Design T (°C)">
              <input
                type="number"
                value={active.designTemperature}
                onChange={(e) => numUpd({ designTemperature: Number(e.target.value) || 0 })}
                onBlur={() => p.applyDefaults(active.id)}
              />
            </LgField>
            <LgField label="MDMT (°C)">
              <input
                type="number"
                value={active.mdmt}
                onChange={(e) => numUpd({ mdmt: Number(e.target.value) || 0 })}
                onBlur={() => p.applyDefaults(active.id)}
              />
            </LgField>
            <LgField label="Corrosion allow. (mm)">
              <input
                type="number"
                value={active.corrosionAllowance}
                onChange={(e) => numUpd({ corrosionAllowance: Number(e.target.value) || 0 })}
                onBlur={() => p.applyDefaults(active.id)}
              />
            </LgField>
            <LgField label="Plate material (MOC)">
              <select
                value={plateMat}
                onChange={(e) =>
                  upd({
                    parts: {
                      ...active.parts,
                      shell: (active.parts.shell ?? [{}]).map((r) => ({ ...r, sh_mat: e.target.value })),
                    },
                  })
                }
              >
                {materialGroups("plate").map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </LgField>
            <LgField label="Head type">
              <select value={active.headType} onChange={(e) => upd({ headType: e.target.value })}>
                {HEAD_TYPES.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </LgField>
            <LgField label="Inspection (EN 10204)">
              <select value={active.inspection} onChange={(e) => upd({ inspection: e.target.value })}>
                <option value="3.1">3.1 — mill certificate</option>
                <option value="3.2">3.2 — verified certificate</option>
              </select>
            </LgField>
            <LgField label="Joint efficiency E">
              <select
                value={String(active.jointEfficiency)}
                onChange={(e) => p.updateEquipment(active.id, { jointEfficiency: Number(e.target.value) })}
              >
                <option value="1">1.00</option>
                <option value="0.85">0.85</option>
                <option value="0.7">0.70</option>
              </select>
            </LgField>
          </div>

          <div className="lg-group-title" style={{ marginTop: 10 }}>
            Fabrication
          </div>
          <div className="grid g4" style={{ gap: 8 }}>
            <LgField label="Radiography">
              <select value={active.radiography} onChange={(e) => p.updateEquipment(active.id, { radiography: e.target.value })}>
                <option>Full RT</option>
                <option>Spot RT</option>
                <option>No RT</option>
              </select>
            </LgField>
            <LgField label="PWHT (UCS-56)">
              <select value={active.pWHT} onChange={(e) => p.updateEquipment(active.id, { pWHT: e.target.value })}>
                <option>Yes</option>
                <option>No</option>
              </select>
            </LgField>
            <LgField label="Insulation (mm)">
              <input
                type="number"
                value={active.insulationThk}
                onChange={(e) => p.updateEquipment(active.id, { insulationThk: Number(e.target.value) || 0 })}
              />
            </LgField>
            <LgField label="Paint system">
              <input value={active.paintSystem} onChange={(e) => p.updateEquipment(active.id, { paintSystem: e.target.value })} />
            </LgField>
          </div>
        </div>

        <div className="lg-side">
          <div className="lg-side-title">What step 4 receives</div>
          <table className="lg-summary-table" style={{ marginBottom: 6 }}>
            <tbody>
              <tr>
                <td>Required shell t</td>
                <td className="right">
                  <b>{fmt(info.shellRequired, 2)} mm</b>
                </td>
              </tr>
              <tr>
                <td>Required head t</td>
                <td className="right">
                  <b>{fmt(info.headRequired, 2)} mm</b>
                </td>
              </tr>
              <tr>
                <td>Allowable S</td>
                <td className="right">{fmt(info.S, 1)} MPa</td>
              </tr>
              <tr>
                <td>Shell + heads</td>
                <td className="right">{fmt(info.massEstimate, 0)} kg</td>
              </tr>
            </tbody>
          </table>
          <ul style={{ margin: "0 0 6px", paddingLeft: 16, fontSize: 9.8, lineHeight: 1.75, color: "#333" }}>
            {defaultsSummary(active).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <button
            className="lg-btn"
            style={{ minWidth: 0, width: "100%", padding: "3px 8px", fontSize: 10 }}
            onClick={() => p.applyDefaults(active.id)}
            title="Re-run the header → part sheet fill for this equipment"
          >
            Re-fill part sheet from header
          </button>
          <div style={{ fontSize: 9.2, color: "#666", marginTop: 6, lineHeight: 1.6 }}>
            Values derived here can still be typed over in step 4; changing a header field replaces them
            again.
          </div>
        </div>
      </div>
    </div>
  );
}

function LgField({ label, span = 1, children }: { label: string; span?: number; children: React.ReactNode }) {
  return (
    <div className="field" style={span > 1 ? { gridColumn: `span ${span}` } : undefined}>
      <label>{label}</label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ step 4 */
function visibleFields(fields: FieldDef[], row: Record<string, string>) {
  return fields.filter((f) => {
    if (!f.showWhen) return true;
    const v = row[f.showWhen.key];
    return v !== undefined && f.showWhen.equals.includes(v);
  });
}

function Step4(p: {
  equipment: Equipment[];
  activeId: string | null;
  setActive: (id: string) => void;
  setCell: (id: string, part: string, idx: number, field: string, value: string) => void;
  addRow: (id: string, part: string) => void;
  removeRow: (id: string, part: string, idx: number) => void;
  updateEquipment: (id: string, patch: Partial<Equipment>) => void;
}) {
  const active = p.equipment.find((e) => e.id === p.activeId) ?? p.equipment[0];
  const rates = useStore((s) => s.rates);
  const partTotals = useMemo(() => {
    if (!active) return {} as Record<string, { w: number; weld: number }>;
    const out: Record<string, { w: number; weld: number }> = {};
    for (const it of buildEquipmentBom(active, rates)) {
      const e = out[it.partKey] ?? { w: 0, weld: 0 };
      e.w += it.weight;
      e.weld += it.weldLength ?? 0;
      out[it.partKey] = e;
    }
    return out;
  }, [active, rates]);
  if (!active) return <div className="lg-note">Create an equipment first.</div>;
  if (isExchangerEquipment(active)) return <ExchangerSheet equipment={p.equipment} activeId={active.id} />;

  return (
    <div style={{ padding: "0 8px 18px" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 8px" }}>
        {p.equipment.map((e) => (
          <button
            key={e.id}
            className="lg-btn"
            style={{
              minWidth: 0,
              padding: "2px 10px",
              background: e.id === active.id ? "#a6d79b" : undefined,
            }}
            onClick={() => p.setActive(e.id)}
          >
            {e.tag} {e.name}
          </button>
        ))}
      </div>

      <div className="lg-band" style={{ margin: "0 0 4px" }}>
        <span>
          {active.type} — {active.tag} {active.name}
        </span>
        <span style={{ textAlign: "center" }}>QTY {active.qty}</span>
      </div>

      {PART_DEFS.map((def) => {
        const rows = active.parts[def.key] ?? [];
        const shown = visibleFields(def.fields, rows[0] ?? {});
        return (
          <div key={def.key} style={{ marginBottom: 14 }}>
            <div className="lg-part" style={{ color: "#111" }}>
              <span className="twisty">[−]</span> {def.label}
              <span style={{ fontWeight: 400, fontSize: 9.5, color: "#777", marginLeft: 6 }}>
                (Excel {def.ref}) · {rows.length} row{rows.length === 1 ? "" : "s"}
                {(partTotals[def.key]?.w ?? 0) > 0 &&
                  ` · ${fmt(partTotals[def.key]?.w ?? 0, 1)} kg · ${fmt(partTotals[def.key]?.weld ?? 0, 1)} m weld`}
              </span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                <button
                  className="lg-btn"
                  style={{ minWidth: 0, padding: "0 6px", fontSize: 10 }}
                  onClick={() => p.addRow(active.id, def.key)}
                  disabled={rows.length >= def.maxRows}
                >
                  + row
                </button>
              </span>
            </div>
            <div className="scroll-x">
              <table className="lg-grid-table" style={{ minWidth: Math.max(560, 120 + shown.reduce((a, f) => a + (f.width ?? 84), 0)) }}>
                <thead>
                  <tr>
                    <th style={{ width: 56 }}>&nbsp;</th>
                    <th style={{ minWidth: 170 }}>{def.rowLabel}</th>
                    {shown.map((f) => (
                      <th key={f.key} title={`Excel ${f.ref} · ${f.label}`}>
                        {f.label}
                        {f.unit ? ` (${f.unit})` : ""}
                      </th>
                    ))}
                    <th style={{ width: 22 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const vis = visibleFields(def.fields, row);
                    return (
                      <tr key={idx}>
                        <td className="code">{`${def.idPrefix}-${String(idx + 1).padStart(2, "0")}`}</td>
                        <td className="code" style={{ background: "#ececec", color: "#111", fontWeight: 400 }}>
                          <input
                            value={row[def.fields[1]?.key] ?? ""}
                            placeholder={`${def.rowLabel} ${String(idx + 1).padStart(2, "0")}`}
                            onChange={(e) => p.setCell(active.id, def.key, idx, def.fields[1]?.key ?? "", e.target.value)}
                            style={{ textAlign: "left", background: "transparent" }}
                          />
                        </td>
                        {shown.map((f) => {
                          const hidden = !vis.find((v) => v.key === f.key);
                          return (
                            <td key={f.key} style={{ width: f.width ?? 84 }}>
                              {hidden ? (
                                <span style={{ display: "block", background: "#f7f7f7", height: 17 }} />
                              ) : f.type === "yesno" || f.type === "select" ? (
                                <select
                                  value={row[f.key] ?? ""}
                                  onChange={(e) => p.setCell(active.id, def.key, idx, f.key, e.target.value)}
                                >
                                  {f.type === "yesno" ? (
                                    <>
                                      <option value="">-</option>
                                      <option value="Yes">Yes</option>
                                      <option value="No">No</option>
                                    </>
                                  ) : (
                                    <>
                                      <option value="">-</option>
                                      {f.groups?.length
                                        ? f.groups.map((g) => (
                                            <optgroup key={g.label} label={g.label}>
                                              {g.options.map((o) => (
                                                <option key={o}>{o}</option>
                                              ))}
                                            </optgroup>
                                          ))
                                        : f.options?.map((o) => <option key={o}>{o}</option>)}
                                    </>
                                  )}
                                </select>
                              ) : (
                                <input
                                  type={f.type === "number" ? "number" : "text"}
                                  value={row[f.key] ?? ""}
                                  onChange={(e) => p.setCell(active.id, def.key, idx, f.key, e.target.value)}
                                  style={{ textAlign: f.type === "number" ? "right" : "left" }}
                                />
                              )}
                            </td>
                          );
                        })}
                        <td style={{ border: "none", background: "#fff" }}>
                          <button
                            className="lg-btn"
                            style={{ minWidth: 0, padding: "0 3px", fontSize: 9, border: "none", background: "transparent", color: "#a22" }}
                            onClick={() => p.removeRow(active.id, def.key, idx)}
                            title="Delete row"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <div className="lg-note">
        Conditional branches from the mapping sheet appear automatically (Cladding = Yes reveals clad
        thickness &amp; material; RF Pad = Yes reveals pad thickness / ID / OD; Gasket and Bolt-Nut
        reveal type, thickness and spare %).
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ step 5 */
function Step5() {
  const { equipment, rates, project } = useStore();
  const cur = getCurrency(project.currency);
  const m = (v: number) => money(v, cur.code);
  const rows = useMemo(() => {
    return equipment.flatMap((eq) => {
      const items = buildEquipmentBom(eq, rates);
      const cost = rollupCost(eq, items, rates);
      return [{ eq, items, cost }];
    });
  }, [equipment, rates]);

  const allItems = rows.flatMap((r) => r.items);
  const totalWeight = allItems.reduce((a, i) => a + i.weight, 0);
  const totalAmount = allItems.reduce((a, i) => a + i.amount, 0);

  return (
    <div style={{ padding: "0 10px 20px" }}>
      <div style={{ fontWeight: 700, color: "#8b0000", margin: "6px 0", fontSize: 11 }}>
        BOM Generation — weight take-off per line item
      </div>
      {equipment.length === 0 && <div className="lg-note">No equipment to break down yet.</div>}
      {equipment.map((eq) => {
        const entry = rows.find((r) => r.eq.id === eq.id);
        if (!entry) return null;
        return (
          <div key={eq.id} style={{ marginBottom: 16 }}>
            <div className="lg-band" style={{ margin: 0 }}>
              <span>
                {eq.tag} — {eq.name} × {eq.qty}
              </span>
              <span style={{ textAlign: "right" }}>
                {fmt(entry.cost.weight, 0)} kg / unit
              </span>
            </div>
            <div className="scroll-x">
              <table className="lg-summary-table" style={{ minWidth: 1140 }}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Material</th>
                    <th className="right">Qty</th>
                    <th className="right">Spare</th>
                    <th>Unit</th>
                    <th>Dimensions</th>
                    <th className="right">Unit wt (kg)</th>
                    <th className="right">Weight (kg)</th>
                    <th className="right">Rate {cur.code}/kg</th>
                    <th className="right">Amount {cur.code}</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.items.map((it) => (
                    <tr key={it.uid}>
                      <td className="mono">{it.itemCode}</td>
                      <td>{it.description}</td>
                      <td>{it.material}</td>
                      <td className="right">{fmt(it.qty, 2)}</td>
                      <td className="right">{it.qtySpare ? fmt(it.qtySpare, 2) : "-"}</td>
                      <td>{it.unit}</td>
                      <td className="mono" style={{ fontSize: 10 }}>{it.spec ?? "-"}</td>
                      <td className="right">{fmt(it.qty ? it.weight / it.qty : 0, 1)}</td>
                      <td className="right">{fmt(it.weight, 1)}</td>
                      <td className="right">{fmt(it.rate * cur.perBhd, cur.decimals)}</td>
                      <td className="right">{fmt(it.amount * cur.perBhd, cur.decimals)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={7}>
                      <b>Sub-total material · {eq.qty} no(s)</b>
                    </td>
                    <td className="right">
                      <b>{fmt(entry.cost.weight * eq.qty, 0)}</b>
                    </td>
                    <td />
                    <td className="right">
                      <b>{m(entry.cost.material * eq.qty)}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 6, fontSize: 10.5 }}>
              <div>Fabrication: {m(entry.cost.fabrication * eq.qty)}</div>
              <div>Welding + testing: {m((entry.cost.welding + entry.cost.testing) * eq.qty)}</div>
              <div>PWHT + painting + insulation: {m((entry.cost.pwht + entry.cost.painting + entry.cost.insulation) * eq.qty)}</div>
              <div>
                <b>Price excl. VAT: {m(entry.cost.grand * eq.qty)}</b>
              </div>
            </div>
          </div>
        );
      })}
      {equipment.length > 0 && (
        <div style={{ borderTop: "2px solid #8b0000", paddingTop: 6, fontSize: 11, fontWeight: 700 }}>
          Project total: {fmt(totalWeight, 0)} kg · material {m(totalAmount)} · all-inclusive{" "}
          {m(rows.reduce((a, r) => a + r.cost.grand * r.eq.qty, 0))} (excl. VAT)
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ step 6 */
function Step6() {
  const { project, equipment, rates } = useStore();
  const data = useMemo(
    () =>
      equipment.map((eq) => {
        const items = buildEquipmentBom(eq, rates);
        return { eq, items, cost: rollupCost(eq, items, rates) };
      }),
    [equipment, rates],
  );

  const total = data.reduce((a, d) => a + d.cost.grand * d.eq.qty, 0);
  const totalWeight = data.reduce((a, d) => a + d.cost.weight * d.eq.qty, 0);
  const cur = getCurrency(project.currency);

  return (
    <div style={{ padding: "0 10px 22px" }}>
      <div style={{ fontWeight: 700, color: "#8b0000", margin: "6px 0", fontSize: 11 }}>
        Summary — {project.projectNo} / {project.projectName}
      </div>
      <div className="scroll-x">
        <table className="lg-summary-table" style={{ minWidth: 880 }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Tag</th>
              <th>Equipment</th>
              <th>Type</th>
              <th className="right">Qty</th>
              <th className="right">Wt/unit (kg)</th>
              <th className="right">Total wt (kg)</th>
              <th className="right">Material {cur.code}</th>
              <th className="right">Fabrication {cur.code}</th>
              <th className="right">Services {cur.code}</th>
              <th className="right">Price {cur.code} (excl. VAT)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={d.eq.id}>
                <td>{i + 1}</td>
                <td className="mono">{d.eq.tag}</td>
                <td>{d.eq.name}</td>
                <td>{d.eq.type}</td>
                <td className="right">{d.eq.qty}</td>
                <td className="right">{fmt(d.cost.weight, 0)}</td>
                <td className="right">{fmt(d.cost.weight * d.eq.qty, 0)}</td>
                <td className="right">{money(d.cost.material * d.eq.qty)}</td>
                <td className="right">{money(d.cost.fabrication * d.eq.qty)}</td>
                <td className="right">{money((d.cost.welding + d.cost.testing + d.cost.pwht + d.cost.painting + d.cost.insulation) * d.eq.qty)}</td>
                <td className="right">{money(d.cost.grand * d.eq.qty)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={6}>
                <b>Total</b>
              </td>
              <td className="right">
                <b>{fmt(totalWeight, 0)}</b>
              </td>
              <td colSpan={3} />
              <td className="right">
                <b>{money(total)}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, maxWidth: 1000 }}>
        <Box k="Equipment count" v={`${equipment.reduce((a, e) => a + e.qty, 0)} nos`} />
        <Box k="Total weight" v={`${fmt(totalWeight, 0)} kg`} />
        <Box k="Avg rate" v={`${money(totalWeight ? total / totalWeight : 0)}/kg`} />
        <Box k="Estimate value" v={money(total)} />
      </div>
      <ColumnDetails equipment={equipment} rates={rates} />
      <ExchangerDetails equipment={equipment} />
      <div className="lg-note" style={{ marginTop: 10 }}>
        Prepared by {project.preparedBy} · Client {project.client} · {project.location} · enquiry{" "}
        {project.enquiryDate} · revision {project.revision}. All prices are ex-works in {cur.code}{" "}
        ({cur.name}), exclusive of Bahrain VAT ({rates.vatPct}%) and of packing &amp; forwarding unless
        noted in the rate book.
      </div>
    </div>
  );
}

/** 24-row column breakdown for the columns actually in this estimate. */
function ColumnDetails({ equipment, rates }: { equipment: Equipment[]; rates: RateBook }) {
  const setColumnExtra = useStore((s) => s.setColumnExtra);
  const [open, setOpen] = useState<string[]>([COLUMN_UNITS[0].tag]);
  const toggle = (tag: string) =>
    setOpen((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));

  const cols = useMemo(() => {
    return COLUMN_UNITS.map((u) => {
      const eq = equipment.find((e) => e.tag === u.tag);
      return eq ? { u, eq } : null;
    }).filter((c): c is { u: ProjectUnit; eq: Equipment } => c !== null);
  }, [equipment]);

  const grand = cols.reduce(
    (a, c) => a + columnTotal(columnBreakdownCost(c.eq, buildEquipmentBom(c.eq, rates), rates)) * c.eq.qty,
    0,
  );

  return (
    <div className="est-panel" style={{ marginTop: 14 }}>
      <div className="est-panel-head">
        <span className="est-panel-title">Columns — additional details</span>
        <span className="est-panel-sub">
          {cols.length} column{cols.length === 1 ? "" : "s"} in this estimate · 24 rows each
        </span>
      </div>
      <div className="est-panel-body">
        {cols.length === 0 && (
          <div className="lg-note">
            No columns in this estimate yet — add a Column / Tower in step 2, or load the scope from the
            Project scope screen, to see its 24-row breakdown here.
          </div>
        )}
        {cols.length > 0 && (
          <div className="est-tree">
            <div className="est-tree-title">
              <span className="ico">▣</span> Columns
            </div>
            {cols.map(({ u, eq }) => {
              const rows = columnBreakdownCost(eq, buildEquipmentBom(eq, rates), rates);
              const isOpen = open.includes(u.tag);
              return (
                <div key={u.tag} className="est-tree-block">
                  <div
                    className="est-tree-node clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(u.tag)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") toggle(u.tag);
                    }}
                    aria-expanded={isOpen}
                  >
                    <span>
                      <b className="twisty">{isOpen ? "−" : "+"}</b> ▣ {eq.tag} {eq.name}{" "}
                      <span className="sub">qty {eq.qty}</span>
                    </span>
                    <span className="tot">{eq.qty}</span>
                    <span className="tot">{fmt(columnTotal(rows), 0)}</span>
                  </div>
                  {isOpen && (
                    <>
                      <div className="est-tree-head">
                        <span />
                        <span className="r">Qty</span>
                        <span className="r">Amount BHD</span>
                      </div>
                      {rows.map((r) => (
                        <div className={`est-tree-row${r.derived ? "" : " manual"}`} key={r.component}>
                          <div className="lbl" title={r.detail}>
                            {r.component}
                          </div>
                          <div className="val">
                            {r.derived ? (
                              fmt(r.qty, 0)
                            ) : (
                              <input
                                value={eq.columnExtras?.[r.component]?.qty ?? ""}
                                onChange={(e) => setColumnExtra(eq.id, r.component, "qty", e.target.value)}
                                placeholder="—"
                                inputMode="decimal"
                                aria-label={`${r.component} quantity`}
                              />
                            )}
                          </div>
                          <div className="val">
                            {r.derived ? (
                              fmt(r.amount, 0)
                            ) : (
                              <input
                                value={eq.columnExtras?.[r.component]?.amount ?? ""}
                                onChange={(e) => setColumnExtra(eq.id, r.component, "amount", e.target.value)}
                                placeholder="—"
                                inputMode="decimal"
                                aria-label={`${r.component} amount`}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="est-tree-foot">
                        <span className="lbl">{u.tag} total</span>
                        <span className="val" />
                        <span className="val">{fmt(columnTotal(rows), 0)}</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            <div className="est-tree-foot">
              <span className="lbl">Columns total</span>
              <span className="val" />
              <span className="val">{fmt(grand, 0)}</span>
            </div>
          </div>
        )}
        <div className="est-note">
          Rows 1-14, 16, 17 and 22 are the take-off (shell, heads, nozzles, manways, supports, skirt,
          ladders, platforms, trays, rungs, baffles, demisters, coalescers, vortex breaker, base ring,
          boot, stiffener ring) and carry the allocated fabrication, welding, testing, PWHT, finish and
          mark-ups. The remaining rows — internal support, fireproofing, foundation template, insulation
          ring, lifting trunnion, tail lug, transportation saddle — are not pressure-part weights and stay
          open for the estimator (shown in italics, amounts in BHD).
        </div>
      </div>
    </div>
  );
}

function Box({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ border: "1px solid #9a9a9a", padding: "5px 8px", background: "#f7f7f7" }}>
      <div style={{ fontSize: 9.5, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</div>
      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{v}</div>
    </div>
  );
}
