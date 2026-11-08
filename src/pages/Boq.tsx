import { useMemo, useState } from "react";
import { useStore, fmt, fmtInt, money } from "../lib/store";
import { buildBoq, buildEquipmentBom, rollupCost, exportCsv, type BomItem } from "../lib/bom";
import { weldSummary } from "../lib/welding";
import {
  cheapestOrigin,
  destinationNames,
  destinationOf,
  landedCost,
  originNames,
  shipmentPlan,
  WORKSHOP,
} from "../lib/logistics";
import { CURRENCIES, getCurrency } from "../lib/currency";
import type { ItemCategory } from "../lib/bom";

const CAT_ORDER: ItemCategory[] = ["Plate", "Pipe", "Flange", "Fitting", "Structure", "Consumable", "Service"];

export default function BoqPage() {
  const {
    equipment,
    rates,
    project,
    setProject,
    logistics,
    setLogistics,
    sourcing,
    setSourcing,
    clearSourcing,
  } = useStore();
  const cur = getCurrency(project.currency);
  const [excluded, setExcluded] = useState<string[]>([]);

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
  const weldHours = included.reduce(
    (a, eq) => a + weldSummary(eq, buildEquipmentBom(eq, rates), rates).hours * eq.qty,
    0,
  );
  const potentialSaving = boq.suggestions.reduce((a, s) => a + s.saving, 0);

  // ---- cross-country procurement -------------------------------------------------
  const landing = useMemo(
    () =>
      boq.lines.map((line) => {
        const origin = sourcing[line.key] ?? logistics.defaultOrigin;
        return { line, origin, breakdown: landedCost(line, origin, logistics) };
      }),
    [boq.lines, sourcing, logistics],
  );
  const plan = useMemo(() => shipmentPlan(landing, logistics), [landing, logistics]);
  const dest = destinationOf(logistics.destination);
  const originCount = new Set(landing.map((l) => l.origin)).size;

  /** where another supply country would land the same part cheaper */
  const advice = useMemo(
    () =>
      [...landing]
        .sort((a, b) => b.line.amount - a.line.amount)
        .slice(0, 6)
        .map((entry) => {
          const best = cheapestOrigin(entry.line, logistics);
          const saving = entry.breakdown.total - best.total;
          return { entry, best, saving };
        })
        .filter((a) => a.saving > Math.max(40, a.entry.line.amount * 0.01))
        .sort((a, b) => b.saving - a.saving),
    [landing, logistics],
  );

  const totalLanded = landing.reduce((a, x) => a + x.breakdown.total, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Optimised bill of quantities</h2>
          <div className="sub">
            Every equipment combined into one procurement view: plate groups are nested on standard{" "}
            {rates.plateWidth}×{rates.plateLength} plates at {Math.round(rates.plateUtilisation * 100)}%
            yield, nozzles/flanges consolidated and repeat equipment batched. Each line is sourced from its
            own country and imported into our <b>{WORKSHOP.city}, {WORKSHOP.country}</b> workshop, then the
            finished equipment is delivered to <b>{dest.name}</b> — road inside the GCC, sea + road from
            everywhere else, with import duty, export duty, insurance, clearing and documentation. Ex-works
            prices are in {cur.name} ({cur.code}) and exclude VAT.
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
          <a className="btn" href="#/welding" title="Welding procedures, weld layers and shop manhours">
            Welding &amp; manhours ({fmtInt(weldHours)} Mhr)
          </a>
          <button
            className="btn btn-primary"
            onClick={() =>
              exportCsv(
                landing.map(({ line: l, origin, breakdown: b }) => ({
                  Category: l.category,
                  Description: l.description,
                  Material: l.material,
                  "Thk (mm)": l.thickness ?? "",
                  Qty: l.qty.toFixed(2),
                  Spare: l.qtySpare.toFixed(2),
                  Unit: l.unit,
                  Dimensions: l.spec ?? "",
                  "Weight (kg)": l.weight.toFixed(1),
                  "Net weight (kg)": (l.weight - (l.wastageKg ?? 0)).toFixed(1),
                  "Wastage (kg)": (l.wastageKg ?? 0).toFixed(1),
                  "Wastage %": l.wastagePct ? Math.round(l.wastagePct * 100) : "",
                  "Stock length (m)": l.purchasedLength ?? "",
                  "Plates req.": l.platesRequired ?? "",
                  "Plate utilisation %": l.utilisation ? Math.round(l.utilisation * 100) : "",
                  [`Rate (${cur.code}/kg)`]: +(l.rate * cur.perBhd).toFixed(3),
                  [`Ex-works (${cur.code})`]: +(l.amount * cur.perBhd).toFixed(cur.decimals),
                  Origin: origin,
                  Lane: b.lane,
                  Mode: b.mode,
                  Equipment: b.equipment,
                  [`Freight (${cur.code})`]: +(b.freight * cur.perBhd).toFixed(cur.decimals),
                  [`Duty ${b.dutyPct}% (${cur.code})`]: +(b.duty * cur.perBhd).toFixed(cur.decimals),
                  [`Insurance (${cur.code})`]: +(b.insurance * cur.perBhd).toFixed(cur.decimals),
                  [`Landed (${cur.code})`]: +((l.amount + b.total) * cur.perBhd).toFixed(cur.decimals),
                  Currency: cur.code,
                  EquipmentTags: l.equipmentTags.join(" / "),
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
        <Kpi k="Quoted ex-works" v={money(totalNet)} n={`excl. VAT · VAT ${rates.vatPct}% = ${money(totalVat)}`} />
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi k="Delivered to client" v={money(totalNet + totalLanded)} n={`${WORKSHOP.city} workshop → ${dest.name} · ${logistics.incoterm}`} />
        <Kpi k="Import into Bahrain" v={money(plan.importFreight + plan.importDuty + plan.packing)} n={`${originCount} supply countries · duty ${money(plan.importDuty)}`} />
        <Kpi k="Export to client" v={money(plan.exportFreight + plan.exportDuty)} n={dest.region === "GCC" ? `0% GCC common tariff · ${plan.containers} × 40ft` : `destination duty ${money(plan.exportDuty)} · ${plan.containers} × 40ft`} />
        <Kpi k="Clearing & documents" v={money(plan.clearance + plan.docs)} n={`import file + export file · insurance ${money(plan.insurance + plan.surcharge)}`} />
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Procurement &amp; delivery basis</h3>
          <span className="hint">every rate is editable — the landed cost of each line recalculates</span>
        </div>
        <div className="card-body">
          <div className="grid g4">
            <div className="field">
              <label>Client destination</label>
              <select value={logistics.destination} onChange={(e) => setLogistics({ destination: e.target.value })}>
                {destinationNames().map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Default supply country</label>
              <select value={logistics.defaultOrigin} onChange={(e) => setLogistics({ defaultOrigin: e.target.value })}>
                {originNames().map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Incoterm (reference)</label>
              <select value={logistics.incoterm} onChange={(e) => setLogistics({ incoterm: e.target.value as typeof logistics.incoterm })}>
                {["EXW", "FOB", "CIF", "DAP", "DDP"].map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Insurance (% CIF)</label>
              <input type="number" step="0.05" value={logistics.insurancePct} onChange={(e) => setLogistics({ insurancePct: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Duty override (%) — blank = tariff</label>
              <input
                type="number"
                step="0.5"
                value={logistics.dutyOverridePct ?? ""}
                placeholder={`${dest.duty}% at ${dest.name}`}
                onChange={(e) => setLogistics({ dutyOverridePct: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Road freight ({cur.code}/t·km)</label>
              <input type="number" step="0.005" value={logistics.landRate} onChange={(e) => setLogistics({ landRate: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Sea freight factor</label>
              <input type="number" step="0.05" value={logistics.seaRateFactor} onChange={(e) => setLogistics({ seaRateFactor: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Port handling ({cur.code}/t)</label>
              <input type="number" step="0.5" value={logistics.portHandling} onChange={(e) => setLogistics({ portHandling: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Customs clearing ({cur.code}/shipment)</label>
              <input type="number" step="10" value={logistics.clearance} onChange={(e) => setLogistics({ clearance: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Documentation ({cur.code}/shipment)</label>
              <input type="number" step="10" value={logistics.documentation} onChange={(e) => setLogistics({ documentation: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Fuel / bunker surcharge (%)</label>
              <input type="number" step="0.5" value={logistics.fuelPct} onChange={(e) => setLogistics({ fuelPct: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Export packing (% of material)</label>
              <input type="number" step="0.1" value={logistics.packingPct} onChange={(e) => setLogistics({ packingPct: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Abnormal load surcharge (%)</label>
              <input type="number" step="1" value={logistics.abnormalLoadPct} onChange={(e) => setLogistics({ abnormalLoadPct: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <button className="btn" onClick={clearSourcing} title="Every line returns to the default supply country">
                Reset all lines to {logistics.defaultOrigin}
              </button>
            </div>
          </div>
          <div className="divider" />
          <div className="small dim">
            Workshop: <b>{WORKSHOP.city}, {WORKSHOP.country}</b> — material is imported into Bahrain first and the
            finished equipment is exported from Bahrain to the client. A Bahrain client pays no export leg and no
            duty on Bahrain-made equipment; a GCC client clears at 0% under the common tariff with a certificate of
            origin; other destinations pay their tariff on the declared export value. {dest.name}: {dest.note}.
            Port {dest.port} · {dest.inlandKm} km inland · destination duty {dest.duty}% · import duty into Bahrain
            5%{dest.warRiskPct ? ` · war-risk ${dest.warRiskPct}%` : ""}. Clearing and documentation are charged
            once per shipment on each leg.
          </div>
        </div>
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

      <div className="card">
        <div className="card-head">
          <h3>Consolidated BOQ — ex-works and landed</h3>
          <span className="hint">plate lines re-weighed on nested plates; each line carries its own supply country</span>
        </div>
        <div className="card-body tight scroll-x" style={{ maxHeight: 620, overflowY: "auto" }}>
          <table className="data">
            <thead>
              <tr>
                <th>Cat.</th><th>Description</th><th>Material</th><th className="num">Thk</th>
                <th className="num">Qty</th><th className="num">Spare</th><th>Unit</th><th className="num">Weight (kg)</th>
                <th className="num">Rate</th><th className="num">Ex-works</th>
                <th>Origin</th><th>Mode / packing</th>
                <th className="num">Import / export freight</th><th className="num">Duty imp / exp</th><th className="num">Insur.</th>
                <th className="num">Landed</th><th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {landing.map(({ line: l, origin, breakdown: b }) => (
                <tr key={l.key}>
                  <td><span className="pill">{l.category}</span></td>
                  <td>{l.description}</td>
                  <td className="small">{l.material}</td>
                  <td className="num">{l.thickness ?? "-"}</td>
                  <td className="num">{fmt(l.qty, 1)}</td>
                  <td className="num">{l.qtySpare ? fmt(l.qtySpare, 1) : "-"}</td>
                  <td className="small">{l.unit}</td>
                  <td className="num">{fmt(l.weight, 1)}</td>
                  <td className="num">{fmt(l.rate * cur.perBhd, cur.decimals)}</td>
                  <td className="num">{fmt(l.amount * cur.perBhd, cur.decimals)}</td>
                  <td>
                    <select
                      className="btn"
                      style={{ padding: "1px 2px", fontSize: 10, minWidth: 96 }}
                      value={origin}
                      onChange={(e) => setSourcing(l.key, e.target.value)}
                      title={b.lane}
                    >
                      {originNames().map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <div className="est-sub">
                      {origin === WORKSHOP.country ? "local supply" : `import duty ${b.importDutyPct}%`}
                    </div>
                  </td>
                  <td className="small" title={`${b.note} · ${b.equipment}`}>
                    {b.mode}
                    <div className="est-sub">{b.equipment}</div>
                  </td>
                  <td className="num">
                    {fmt(b.freight * cur.perBhd, cur.decimals)}
                    <div className="est-sub">{fmt(b.importFreight * cur.perBhd, cur.decimals)} / {fmt(b.exportFreight * cur.perBhd, cur.decimals)}</div>
                  </td>
                  <td className="num">
                    {fmt(b.duty * cur.perBhd, cur.decimals)}
                    <div className="est-sub">{fmt(b.importDuty * cur.perBhd, cur.decimals)} / {fmt(b.exportDuty * cur.perBhd, cur.decimals)}</div>
                  </td>
                  <td className="num">{fmt(b.insurance * cur.perBhd, cur.decimals)}</td>
                  <td className="num">{fmt((l.amount + b.total) * cur.perBhd, cur.decimals)}</td>
                  <td className="taglist">
                    {l.equipmentTags.slice(0, 3).map((t) => (
                      <span className="tag" key={t}>{t}</span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}>Total</td>
                <td className="num">{fmtInt(boq.totals.weight)}</td>
                <td />
                <td className="num">{fmt(boq.totals.amount * cur.perBhd, cur.decimals)}</td>
                <td colSpan={2} />
                <td className="num">{fmt(plan.freight * cur.perBhd, cur.decimals)}</td>
                <td className="num">{fmt(plan.duty * cur.perBhd, cur.decimals)}</td>
                <td className="num">{fmt(plan.insurance * cur.perBhd, cur.decimals)}</td>
                <td className="num">{fmt((boq.totals.amount + totalLanded) * cur.perBhd, cur.decimals)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Material wastage — plates &amp; pipes</h3>
          <span className="hint">
            {fmtInt(boq.wastage.totalLossKg)} kg lost · {money(boq.wastage.totalCost)} at material rates
          </span>
        </div>
        <div className="card-body tight scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Category</th><th>Material</th><th>Basis</th>
                <th className="num">Net kg</th><th className="num">Purchased kg</th>
                <th className="num">Wastage kg</th><th className="num">Wastage %</th><th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {boq.wastage.rows.map((r) => (
                <tr key={`${r.category}-${r.material}-${r.detail}`}>
                  <td><span className="pill">{r.category}</span></td>
                  <td className="small">{r.material}</td>
                  <td className="small dim">{r.detail}</td>
                  <td className="num">{fmt(r.netKg, 1)}</td>
                  <td className="num">{fmt(r.purchasedKg, 1)}</td>
                  <td className="num"><b>{fmt(r.lossKg, 1)}</b></td>
                  <td className="num">{fmt(r.lossPct * 100, 1)}%</td>
                  <td className="num">{fmt(r.cost * cur.perBhd, cur.decimals)}</td>
                </tr>
              ))}
              {boq.wastage.rows.length === 0 && (
                <tr><td colSpan={8} className="dim" style={{ padding: 10 }}>No plate or pipe lines in this scope.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>
                  Plate {fmt(boq.wastage.plate.lossPct * 100, 1)}% · pipe/tube {fmt(boq.wastage.pipe.lossPct * 100, 1)}%
                </td>
                <td className="num">{fmt(boq.wastage.plate.netKg + boq.wastage.pipe.netKg, 1)}</td>
                <td className="num">{fmt(boq.wastage.plate.purchasedKg + boq.wastage.pipe.purchasedKg, 1)}</td>
                <td className="num">{fmt(boq.wastage.totalLossKg, 1)}</td>
                <td />
                <td className="num">{fmt(boq.wastage.totalCost * cur.perBhd, cur.decimals)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="est-note">
          Plates are compared as purchased nested plate against the net cut area at{" "}
          {Math.round(rates.plateUtilisation * 100)}% assumed yield on {rates.plateWidth}×{rates.plateLength} plates.
          Pipes and tubes are bought in 6 m random lengths with a 3% cut / end-trim allowance, taken from the net
          cut length of each line. Wastage is valued at the material rate and is already inside the purchased weight
          above — it is not added again.
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Two-leg shipment plan — import into Bahrain, export to {dest.name}</h3>
          <span className="hint">
            {fmtInt(plan.weight)} kg · {fmt(plan.volume, 1)} m³ · {plan.rows.length} supply countries ·{" "}
            {plan.containers} × 40ft equivalent
          </span>
        </div>
        <div className="card-body tight scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Leg</th><th>Origin</th><th>Mode</th><th>Packing</th><th className="num">Weight (kg)</th>
                <th className="num">m³</th><th>Containers</th>
                <th className="num">Freight</th><th className="num">Handling</th><th className="num">Packing</th>
                <th className="num">Duty</th><th className="num">Insurance</th><th className="num">Clearing</th>
                <th className="num">Docs</th><th className="num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((r) => (
                <tr key={r.leg + r.origin}>
                  <td><span className={`pill ${r.leg === "Export" ? "ok" : ""}`}>{r.leg}</span></td>
                  <td>
                    {r.origin}
                    <div className="est-sub">{r.note}</div>
                  </td>
                  <td className="small">{r.mode}</td>
                  <td className="small">{r.packing}</td>
                  <td className="num">{fmtInt(r.weight)}</td>
                  <td className="num">{fmt(r.volume, 1)}</td>
                  <td className="small">{r.containers}</td>
                  <td className="num">{fmt(r.freight * cur.perBhd, cur.decimals)}</td>
                  <td className="num">{fmt(r.handling * cur.perBhd, cur.decimals)}</td>
                  <td className="num">{fmt(r.packingCost * cur.perBhd, cur.decimals)}</td>
                  <td className="num">{fmt(r.duty * cur.perBhd, cur.decimals)}</td>
                  <td className="num">{fmt(r.insurance * cur.perBhd, cur.decimals)}</td>
                  <td className="num">{fmt(r.clearance * cur.perBhd, cur.decimals)}</td>
                  <td className="num">{fmt(r.docs * cur.perBhd, cur.decimals)}</td>
                  <td className="num">{fmt(r.subtotal * cur.perBhd, cur.decimals)}</td>
                </tr>
              ))}
              {plan.rows.length === 0 && (
                <tr><td colSpan={15} className="dim" style={{ padding: 10 }}>No procured parts in this scope.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total logistics</td>
                <td className="num">{fmtInt(plan.weight)}</td>
                <td className="num">{fmt(plan.volume, 1)}</td>
                <td />
                <td className="num">{fmt(plan.freight * cur.perBhd, cur.decimals)}</td>
                <td className="num">{fmt(plan.handling * cur.perBhd, cur.decimals)}</td>
                <td className="num">{fmt(plan.packing * cur.perBhd, cur.decimals)}</td>
                <td className="num">{fmt(plan.duty * cur.perBhd, cur.decimals)}</td>
                <td className="num">{fmt(plan.insurance * cur.perBhd, cur.decimals)}</td>
                <td className="num">{fmt(plan.clearance * cur.perBhd, cur.decimals)}</td>
                <td className="num">{fmt(plan.docs * cur.perBhd, cur.decimals)}</td>
                <td className="num">{fmt(plan.logistics * cur.perBhd, cur.decimals)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="est-note">
          Leg 1 brings raw material into the {WORKSHOP.city} workshop and attracts 5% Bahrain import duty; leg 2
          ships the finished equipment from Bahrain and attracts the client's tariff — 0% inside the GCC with a
          certificate of origin, a declared export value elsewhere. FCL on the sea lane, GCC road for regional
          delivery, flat rack / low-bed / breakbulk where a single piece leaves the container envelope. Clearing
          and documentation are charged once per shipment on each leg; insurance covers material and freight on
          both. Air freight is not modelled — it is only justified for spares against a shutdown.
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
                <tr><td className="dim">of which welding labour — {fmtInt(weldHours)} Mhr × {money(rates.weld.shopRate)}/Mhr</td><td className="num dim">{money(weldHours * rates.weld.shopRate)}</td></tr>
                <tr><td>Painting &amp; insulation</td><td className="num">{money(finishCost)}</td></tr>
                <tr><td>Overhead + profit + freight</td><td className="num">{money(overheads)}</td></tr>
                <tr><td><b>Ex-works total (excl. VAT)</b></td><td className="num"><b>{money(totalNet)}</b></td></tr>
                <tr><td>Import freight, packing &amp; handling — into Bahrain</td><td className="num">{money(plan.importFreight + plan.packing + plan.handling / 2)}</td></tr>
                <tr><td>Import duty — Bahrain 5% on CIF</td><td className="num">{money(plan.importDuty)}</td></tr>
                <tr><td>Export freight &amp; handling — {WORKSHOP.city} to {dest.name}</td><td className="num">{money(plan.exportFreight + plan.handling / 2)}</td></tr>
                <tr><td>Export duty — {dest.region === "GCC" ? "0% GCC common tariff" : `${dest.name} tariff`}</td><td className="num">{money(plan.exportDuty)}</td></tr>
                <tr><td>Clearing, brokerage &amp; documentation — both legs</td><td className="num">{money(plan.clearance + plan.docs)}</td></tr>
                <tr><td>Marine insurance &amp; surcharges</td><td className="num">{money(plan.insurance + plan.surcharge)}</td></tr>
                <tr><td><b>Delivered {dest.name} ({logistics.incoterm})</b></td><td className="num"><b>{money(totalNet + plan.logistics)}</b></td></tr>
                <tr><td className="dim">VAT @ {rates.vatPct}% — not included</td><td className="num dim">{money(totalVat)}</td></tr>
                <tr><td>Effective rate</td><td className="num">{money(totalWeight ? totalNet / totalWeight : 0)}/kg</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Sourcing advice</h3>
          <span className="hint">same part, another supply country — landed cost compared</span>
        </div>
        <div className="card-body">
          {advice.length === 0 && (
            <p className="dim small">
              Every line is already on its cheapest landed origin for the current freight basis.
            </p>
          )}
          <div className="grid g2">
            {advice.map((a) => (
              <div className="callout" key={a.entry.line.key}>
                <b>{a.entry.line.description}</b>
                <span className="pill ok" style={{ marginLeft: 8 }}>{money(a.saving)} cheaper</span>
                <div className="mt8 small">
                  {a.entry.origin} → {a.best.origin} · landed {money(a.entry.line.amount + a.entry.breakdown.total)} →{" "}
                  {money(a.entry.line.amount + a.best.total)}
                  <button
                    className="btn"
                    style={{ marginLeft: 8, padding: "1px 6px", fontSize: 10 }}
                    onClick={() => setSourcing(a.entry.line.key, a.best.origin)}
                  >
                    Source from {a.best.origin}
                  </button>
                </div>
              </div>
            ))}
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
