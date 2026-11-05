import { useMemo, useState } from "react";
import { fmt, fmtInt, useStore } from "../lib/store";
import { buildEquipmentBom } from "../lib/bom";
import { columnBreakdownCost, columnTotal } from "../lib/columnBreakdown";
import {
  COLUMN_UNITS,
  PROJECT_UNITS,
  VESSEL_UNITS,
  isBodyFlange,
  isManway,
  kgcmToKpa,
  parseNozzles,
  type ProjectUnit,
} from "../data/units";
import { auditUnit, buildScope, unitAssumptions, unitToEquipment } from "../data/build";
import { EXCHANGER_UNITS } from "../data/exchangers";
import { buildExchangerScope, exchangerToEquipment } from "../lib/exchangerParts";
import { designExchanger } from "../lib/tema";
import type { Equipment } from "../lib/types";

type Tab = "columns" | "vessels" | "exchangers";

export default function ProjectPage() {
  const { equipment, rates, replaceEquipment, setColumnExtra } = useStore();
  const [tab, setTab] = useState<Tab>("columns");
  const [selected, setSelected] = useState<string>("10-C01");
  const [heSelected, setHeSelected] = useState<string>("10-E01");
  const [openCols, setOpenCols] = useState<string[]>(() => [COLUMN_UNITS[0].tag]);
  const toggleCol = (tag: string) =>
    setOpenCols((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));

  // match on tag *and* datasheet name: the demo seed equipment reuses the same
  // tags with different names and must not be mistaken for a loaded datasheet
  const isDatasheet = (e: Equipment) => {
    const u = PROJECT_UNITS.find((x) => x.tag === e.tag);
    return Boolean(u && u.name === e.name);
  };

  const loadedByTag = useMemo(() => {
    const m = new Map<string, Equipment>();
    for (const e of equipment) if (isDatasheet(e) && !m.has(e.tag)) m.set(e.tag, e);
    return m;
  }, [equipment]);

  /** the datasheet build of every tag, so the column sheet is complete before a tag is loaded */
  const builtByTag = useMemo(
    () => new Map(PROJECT_UNITS.map((u) => [u.tag, unitToEquipment(u)] as const)),
    [],
  );

  const heLoadedByTag = useMemo(() => {
    const m = new Map<string, Equipment>();
    for (const e of equipment) {
      if (!e.he && !/exchanger|fired heater/i.test(e.type)) continue;
      const u = EXCHANGER_UNITS.find((x) => x.tag === e.tag && x.name === e.name);
      if (u && !m.has(u.tag)) m.set(u.tag, e);
    }
    return m;
  }, [equipment]);

  /** the TEMA/ASME build of every exchanger, so the register shows the design before loading */
  const heBuiltByTag = useMemo(
    () => new Map(EXCHANGER_UNITS.map((u) => [u.tag, exchangerToEquipment(u)] as const)),
    [],
  );

  const columnGrandTotal = useMemo(
    () =>
      COLUMN_UNITS.reduce((a, u) => {
        const eq = loadedByTag.get(u.tag) ?? builtByTag.get(u.tag)!;
        return a + columnTotal(columnBreakdownCost(eq, buildEquipmentBom(eq, rates), rates)) * eq.qty;
      }, 0),
    [loadedByTag, builtByTag, rates],
  );

  /** editing a manual row loads that column into the estimate first */
  const editExtra = (
    u: ProjectUnit,
    shown: Equipment,
    component: string,
    field: "qty" | "amount",
    value: string,
  ) => {
    const loaded = equipment.find((e) => e.tag === u.tag && e.name === u.name);
    if (loaded) {
      setColumnExtra(loaded.id, component, field, value);
      return;
    }
    replaceEquipment([...equipment, shown]);
    setColumnExtra(shown.id, component, field, value);
  };

  const unit = PROJECT_UNITS.find((u) => u.tag === selected) ?? COLUMN_UNITS[0];
  const listed = tab === "columns" ? COLUMN_UNITS : VESSEL_UNITS;
  const loadedCount = PROJECT_UNITS.filter((u) => loadedByTag.has(u.tag)).length;

  const load = (u: ProjectUnit) => {
    const built = unitToEquipment(u);
    const existing = equipment.find((e) => e.tag === u.tag && e.name === u.name);
    if (existing) {
      replaceEquipment(equipment.map((e) => (e.id === existing.id ? { ...built, id: existing.id } : e)));
    } else {
      replaceEquipment([...equipment, built]);
    }
  };

  const loadScope = () => replaceEquipment(buildScope(PROJECT_UNITS));

  const loadExchangerScope = () => replaceEquipment(buildExchangerScope(EXCHANGER_UNITS));

  const loadExchanger = (tag: string) => {
    const u = EXCHANGER_UNITS.find((x) => x.tag === tag);
    if (!u) return;
    const existing = equipment.find((e) => /exchanger/i.test(e.type) && e.tag === u.tag && e.name === u.name);
    const built = exchangerToEquipment(u);
    if (existing) {
      replaceEquipment(equipment.map((e) => (e.id === existing.id ? { ...built, id: existing.id } : e)));
    } else {
      replaceEquipment([...equipment, built]);
    }
  };

  const weight = useMemo(() => {
    return equipment.reduce((a, e) => {
      const items = buildEquipmentBom(e, rates);
      return a + items.reduce((s, it) => s + it.weight, 0) * e.qty;
    }, 0);
  }, [equipment, rates]);

  const audit = auditUnit(unit);
  const nozzles = parseNozzles(unit.nozzles);
  const manwayCount = nozzles
    .filter((n) => isManway(n) && !isBodyFlange(n))
    .reduce((a, n) => a + n.count, 0);
  const pipeCount = nozzles
    .filter((n) => !isManway(n) && !isBodyFlange(n) && /^\d/.test(n.size))
    .reduce((a, n) => a + n.count, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Project scope — 6 columns, 25 vessels, 31 heat exchangers</h2>
          <div className="sub">
            Every tag below is transcribed from the client datasheet book (equipment list + UOP project
            specifications 9135751 / 9135753 / 9135752-301, internals per 307). Load a tag to build its
            estimate, or load the whole scope. Dimensions are in mm, pressure in the datasheet's
            kg/cm²(g) (shown with the app's kPa basis), all prices are estimates and exclude VAT.
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => replaceEquipment([])}>
            Clear estimate
          </button>
          <button className="btn" onClick={loadScope}>
            Load columns &amp; vessels (31)
          </button>
          <button className="btn btn-primary" onClick={loadExchangerScope}>
            Load heat exchangers (31)
          </button>
        </div>
      </div>

      <div className="grid g5" style={{ marginBottom: 14 }}>
        <Kpi k="Columns" v={`${COLUMN_UNITS.length}`} n="trayed + packed" />
        <Kpi k="Vessels" v={`${VESSEL_UNITS.length}`} n="drums, receivers, treaters" />
        <Kpi k="Heat exchangers" v={`${EXCHANGER_UNITS.length}`} n="TEMA shell & tube, 401 series" />
        <Kpi k="In estimate" v={`${loadedCount} / 31`} n="loaded from datasheets" />
        <Kpi k="Purchased weight" v={`${fmtInt(weight)} kg`} n="loaded items, net take-off" />
        <Kpi k="Units of measure" v="mm · kg/cm² · °C" n="BHD base currency" />
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Datasheet register</h3>
          <span className="hint">click a tag to open its datasheet check</span>
        </div>
        <div className="card-body">
          <div className="eq-tabs">
            <button className={`eq-tab ${tab === "columns" ? "active" : ""}`} onClick={() => setTab("columns")}>
              <span className="t">Columns ×{COLUMN_UNITS.length}</span>
              <span className="n">10-C01 … 12-C02</span>
            </button>
            <button className={`eq-tab ${tab === "vessels" ? "active" : ""}`} onClick={() => setTab("vessels")}>
              <span className="t">Vessels ×{VESSEL_UNITS.length}</span>
              <span className="n">10-D01 … 12-D10</span>
            </button>
            <button className={`eq-tab ${tab === "exchangers" ? "active" : ""}`} onClick={() => setTab("exchangers")}>
              <span className="t">Exchangers ×{EXCHANGER_UNITS.length}</span>
              <span className="n">10-E01 … 12-E12 · TEMA</span>
            </button>
          </div>
        </div>
        <div className="card-body tight scroll-x" style={{ display: tab === "exchangers" ? "none" : undefined }}>
          <table className="data">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Service</th>
                <th>Unit</th>
                <th>Ori.</th>
                <th>Size (mm)</th>
                <th className="num">P kg/cm²</th>
                <th className="num">T °C</th>
                <th className="num">Shell</th>
                <th className="num">Heads</th>
                <th>Internals</th>
                <th className="num">Nozz.</th>
                <th className="num">MW</th>
                <th>Loaded</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((u) => {
                const on = loadedByTag.has(u.tag);
                return (
                  <tr
                    key={u.tag}
                    onClick={() => setSelected(u.tag)}
                    style={{
                      cursor: "pointer",
                      background: u.tag === selected ? "rgba(37,99,235,.07)" : undefined,
                    }}
                  >
                    <td className="mono nowrap">
                      <strong>{u.tag}</strong>
                    </td>
                    <td>
                      {u.name}
                      {u.special !== "—" && <span className="small dim"> · {u.special}</span>}
                    </td>
                    <td className="small nowrap">{u.group}</td>
                    <td className="small">{u.orientation}</td>
                    <td className="small nowrap">{u.size}</td>
                    <td className="num">{u.pKgcm}{u.vacuum ? " / FV" : ""}</td>
                    <td className="num">{u.tempC}</td>
                    <td className="num">{u.shellThk}</td>
                    <td className="num small">
                      {u.topHead.thk} / {u.botHead.thk}
                    </td>
                    <td className="small">
                      {u.trays ? `${u.trays} trays` : u.beds ? `${u.beds.length} beds` : u.demister ? "demister" : u.coalescer ? "coalescer" : "—"}
                    </td>
                    <td className="num">{parseNozzles(u.nozzles).filter((n) => !isManway(n) && !isBodyFlange(n)).length}</td>
                    <td className="num">
                      {parseNozzles(u.nozzles)
                        .filter((n) => isManway(n) && !isBodyFlange(n))
                        .reduce((a, n) => a + n.count, 0) || "—"}
                    </td>
                    <td>
                      {on ? (
                        <span className="pill ok">loaded</span>
                      ) : (
                        <button
                          className="btn btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            load(u);
                          }}
                        >
                          Load
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {tab === "exchangers" && (
          <div className="card-body tight scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Service</th>
                  <th>Unit</th>
                  <th>TEMA</th>
                  <th className="num">Surface m²</th>
                  <th className="num">Shell P/T</th>
                  <th className="num">Tube P/T</th>
                  <th className="num">Shell ID</th>
                  <th className="num">Tubes</th>
                  <th className="num">Bundle kg</th>
                  <th>Loaded</th>
                </tr>
              </thead>
              <tbody>
                {EXCHANGER_UNITS.map((u) => {
                  const eq = heLoadedByTag.get(u.tag) ?? heBuiltByTag.get(u.tag)!;
                  const d = designExchanger(eq.he!);
                  const on = heLoadedByTag.has(u.tag);
                  return (
                    <tr
                      key={u.tag}
                      onClick={() => setHeSelected(u.tag)}
                      style={{
                        cursor: "pointer",
                        background: u.tag === heSelected ? "rgba(37,99,235,.07)" : undefined,
                      }}
                    >
                      <td className="mono nowrap">
                        <strong>{u.tag}</strong>
                      </td>
                      <td>{u.name}</td>
                      <td className="small nowrap">{u.group}</td>
                      <td className="small mono">{u.tema}</td>
                      <td className="num">{d.surfaceTotal.toFixed(0)}</td>
                      <td className="num small nowrap">{u.pShell} / {u.tShell} °C</td>
                      <td className="num small nowrap">{u.pTube} / {u.tTube} °C</td>
                      <td className="num">{d.shellId}</td>
                      <td className="num">{d.tubesTotal}</td>
                      <td className="num">{fmtInt(d.weights.bundle)}</td>
                      <td>
                        {on ? (
                          <span className="pill ok">loaded</span>
                        ) : (
                          <button
                            className="btn btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              loadExchanger(u.tag);
                            }}
                          >
                            Load
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid g2" style={{ marginTop: 14, display: tab === "exchangers" ? "none" : undefined }}>
        <div className="card">
          <div className="card-head">
            <h3>
              {unit.tag} · {unit.name}
            </h3>
            <span className="hint">{unit.group} unit · {unit.orientation === "V" ? "vertical" : "horizontal"}</span>
          </div>
          <div className="card-body">
            <table className="data">
              <tbody>
                <Row k="Service" v={unit.service} />
                <Row k="Size" v={`${unit.size} mm`} />
                <Row k="Design pressure" v={`${unit.pKgcm} kg/cm²(g)${unit.vacuum ? " + full vacuum" : ""} = ${fmtInt(kgcmToKpa(unit.pKgcm))} kPa`} />
                <Row k="Design temperature" v={`${unit.tempC} °C`} />
                <Row k="MOC / CA" v={`Killed carbon steel · CA ${unit.ca} mm`} />
                <Row k="Shell thickness" v={`${unit.shellThk} mm`} />
                <Row k="Heads" v={`${unit.topHead.type} ${unit.topHead.thk} mm top · ${unit.botHead.type} ${unit.botHead.thk} mm bottom`} />
                <Row k="Flange class / facing" v={`${unit.class} · raised face`} />
                <Row k="Radiography / PWHT" v={`${unit.rt} / ${unit.pwht}`} />
                <Row k="Support" v={unit.support === "skirt" ? "Skirt (by contractor)" : "Saddles (by contractor)"} />
                <Row k="Accessories" v={`Ladders & platforms ${unit.ladders ? "yes" : "no"} · insulation clips ${unit.insulated ? "yes" : "no"}`} />
                <Row
                  k="Internals"
                  v={
                    unit.trays
                      ? `${unit.trays} valve trays${unit.sections ? ` (${unit.sections.map((s) => `${s.trays} @ Ø${s.dia}`).join(", ")})` : ""}`
                      : unit.beds
                        ? unit.beds.map((b) => `${b.size} × ${b.depth} mm ${b.packing}`).join(" · ")
                        : [unit.demister ? `${unit.demister} mm demister` : "", unit.coalescer ? `${unit.coalescer} mm coalescer` : ""]
                            .filter(Boolean)
                            .join(" · ") || "—"
                  }
                />
                <Row k="Nozzles / manways" v={`${pipeCount} nozzles · ${manwayCount} manways`} />
                {unit.boot && <Row k="Boot" v={`${unit.boot.nps} · shell ${unit.boot.thk} · head ${unit.boot.headThk} mm`} />}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Datasheet check</h3>
            <span className="hint">ASME VIII Div.1 UG-27 / UG-32 at E = {/full/i.test(unit.rt) ? 1 : 0.85}</span>
          </div>
          <div className="card-body">
            <div className="grid g2" style={{ marginBottom: 10 }}>
              <div className={`callout ${audit.shellShort ? "bad" : "ok"}`}>
                <strong>Shell {unit.shellThk} mm</strong>
                <div className="small">
                  Required {fmt(audit.shellRequired, 1)} mm · margin{" "}
                  {audit.shellMargin >= 0 ? "+" : ""}
                  {fmt(audit.shellMargin, 1)} mm
                </div>
              </div>
              <div className={`callout ${audit.headShort ? "bad" : "ok"}`}>
                <strong>Head {unit.botHead.thk} mm</strong>
                <div className="small">
                  Required {fmt(audit.headRequired, 1)} mm · margin{" "}
                  {audit.headMargin >= 0 ? "+" : ""}
                  {fmt(audit.headMargin, 1)} mm
                </div>
              </div>
            </div>
            <div className="small dim" style={{ marginBottom: 10 }}>
              Allowable stress at {unit.tempC} °C: {fmt(audit.S, 1)} MPa (SA-516 Gr.70). Datasheet plate is
              checked against the governing circumferential / longitudinal case including CA.
            </div>

            {unit.flags && unit.flags.length > 0 && (
              <>
                <h4 style={{ margin: "10px 0 6px", fontSize: 12 }}>Cross-check findings</h4>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {unit.flags.map((f) => (
                    <li key={f} style={{ marginBottom: 4 }}>
                      {f}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h4 style={{ margin: "12px 0 6px", fontSize: 12 }}>Estimating assumptions</h4>
            <ul className="small dim" style={{ margin: 0, paddingLeft: 18 }}>
              {unitAssumptions(unit).map((a) => (
                <li key={a} style={{ marginBottom: 3 }}>
                  {a}
                </li>
              ))}
            </ul>

            {unit.notes && (
              <>
                <h4 style={{ margin: "12px 0 6px", fontSize: 12 }}>Datasheet notes</h4>
                <ul className="small dim" style={{ margin: 0, paddingLeft: 18 }}>
                  {unit.notes.map((n) => (
                    <li key={n} style={{ marginBottom: 3 }}>
                      {n}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14, display: tab === "exchangers" ? "none" : undefined }}>
        <div className="card-head">
          <h3>Nozzle & manway schedule — {unit.tag}</h3>
          <span className="hint">
            {pipeCount} pipe openings · {manwayCount} manways · class {unit.class}
          </span>
        </div>
        <div className="card-body tight scroll-x" style={{ maxHeight: 360, overflowY: "auto" }}>
          <table className="data">
            <thead>
              <tr>
                <th>Mark</th>
                <th className="num">Size (in)</th>
                <th>Service</th>
                <th className="num">Qty</th>
                <th>Modelled as</th>
              </tr>
            </thead>
            <tbody>
              {nozzles.map((n) => (
                <tr key={`${n.mark}-${n.service}`}>
                  <td className="mono nowrap">{n.mark}</td>
                  <td className="num">{n.size}</td>
                  <td>{n.service}</td>
                  <td className="num">{n.count}</td>
                  <td className="small dim">
                    {isBodyFlange(n)
                      ? "body flange (no opening)"
                      : isManway(n)
                        ? "manway / flanged end"
                        : /^\d/.test(n.size)
                          ? "pipe nozzle"
                          : "not dimensioned — excluded"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="est-panel" style={{ display: tab === "exchangers" ? "none" : undefined }}>
        <div className="est-panel-head">Columns — estimate breakdown (legacy column sheet)</div>
        <div className="est-panel-body">
          <div className="est-tree">
            <div className="est-tree-title">
              <span className="ico">▣</span> Columns
            </div>
            <div className="est-tree-node">
              <span>
                ▣ Columns — {COLUMN_UNITS.length} items{" "}
                <span className="sub">6 columns · trayed + packed</span>
              </span>
              <span className="tot">{COLUMN_UNITS.length}</span>
              <span className="tot">{fmt(columnGrandTotal, 0)}</span>
            </div>
            {COLUMN_UNITS.map((u, idx) => {
              const eq = loadedByTag.get(u.tag) ?? builtByTag.get(u.tag)!;
              const rows = columnBreakdownCost(eq, buildEquipmentBom(eq, rates), rates);
              return (
                <div key={u.tag} className="est-tree-block">
                  <ColumnTree
                    label={`CL-${String(idx + 1).padStart(2, "0")} - ${u.tag} ${u.name}`}
                    rows={rows}
                    total={columnTotal(rows)}
                    eq={eq}
                    open={openCols.includes(u.tag)}
                    onToggle={() => toggleCol(u.tag)}
                    onEdit={(component, field, value) => editExtra(u, eq, component, field, value)}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="est-note">
          Rows 1-14, 16, 17 and 22 are the take-off (shell, heads, nozzles, manways, supports, skirt,
          ladders, platforms, trays, rungs, baffles, demisters, coalescers, vortex breaker, base ring,
          boot, stiffener ring) and carry the allocated fabrication, welding, testing, PWHT, finish and
          mark-ups. The remaining rows — internal support, fireproofing, foundation template, insulation
          ring, lifting trunnion, tail lug, transportation saddle — are not pressure-part weights and stay
          open for the estimator (shown in italics, amounts in BHD).
        </div>
      </div>

      {tab === "exchangers" && (() => {
        const u = EXCHANGER_UNITS.find((x) => x.tag === heSelected) ?? EXCHANGER_UNITS[0];
        const eq = heLoadedByTag.get(u.tag) ?? heBuiltByTag.get(u.tag)!;
        const d = designExchanger(eq.he!);
        return (
          <div className="grid g2" style={{ marginTop: 14 }}>
            <div className="card">
              <div className="card-head">
                <h3>{u.tag} · {u.name}</h3>
                <span className="hint">{u.group} unit · TEMA {u.tema}</span>
              </div>
              <div className="card-body">
                <table className="data">
                  <tbody>
                    <Row k="Service" v={u.service} />
                    <Row k="TEMA / arrangement" v={`${u.tema} — ${u.group === "FBP" ? "1.25Cr-0.5Mo" : "killed carbon steel"}, ${d.spec.shells} shell${d.spec.shells === 1 ? "" : "s"}, ${d.spec.shellPasses} shell pass / ${d.spec.tubePasses} tube passes`} />
                    <Row k="Effective surface" v={`${fmt(d.surfaceTotal, 0)} m² (datasheet ${fmt(u.surfaceM2, 0)} m²)`} />
                    <Row k="Shell" v={`Ø${d.shellId} ID × ${d.shellThk} mm · ${d.spec.tubeLength} mm tubes`} />
                    <Row k="Tubes" v={`${d.tubesTotal} × Ø${u.tubeOd} × ${u.tubeThk} mm, ${u.pitch} mm ${u.pattern}° pitch`} />
                    <Row k="Design pressure" v={`shell ${u.pShell} kg/cm²(g) · tube ${u.pTube} kg/cm²(g)`} />
                    <Row k="Design temperature" v={`shell ${u.tShell} °C · tube ${u.tTube} °C · MDMT ${u.mdmt} °C`} />
                    <Row k="MOC / CA" v={`${u.shellMat} shell · ${u.tubeMat} tubes · CA ${u.ca} mm`} />
                    <Row k="Tubesheets" v={`${d.tubesheetThk} mm ${d.fixedTubesheet ? "fixed" : "floating"} plates (TEMA RCB-7.2)`} />
                    <Row k="Baffles" v={`${d.baffleCount} × ${d.baffleCut}% cut at ${d.baffleSpacing} mm c/c · ${d.tieRods} tie rods`} />
                    <Row k="Bundle / unit weight" v={`${fmtInt(d.weights.bundle)} kg bundle · ${fmtInt(d.weights.total * d.spec.shells)} kg per unit`} />
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <div className="card-head">
                <h3>TEMA / ASME design check</h3>
                <span className="hint">ASME VIII Div.1 · TEMA 9th edition</span>
              </div>
              <div className="card-body">
                <table className="data">
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Code</th>
                      <th style={{ width: 120 }}>Item</th>
                      <th>Check</th>
                      <th style={{ width: 60 }}>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.checks.map((c) => (
                      <tr key={c.code + c.item}>
                        <td className="small">{c.code}</td>
                        <td className="small">{c.item}</td>
                        <td className="small">{c.detail}</td>
                        <td style={{ color: c.ok ? "#1c6b1c" : "#8b0000", fontWeight: 700 }}>
                          {c.ok ? "OK" : "REVIEW"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="small dim" style={{ marginTop: 8 }}>
                  Bundle size is held inside the customer's 20 000 kg pulling limit by adding shells in
                  parallel (UOP note: the number of shells is an estimate to be confirmed by the exchanger
                  designer). Loading a tag builds its full part sheet in the estimating wizard.
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="callout" style={{ marginTop: 14 }}>
        <strong>Estimating-grade.</strong> Datasheet values are transcribed and independently re-checked
        (UG-27 / UG-32, flange class, tray counts, T/T lengths), but this scope still needs a licensed
        U-stamp review, a Section I re-check for 12-D10, and supplier quotations for trays, packing,
        demisters and coalescers before it is a firm price.
      </div>
    </>
  );
}

/** One column of the legacy sheet: blue node row, then its 24 component rows. */
function ColumnTree({
  label,
  rows,
  total,
  eq,
  open,
  onToggle,
  onEdit,
}: {
  label: string;
  rows: ReturnType<typeof columnBreakdownCost>;
  total: number;
  eq: Equipment;
  open: boolean;
  onToggle: () => void;
  onEdit: (component: string, field: "qty" | "amount", value: string) => void;
}) {
  return (
    <>
      <div className="est-tree-node clickable" onClick={onToggle} role="button" tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onToggle();
        }}
        aria-expanded={open}
      >
        <span>
          <b className="twisty">{open ? "−" : "+"}</b> ▣ {label}{" "}
          <span className="sub">qty {eq.qty}</span>
        </span>
        <span className="tot">{eq.qty}</span>
        <span className="tot">{fmt(total, 0)}</span>
      </div>
      {!open && null}
      {open && (
        <div className="est-tree-head">
          <span />
          <span className="r">Qty</span>
          <span className="r">Amount BHD</span>
        </div>
      )}
      {open && rows.map((r) => (
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
                onChange={(e) => onEdit(r.component, "qty", e.target.value)}
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
                onChange={(e) => onEdit(r.component, "amount", e.target.value)}
                placeholder="—"
                inputMode="decimal"
                aria-label={`${r.component} amount`}
              />
            )}
          </div>
        </div>
      ))}
      {open && (
        <div className="est-tree-foot">
          <span className="lbl">{label.split(" - ")[0]} total</span>
          <span className="val" />
          <span className="val">{fmt(total, 0)}</span>
        </div>
      )}
    </>
  );
}

function Kpi({ k, v, n }: { k: string; v: string; n: string }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      <div className="n">{n}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="small dim" style={{ width: 180 }}>
        {k}
      </td>
      <td className="small">{v}</td>
    </tr>
  );
}
