import { useMemo, useState } from "react";
import { useStore, fmt, fmtInt, money } from "../lib/store";
import { buildBoq, buildEquipmentBom, rollupCost, exportCsv, type BomItem } from "../lib/bom";
import { MATERIALS } from "../lib/catalog";
import { CURRENCIES, getCurrency, VAT_BH } from "../lib/currency";
import type { ItemCategory } from "../lib/bom";

const CAT_ORDER: ItemCategory[] = ["Plate", "Pipe", "Flange", "Fitting", "Structure", "Consumable", "Service"];

export default function BoqPage() {
  const { equipment, rates, project, setProject } = useStore();
  const cur = getCurrency(project.currency);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [showRates, setShowRates] = useState(false);

  const included = equipment.filter((e) => !excluded.includes(e.id));

  const items: BomItem[] = useMemo(() => {
    return included.flatMap((eq) =>
      buildEquipmentBom(eq, rates).map((it) => ({
        ...it,
        qty: it.qty * eq.qty,
        qtySpare: (it.qtySpare ?? 0) * eq.qty,
        weight: it.weight * eq.qty,
        amount: it.amount * eq.qty,
      })),
    );
  }, [included, rates]);

  const boq = useMemo(() => buildBoq(included, items, rates), [included, items, rates]);

  const cost = useMemo(
    () =>
      included.map((eq) => {
        const eqItems = buildEquipmentBom(eq, rates);
        return { eq, roll: rollupCost(eq, eqItems, rates) };
      }),
    [included, rates],
  );

  const directMaterial = cost.reduce((a, c) => a + c.roll.material * c.eq.qty, 0);
  const directFabrication = cost.reduce((a, c) => a + (c.roll.fabrication + c.roll.welding + c.roll.testing + c.roll.pwht) * c.eq.qty, 0);
  const finishCost = cost.reduce((a, c) => a + (c.roll.painting + c.roll.insulation) * c.eq.qty, 0);
  const overheads = cost.reduce((a, c) => a + (c.roll.overhead + c.roll.profit + c.roll.freight) * c.eq.qty, 0);
  const totalNet = cost.reduce((a, c) => a + c.roll.total * c.eq.qty, 0);
  const totalVat = cost.reduce((a, c) => a + c.roll.vat * c.eq.qty, 0);
  const totalWeight = boq.totals.weight;
  const potentialSaving = boq.suggestions.reduce((a, s) => a + s.saving, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Optimised bill of quantities</h2>
          <div className="sub">
            Every equipment combined into one procurement view: plate groups are nested on standard{" "}
            {rates.plateWidth}×{rates.plateLength} plates at {Math.round(rates.plateUtilisation * 100)}%
            yield, nozzles/flanges are consolidated, and repeat equipment is batched. Exclude items to see
            the effect on the price instantly. Every amount is ex-works, {cur.name} ({cur.code}) and
            excludes VAT.
          </div>
        </div>
        <div className="actions">
          <select
            className="btn"
            aria-label="Currency"
            value={project.currency}
            onChange={(e) => setProject({ currency: e.target.value })}
            title="Display currency — all amounts are held in BHD and converted"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => setShowRates((v) => !v)}>
            {showRates ? "Hide rate book" : "Rate book"}
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              exportCsv(
                boq.lines.map((l) => ({
                  Category: l.category,
                  Description: l.description,
                  Material: l.material,
                  "Thk (mm)": l.thickness ?? "",
                  Qty: l.qty.toFixed(2),
                  Spare: l.qtySpare.toFixed(2),
                  Unit: l.unit,
                  Dimensions: l.spec ?? "",
                  "Weight (kg)": l.weight.toFixed(1),
                  "Plates req.": l.platesRequired ?? "",
                  "Plate utilisation %": l.utilisation ? Math.round(l.utilisation * 100) : "",
                  [`Rate (${cur.code}/kg)`]: +(l.rate * cur.perBhd).toFixed(3),
                  [`Amount (${cur.code})`]: +(l.amount * cur.perBhd).toFixed(cur.decimals),
                  Currency: cur.code,
                  Equipment: l.equipmentTags.join(" / "),
                })),
                `BOQ-${project.projectNo}.csv`,
              )
            }
          >
            Export BOQ (CSV)
          </button>
        </div>
      </div>

      <div className="grid g5" style={{ marginBottom: 14 }}>
        <Kpi k="Equipment included" v={`${included.reduce((a, e) => a + e.qty, 0)}`} n={`${included.length} line item(s)`} />
        <Kpi k="Purchased weight" v={`${fmtInt(totalWeight)} kg`} n={`${boq.lines.length} BOQ groups`} />
        <Kpi k="Plates required" v={`${boq.totals.plates}`} n={`${fmtInt(boq.totals.plateWeight)} kg nested`} />
        <Kpi k="Material + fab" v={money(directMaterial + directFabrication)} n={`${money(totalWeight ? directMaterial / totalWeight : 0, cur.code)}/kg material avg`} />
        <Kpi k="Quoted price" v={money(totalNet)} n={`excl. VAT · VAT ${rates.vatPct}% = ${money(totalVat)}`} />
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Scope selection</h3>
          <span className="hint">click to include / exclude — the BOQ recalculates immediately</span>
        </div>
        <div className="card-body">
          <div className="eq-tabs">
            {equipment.map((e) => {
              const off = excluded.includes(e.id);
              return (
                <button
                  key={e.id}
                  className={`eq-tab ${off ? "" : "active"}`}
                  style={off ? { opacity: 0.45 } : undefined}
                  onClick={() => setExcluded((x) => (off ? x.filter((i) => i !== e.id) : [...x, e.id]))}
                >
                  <span className="t">{e.tag} ×{e.qty}</span>
                  <span className="n">{e.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showRates && <RateBook />}

      <div className="card">
        <div className="card-head">
          <h3>Consolidated BOQ</h3>
          <span className="hint">plate lines re-weighed on nested plates; all other lines are net take-off</span>
        </div>
        <div className="card-body tight scroll-x" style={{ maxHeight: 620, overflowY: "auto" }}>
          <table className="data">
            <thead>
              <tr>
                <th>Cat.</th><th>Description</th><th>Material</th><th className="num">Thk</th>
                <th className="num">Qty</th><th className="num">Spare</th><th>Unit</th><th>Dimensions</th><th className="num">Weight (kg)</th>
                <th className="num">Net area m²</th><th className="num">Plates</th><th className="num">Nest %</th>
                <th className="num">{cur.code}/kg</th><th className="num">Amount {cur.code}</th><th>Equipment</th>
              </tr>
            </thead>
            <tbody>
              {boq.lines.map((l) => (
                <tr key={l.key}>
                  <td><span className="pill">{l.category}</span></td>
                  <td>{l.description}</td>
                  <td className="small">{l.material}</td>
                  <td className="num">{l.thickness ?? "-"}</td>
                  <td className="num">{fmt(l.qty, 1)}</td>
                  <td className="num">{l.qtySpare ? fmt(l.qtySpare, 1) : "-"}</td>
                  <td className="small">{l.unit}</td>
                  <td className="small">{l.spec ?? "-"}</td>
                  <td className="num">{fmt(l.weight, 1)}</td>
                  <td className="num">{l.plateArea ? fmt(l.plateArea, 2) : "-"}</td>
                  <td className="num">{l.platesRequired ?? "-"}</td>
                  <td className="num">{l.utilisation ? Math.round(l.utilisation * 100) : "-"}</td>
                  <td className="num">{fmt(l.rate * cur.perBhd, cur.decimals)}</td>
                  <td className="num">{fmt(l.amount * cur.perBhd, cur.decimals)}</td>
                  <td className="taglist">
                    {l.equipmentTags.map((t) => (
                      <span className="tag" key={t}>{t}</span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={8}>Total</td>
                <td className="num">{fmtInt(boq.totals.weight)}</td>
                <td colSpan={3} />
                <td />
                <td className="num">{fmt(boq.totals.amount * cur.perBhd, cur.decimals)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid g3" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head"><h3>By category</h3></div>
          <div className="card-body">
            {CAT_ORDER.filter((c) => boq.byCategory.some((b) => b.category === c)).map((c) => {
              const row = boq.byCategory.find((b) => b.category === c)!;
              const pct = totalWeight ? (row.weight / totalWeight) * 100 : 0;
              return (
                <div key={c} style={{ marginBottom: 10 }}>
                  <div className="row between small">
                    <span>{c}</span>
                    <span className="mono">{fmtInt(row.weight)} kg · {fmt(pct, 1)}%</span>
                  </div>
                  <div className="bar mt8"><i style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>By material</h3></div>
          <div className="card-body">
            {boq.byMaterial
              .slice()
              .sort((a, b) => b.weight - a.weight)
              .map((m) => {
                const pct = totalWeight ? (m.weight / totalWeight) * 100 : 0;
                return (
                  <div key={m.material} style={{ marginBottom: 10 }}>
                    <div className="row between small">
                      <span>{m.material}</span>
                      <span className="mono">{fmtInt(m.weight)} kg · {fmt(pct, 1)}%</span>
                    </div>
                    <div className="bar mt8"><i style={{ width: `${pct}%`, background: "linear-gradient(90deg,#a78bfa,#22d3ee)" }} /></div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Price build-up</h3></div>
          <div className="card-body tight">
            <table className="data">
              <tbody>
                <tr><td>Raw material (nested plates + bought-out)</td><td className="num">{money(directMaterial)}</td></tr>
                <tr><td>Fabrication, welding, NDT, PWHT</td><td className="num">{money(directFabrication)}</td></tr>
                <tr><td>Painting &amp; insulation</td><td className="num">{money(finishCost)}</td></tr>
                <tr><td>Overhead + profit + freight</td><td className="num">{money(overheads)}</td></tr>
                <tr><td><b>Ex-works total (excl. VAT)</b></td><td className="num"><b>{money(totalNet)}</b></td></tr>
                <tr><td className="dim">VAT @ {rates.vatPct}% — not included</td><td className="num dim">{money(totalVat)}</td></tr>
                <tr><td>Effective rate</td><td className="num">{money(totalWeight ? totalNet / totalWeight : 0)}/kg</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Optimisation findings</h3>
          <span className="hint">estimated saving {money(potentialSaving)}</span>
        </div>
        <div className="card-body">
          {boq.suggestions.length === 0 && <p className="dim small">No optimisation flags for this scope.</p>}
          <div className="grid g2">
            {boq.suggestions.map((s) => (
              <div className="callout" key={s.title}>
                <b>{s.title}</b>
                {s.saving > 0 && <span className="pill ok" style={{ marginLeft: 8 }}>{money(s.saving)}</span>}
                <div className="mt8 small">{s.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
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
    <div className="card">
      <div className="card-head">
        <h3>Rate book</h3>
        <span className="hint">
          editable — entered in {cur.code}, stored in BHD · drives steps 5 &amp; 6 and this BOQ
        </span>
      </div>
      <div className="card-body">
        <div className="grid g4">
          <Rate label={`Fabrication — carbon steel (${cur.code}/kg)`} value={rates.fabricationCmf} onSet={(v) => setRates({ fabricationCmf: v })} />
          <Rate label={`Fabrication — stainless (${cur.code}/kg)`} value={rates.fabricationSsf} onSet={(v) => setRates({ fabricationSsf: v })} />
          <Rate label={`Welding (${cur.code}/m)`} value={rates.weldingRate} onSet={(v) => setRates({ weldingRate: v })} />
          <Rate label={`NDT (${cur.code}/m)`} value={rates.testingRate} onSet={(v) => setRates({ testingRate: v })} />
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
          Material purchase rate ({cur.code}/kg) — all prices exclude Bahrain VAT ({VAT_BH}%)
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
