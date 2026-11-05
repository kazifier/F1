import { useMemo, useState } from "react";
import { useStore, fmt, fmtInt, money } from "../lib/store";
import { buildEquipmentBom } from "../lib/bom";
import { weldSummary } from "../lib/welding";
import { MATERIALS } from "../lib/catalog";
import { getCurrency } from "../lib/currency";
import type { GougeSelect, WeldProcess } from "../lib/types";

const PROCESSES: WeldProcess[] = ["GTAW", "SMAW", "SAW", "FCAW"];
const GOUGE_OPTIONS: GougeSelect[] = ["Auto", "Manual grinding", "Machine grinding"];

/**
 * Welding & manhours — the detailed welding section.
 *
 * The rate book used to sit inside the Optimised BOQ; here it belongs with the
 * thing it prices: every part is broken into its weld type, joint preparation,
 * weld layers (TIG root, SMAW fill up to 20 mm, SAW fill above), the back-gouge
 * step and the resulting shop hours at the shop manhour rate.
 */
export default function WeldingPage() {
  const { equipment, rates, setRates, project } = useStore();
  const cur = getCurrency(project.currency);
  const [activeId, setActiveId] = useState<string>(equipment[0]?.id ?? "");
  const [all, setAll] = useState(false);
  const w = rates.weld ?? ({} as typeof rates.weld);

  const summaries = useMemo(
    () =>
      equipment.map((eq) => ({
        eq,
        sum: weldSummary(eq, buildEquipmentBom(eq, rates), rates),
      })),
    [equipment, rates],
  );

  const active = summaries.find((s) => s.eq.id === activeId) ?? summaries[0];
  const rows = all ? summaries.flatMap((s) => s.sum.rows) : active?.sum.rows ?? [];
  const totals = summaries.reduce(
    (a, s) => ({
      hours: a.hours + s.sum.hours * s.eq.qty,
      cost: a.cost + s.sum.cost * s.eq.qty,
      metres: a.metres + s.sum.metres * s.eq.qty,
      gouge: a.gouge + s.sum.gougeMetres * s.eq.qty,
    }),
    { hours: 0, cost: 0, metres: 0, gouge: 0 },
  );
  const shownHours = all
    ? summaries.reduce((a, s) => a + s.sum.hours * s.eq.qty, 0)
    : (active?.sum.hours ?? 0) * (active?.eq.qty ?? 1);
  const shownCost = shownHours * (w.shopRate ?? 2);
  const shownMetres = rows.reduce((a, r) => a + r.metres, 0);

  const byProcess = useMemo(() => {
    const map = new Map<WeldProcess, { hours: number; mass: number }>();
    for (const r of rows) {
      for (const l of r.layers) {
        const cur = map.get(l.process) ?? { hours: 0, mass: 0 };
        map.set(l.process, {
          hours: cur.hours + l.hoursPerM * r.metres,
          mass: cur.mass + l.massPerM * r.metres,
        });
      }
    }
    return [...map.entries()].sort((a, b) => b[1].hours - a[1].hours);
  }, [rows]);

  const byPrep = useMemo(() => {
    const map = new Map<string, { metres: number; hours: number }>();
    for (const r of rows) {
      const c = map.get(r.prep) ?? { metres: 0, hours: 0 };
      map.set(r.prep, { metres: c.metres + r.metres, hours: c.hours + r.hours });
    }
    return [...map.entries()];
  }, [rows]);

  const set = (patch: Partial<typeof w>) => setRates({ weld: { ...w, ...patch } });
  const rateField = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    unit: string,
    step = 0.05,
  ) => (
    <div className="field">
      <label>
        {label} {unit && <span className="dim">({unit})</span>}
      </label>
      <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Welding &amp; shop manhours</h2>
          <div className="sub">
            Every pressure joint, broken down by weld type and procedure: TIG root, SMAW fill up to{" "}
            {w.thickThreshold} mm and SAW fill above it, single V or double V by thickness, with the
            back-gouge step priced by manual or machine grinding from the equipment diameter. Hours are
            valued at the shop manhour rate of <b>{cur.code === "BHD" ? "BD" : cur.code} {fmt(w.shopRate, 2)}</b>.
          </div>
        </div>
        <div className="actions">
          <label className="field" style={{ minWidth: 190 }}>
            <label>Shop manhour rate ({cur.code}/Mhr)</label>
            <input
              type="number"
              step="0.25"
              value={w.shopRate}
              onChange={(e) => set({ shopRate: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      <div className="grid g5" style={{ marginBottom: 14 }}>
        <Kpi k="Weld length" v={`${fmt(shownMetres, 1)} m`} n={all ? "whole estimate" : active?.eq.tag ?? "—"} />
        <Kpi k="Back-gouged" v={`${fmt(rows.filter((r) => r.gouge !== "None").reduce((a, r) => a + r.metres, 0), 1)} m`} n="UW-35 single V, one side" />
        <Kpi k="Manhours" v={fmt(shownHours, 1)} n={`${fmt(shownMetres ? shownHours / shownMetres : 0, 2)} h/m average`} />
        <Kpi k="Weld cost" v={money(shownCost)} n={`${fmt(w.shopRate, 2)} ${cur.code}/Mhr`} />
        <Kpi k="Estimate total" v={money(totals.cost)} n={`${fmtInt(totals.hours)} Mhr · ${fmtInt(totals.metres)} m`} />
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Welding procedure basis</h3>
          <span className="hint">applies to every equipment — change once, all hours and prices follow</span>
        </div>
        <div className="card-body">
          <div className="grid g4">
            <div className="field">
              <label>Root pass process</label>
              <select value={w.rootProcess} onChange={(e) => set({ rootProcess: e.target.value as WeldProcess })}>
                {PROCESSES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Fill / cap up to {w.thickThreshold} mm</label>
              <select value={w.fillProcessThin} onChange={(e) => set({ fillProcessThin: e.target.value as WeldProcess })}>
                {PROCESSES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Fill / cap above {w.thickThreshold} mm</label>
              <select value={w.fillProcessThick} onChange={(e) => set({ fillProcessThick: e.target.value as WeldProcess })}>
                {PROCESSES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Single V → double V above (mm)</label>
              <input type="number" value={w.doubleVThreshold} onChange={(e) => set({ doubleVThreshold: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Back-gouge method</label>
              <select value={w.gougeMethod} onChange={(e) => set({ gougeMethod: e.target.value as GougeSelect })}>
                {GOUGE_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            {rateField("Machine grind from Ø", w.gougeAutoDia, (v) => set({ gougeAutoDia: v }), "mm", 50)}
            {rateField("Manual grind", w.manualGougeRate, (v) => set({ manualGougeRate: v }), "Mhr/m per 10 mm")}
            {rateField("Machine grind", w.machineGougeRate, (v) => set({ machineGougeRate: v }), "Mhr/m per 10 mm")}
            {rateField("Fit-up & handling", w.fitUp, (v) => set({ fitUp: v }), "Mhr/m")}
          </div>
          <div className="divider" />
          <div className="small dim">
            Every double V joint (above {w.doubleVThreshold} mm) is welded from the inside, back-gouged to
            sound metal and only then welded from the outside. Single V joints are back-gouged the same way
            above 8 mm; square-groove fillets and thin plate are not gouged. Shells below Ø{w.gougeAutoDia} mm
            are hand-ground, at or above it the shop machine-grinds — or force one method above.
          </div>
        </div>
      </div>

      <div className="est-toolbar">
        <label className="est-field">
          <span>Equipment</span>
          <select value={active?.eq.id ?? ""} onChange={(e) => { setActiveId(e.target.value); setAll(false); }}>
            {summaries.map((s) => (
              <option key={s.eq.id} value={s.eq.id}>
                {s.eq.tag} — {s.eq.name}
              </option>
            ))}
          </select>
        </label>
        <label className="est-check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Show the whole estimate
        </label>
        <div className="est-readout">
          <span className="k">Joints</span>
          <span className="v">{rows.length} weld rows</span>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Weld schedule — {all ? "whole estimate" : `${active?.eq.tag ?? ""} ${active?.eq.name ?? ""}`}</h3>
          <span className="hint">hours = weld metal / deposition + fit-up + back gouge, per metre of joint</span>
        </div>
        <div className="card-body tight scroll-x" style={{ maxHeight: 560, overflowY: "auto" }}>
          <table className="data">
            <thead>
              <tr>
                <th>Tag</th><th>Part</th><th>Weld type</th><th>Code</th>
                <th className="num">Thk</th><th>Prep</th><th>Back gouge</th>
                <th>Layers</th><th className="num">m</th><th className="num">Mhr/m</th>
                <th className="num">Mhr</th><th className="num">{cur.code}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="small">{r.tag}</td>
                  <td>{r.part}</td>
                  <td>
                    {r.weldType}
                    <div className="est-sub">{r.note}</div>
                  </td>
                  <td className="small">{r.codeRef}</td>
                  <td className="num">{fmt(r.thickness, 0)}</td>
                  <td className="small">{r.prep}</td>
                  <td className="small">
                    <span className={`pill ${r.gouge === "None" ? "" : "ok"}`}>{r.gouge === "None" ? "—" : r.gouge}</span>
                  </td>
                  <td className="small">{r.layerText}</td>
                  <td className="num">{fmt(r.metres, 2)}</td>
                  <td className="num">{fmt(r.hoursPerM, 2)}</td>
                  <td className="num">{fmt(r.hours, 1)}</td>
                  <td className="num">{fmt(r.cost * cur.perBhd, cur.decimals)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="dim" style={{ padding: 10 }}>
                    No weld-bearing parts in this equipment. Load the scope from the project page first.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={8}>Total</td>
                <td className="num">{fmt(shownMetres, 2)}</td>
                <td />
                <td className="num">{fmt(shownHours, 1)}</td>
                <td className="num">{fmt(shownCost * cur.perBhd, cur.decimals)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid g3" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head"><h3>By process</h3></div>
          <div className="card-body tight">
            <table className="data">
              <thead><tr><th>Process</th><th className="num">Mhr</th><th className="num">Filler (kg)</th><th className="num">Cost</th></tr></thead>
              <tbody>
                {byProcess.map(([p, v]) => (
                  <tr key={p}>
                    <td>{p}{p === w.rootProcess ? " (root)" : ""}</td>
                    <td className="num">{fmt(v.hours, 1)}</td>
                    <td className="num">{fmt(v.mass, 0)}</td>
                    <td className="num">{money(v.hours * w.shopRate)}</td>
                  </tr>
                ))}
                {byProcess.length === 0 && <tr><td colSpan={4} className="dim">—</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>By joint preparation</h3></div>
          <div className="card-body tight">
            <table className="data">
              <thead><tr><th>Prep</th><th className="num">m</th><th className="num">Mhr</th><th className="num">Cost</th></tr></thead>
              <tbody>
                {byPrep.map(([p, v]) => (
                  <tr key={p}>
                    <td>{p}</td>
                    <td className="num">{fmt(v.metres, 1)}</td>
                    <td className="num">{fmt(v.hours, 1)}</td>
                    <td className="num">{money(v.hours * w.shopRate)}</td>
                  </tr>
                ))}
                {byPrep.length === 0 && <tr><td colSpan={4} className="dim">—</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Manhour build-up</h3></div>
          <div className="card-body tight">
            <table className="data">
              <tbody>
                <tr><td>Weld metal (root + fill + cap)</td><td className="num">{fmt(shownHours ? shownHours * 0.62 : 0, 1)} Mhr</td></tr>
                <tr><td>Fit-up, cleaning, interpass</td><td className="num">{fmt(shownHours ? shownHours * 0.28 : 0, 1)} Mhr</td></tr>
                <tr><td>Back gouging &amp; grinding</td><td className="num">{fmt(shownHours ? shownHours * 0.1 : 0, 1)} Mhr</td></tr>
                <tr><td><b>Total welding labour</b></td><td className="num"><b>{fmt(shownHours, 1)} Mhr · {money(shownCost)}</b></td></tr>
                <tr><td className="dim">Shop rate</td><td className="num">{fmt(w.shopRate, 2)} {cur.code}/Mhr</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <RateBook />
    </>
  );
}

function Kpi({ k, v, n }: { k: string; v: string; n?: string }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {n && <div className="n">{n}</div>}
    </div>
  );
}

/** purchase / fabrication rate book — kept separate from the BOQ */
function RateBook() {
  const { rates, setRates, project } = useStore();
  const cur = getCurrency(project.currency);
  const k = cur.perBhd; // BHD → display currency
  const dec = Math.max(cur.decimals, 2);
  const show = (v: number) => +(v * k).toFixed(dec);
  const back = (v: string) => (Number.isFinite(Number(v)) ? Number(v) / k : 0);

  const Rate = ({ label, value, onSet }: { label: string; value: number; onSet: (bhd: number) => void }) => (
    <div className="field">
      <label>{label}</label>
      <input type="number" step="any" value={show(value)} onChange={(e) => onSet(back(e.target.value))} />
    </div>
  );

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <h3>Rate book</h3>
        <span className="hint">entered in {cur.code}, stored in BHD · drives steps 5 &amp; 6, the BOQ and this page</span>
      </div>
      <div className="card-body">
        <div className="grid g4">
          <Rate label={`Fabrication — carbon steel (${cur.code}/kg)`} value={rates.fabricationCmf} onSet={(v) => setRates({ fabricationCmf: v })} />
          <Rate label={`Fabrication — stainless (${cur.code}/kg)`} value={rates.fabricationSsf} onSet={(v) => setRates({ fabricationSsf: v })} />
          <Rate label={`Weld testing / NDT (${cur.code}/m)`} value={rates.testingRate} onSet={(v) => setRates({ testingRate: v })} />
          <Rate label={`PWHT (${cur.code}/kg)`} value={rates.pwhtRate} onSet={(v) => setRates({ pwhtRate: v })} />
          <Rate label={`Painting (${cur.code}/m²)`} value={rates.paintingRate} onSet={(v) => setRates({ paintingRate: v })} />
          <div className="field">
            <label>Plate width (mm)</label>
            <input type="number" value={rates.plateWidth} onChange={(e) => setRates({ plateWidth: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Plate length (mm)</label>
            <input type="number" value={rates.plateLength} onChange={(e) => setRates({ plateLength: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Nesting yield (%)</label>
            <input
              type="number"
              value={Math.round(rates.plateUtilisation * 100)}
              onChange={(e) => setRates({ plateUtilisation: Math.max(0.3, Math.min(1, Number(e.target.value) / 100)) })}
            />
          </div>
          <div className="field">
            <label>Overhead (%)</label>
            <input type="number" value={rates.overheadPct} onChange={(e) => setRates({ overheadPct: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Profit (%)</label>
            <input type="number" value={rates.profitPct} onChange={(e) => setRates({ profitPct: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Freight (%)</label>
            <input type="number" value={rates.freightPct} onChange={(e) => setRates({ freightPct: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Bahrain VAT (%) — excluded</label>
            <input type="number" value={rates.vatPct} onChange={(e) => setRates({ vatPct: Number(e.target.value) })} />
          </div>
        </div>

        <div className="divider" />
        <div className="small dim" style={{ marginBottom: 8 }}>
          Material purchase rate ({cur.code}/kg) — all prices exclude Bahrain VAT ({rates.vatPct}%)
        </div>
        <div className="grid g5">
          {MATERIALS.map((m) => (
            <Rate
              key={m.name}
              label={m.name}
              value={rates.materialRate[m.name] ?? m.rate}
              onSet={(v) => setRates({ materialRate: { ...rates.materialRate, [m.name]: v } })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
