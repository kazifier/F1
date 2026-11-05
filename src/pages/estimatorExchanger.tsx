// ---------------------------------------------------------------------------
// Heat exchanger screens for the estimating wizard:
//   ExchangerBasis  — step 3 design basis (TEMA type, duty, tube geometry)
//   ExchangerSheet  — step 4 generated part sheet with weights and welds
//   ExchangerDetails — step 6 design check (TEMA / ASME) and cost summary
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { fmt, money, useStore } from "../lib/store";
import { buildEquipmentBom, rollupCost } from "../lib/bom";
import { exchangerComponents } from "../lib/exchangerParts";
import { designExchanger, flangeClass } from "../lib/tema";
import type { Equipment } from "../lib/types";

const isHe = (e: Equipment) => /exchanger/i.test(e.type);

export const TEMA_TYPES = [
  "AES", "AET", "AEU", "BEM", "BEU", "BES", "BKU", "CES", "CEU", "CEN",
  "NEN", "NKN", "AEP", "BEP", "CFU", "AKT", "BET",
];

/** TEMA designation explained: front head / shell / rear head */
export function temaMeaning(tema: string) {
  const front: Record<string, string> = {
    A: "removable channel + flanged cover",
    B: "removable bonnet",
    C: "channel integral with tubesheet",
    N: "fixed channel, non-removable",
    D: "special high-pressure closure",
  };
  const shell: Record<string, string> = {
    E: "one-pass shell",
    F: "two-pass shell with longitudinal baffle",
    G: "split flow",
    H: "double split flow",
    J: "divided flow",
    K: "kettle / reboiler",
    X: "cross flow",
  };
  const rear: Record<string, string> = {
    M: "fixed tubesheet",
    N: "fixed tubesheet with packed joint",
    U: "U-tube bundle",
    S: "floating head with packed stuffing box",
    T: "floating head with pull-through bundle",
    P: "outside-packed floating head",
    W: "externally sealed floating tubesheet",
  };
  const [f, s, r] = tema.toUpperCase().split("");
  return `${front[f] ?? "front head"} / ${shell[s] ?? "shell"} / ${rear[r] ?? "rear head"}`;
}

/* ------------------------------------------------------------------ step 3 */
export function ExchangerBasis({ eq }: { eq: Equipment }) {
  const setHeSpec = useStore((s) => s.setHeSpec);
  const spec = eq.he;
  if (!spec) return null;
  const design = designExchanger(spec);
  const upd = (patch: Partial<typeof spec>) => setHeSpec(eq.id, patch);

  const num = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    unit = "",
    step = 1,
    width = 96,
  ) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 10, color: "#444" }}>
      <span>
        {label}
        {unit ? ` (${unit})` : ""}
      </span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width, padding: "2px 4px", border: "1px solid #9a9a9a", fontSize: 11 }}
      />
    </label>
  );

  const sel = (label: string, value: string, options: string[], onChange: (v: string) => void) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 10, color: "#444" }}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "2px 4px", border: "1px solid #9a9a9a", fontSize: 11 }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div style={{ padding: "0 10px 22px" }}>
      <div style={{ fontWeight: 700, color: "#8b0000", margin: "6px 0", fontSize: 11 }}>
        Heat exchanger design basis — {eq.tag} {eq.name}
      </div>
      <div className="lg-note" style={{ marginBottom: 8 }}>
        TEMA {spec.tema} · {temaMeaning(spec.tema)}. Sizing is by TEMA 9th edition and ASME VIII
        Div. 1: shell UG-27, heads UG-32(d), tube wall RCB-2.6, tubesheet RCB-7.2, baffles RG-7.11,
        bundle limit 20 t. Change a value and the sheet in step 4 recalculates.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {sel("TEMA type", spec.tema, TEMA_TYPES, (v) => upd({ tema: v }))}
        {
          sel(
            "Mechanical family",
            spec.kind ?? "shell-tube",
            ["shell-tube", "kettle", "bayonet", "fired-heater"],
            (v) => upd({ kind: v as typeof spec.kind }),
          )
        }
        {num("Shells / unit", spec.shells, (v) => upd({ shells: Math.max(1, Math.round(v)) }), "no")}
        {num("Required surface", spec.surfaceM2, (v) => upd({ surfaceM2: Math.max(1, v) }), "m²", 10, 110)}
        {num("Tube OD", spec.tubeOd, (v) => upd({ tubeOd: v }), "mm", 0.05)}
        {num("Tube wall", spec.tubeThk, (v) => upd({ tubeThk: v }), "mm", 0.01)}
        {num("Pitch", spec.pitch, (v) => upd({ pitch: v }), "mm", 0.1)}
        {sel("Layout", spec.pattern, ["30", "45", "90"], (v) => upd({ pattern: v as typeof spec.pattern }))}
        {num("Tube length", spec.tubeLength, (v) => upd({ tubeLength: v }), "mm", 100, 104)}
        {num("Tube passes", spec.tubePasses, (v) => upd({ tubePasses: Math.max(1, Math.round(v)) }), "no", 1, 76)}
        {num("Shell passes", spec.shellPasses, (v) => upd({ shellPasses: Math.max(1, Math.round(v)) }), "no", 1, 76)}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {num("Shell design P", spec.shellPressure, (v) => upd({ shellPressure: v }), "kPa(g)", 10, 104)}
        {num("Shell design T", spec.shellTemp, (v) => upd({ shellTemp: v }), "°C", 5, 84)}
        {num("Tube design P", spec.tubePressure, (v) => upd({ tubePressure: v }), "kPa(g)", 10, 104)}
        {num("Tube design T", spec.tubeTemp, (v) => upd({ tubeTemp: v }), "°C", 5, 84)}
        {num("MDMT", spec.mdmt, (v) => upd({ mdmt: v }), "°C", 1, 76)}
        {num("Corrosion allowance", spec.ca, (v) => upd({ ca: v }), "mm", 0.5, 96)}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {sel("Shell material", spec.shellMat, ["SA-516 Gr.70", "SA-387 Gr.11 Cl.2", "SA-240 Gr.304", "SA-240 Gr.316L"], (v) => upd({ shellMat: v }))}
        {sel("Channel material", spec.channelMat, ["SA-105", "SA-516 Gr.70", "SA-387 Gr.11 Cl.2", "SA-182 F304"], (v) => upd({ channelMat: v }))}
        {sel("Tube material", spec.tubeMat, ["SA-179", "SA-213 T11", "SA-213 TP304L", "SA-213 TP316L"], (v) => upd({ tubeMat: v }))}
        {sel("Tubesheet material", spec.tubesheetMat, ["SA-516 Gr.70", "SA-387 Gr.11 Cl.2", "SA-240 Gr.304", "SA-182 F316L"], (v) => upd({ tubesheetMat: v }))}
        {sel("Insulation", spec.insulated ? "Yes" : "No", ["Yes", "No"], (v) => upd({ insulated: v === "Yes" }))}
      </div>

      <div className="lg-band" style={{ margin: "8px 0 4px" }}>
        <span>Design result — TEMA {design.spec.tema} · {flangeClass(Math.max(spec.shellPressure, spec.tubePressure))} joints</span>
        <span>{fmt(design.surfaceTotal, 0)} m²</span>
      </div>
      {design.kind === "fired-heater" && design.heater && (
        <div className="lg-note" style={{ color: "#8b0000" }}>
          Fired heater, not a TEMA tubesheet item: {design.heater.coilTubes} coil tubes at{" "}
          {design.heater.coilWall.toFixed(1)} mm wall, {Math.round(design.heater.dutyKW)} kW absorbed at{" "}
          {design.heater.flux} kW/m², {design.heater.burners} burner(s), Ø{design.heater.stackDia} mm stack —
          API 560 and ASME VIII-1 coil checks in step 6.
        </div>
      )}
      {design.kind === "kettle" && (
        <div className="lg-note" style={{ color: "#8b0000" }}>
          Kettle reboiler: the shell is enlarged to Ø{design.shellId} mm over the{" "}
          {Math.round(design.bundleDia)} mm bundle so vapour can disengage above the tube bundle.
        </div>
      )}
      {design.kind !== "fired-heater" && (
      <div className="lg-note">
        Shell ID {design.shellId} mm · {design.tubesTotal} tubes ({design.tubeCount} per shell ×{" "}
        {design.spec.shells}) · shell {design.shellThk} mm · channel {design.channelThk} mm · heads{" "}
        {design.headThk} mm · tubesheet {design.tubesheetThk} mm · {design.baffleCount} baffles at{" "}
        {design.baffleSpacing} mm c/c · bundle {fmt(design.weights.bundle, 0)} kg ·{" "}
        {fmt(design.weights.total * design.spec.shells, 0)} kg per unit
        {design.spec.shells > spec.shells && (
          <span style={{ color: "#8b0000" }}>
            {" "}
            — split into {design.spec.shells} shells to keep the bundle inside the 20 t pulling limit
          </span>
        )}
      </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ step 4 */
export function ExchangerSheet({ equipment, activeId }: { equipment: Equipment[]; activeId: string | null }) {
  const rates = useStore((s) => s.rates);
  const active = equipment.find((e) => e.id === activeId) ?? equipment.find(isHe);
  const rows = useMemo(() => {
    if (!active) return [];
    const design = active.he ? designExchanger(active.he) : null;
    const bom = buildEquipmentBom(active, rates);
    const byKey = new Map(bom.map((b) => [b.partKey, b]));
    return exchangerComponents(active, design ?? undefined).map((c) => ({
      ...c,
      amount: byKey.get(c.key)?.amount ?? 0,
    }));
  }, [active, rates]);

  if (!active) return <div className="lg-note">Load a heat exchanger first.</div>;
  const design = active.he ? designExchanger(active.he) : null;
  const totalW = rows.reduce((a, r) => a + r.weight, 0);
  const totalAmt = rows.reduce((a, r) => a + r.amount, 0);

  return (
    <div className="scroll-x" style={{ padding: "0 8px 18px" }}>
      <div className="lg-band" style={{ margin: "6px 0 4px" }}>
        <span>
          TEMA {design?.spec.tema} — {active.tag} {active.name} · {design?.tubeCount} tubes ×{" "}
          {design?.spec.shells} shell{design?.spec.shells === 1 ? "" : "s"} · {fmt(design?.surfaceTotal ?? 0, 0)} m²
        </span>
        <span>QTY {active.qty}</span>
      </div>
      <table className="lg-grid-table" style={{ minWidth: 900 }}>
        <thead>
          <tr>
            <th style={{ width: 30 }}>#</th>
            <th style={{ minWidth: 190 }}>Component</th>
            <th style={{ width: 64 }}>Qty</th>
            <th style={{ width: 54 }}>Unit</th>
            <th style={{ width: 76 }}>Thk (mm)</th>
            <th style={{ width: 96 }}>Weight (kg)</th>
            <th style={{ width: 84 }}>Weld (m)</th>
            <th style={{ minWidth: 220 }}>Material</th>
            <th style={{ width: 104 }}>Amount (BHD)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td className="num">{i + 1}</td>
              <td title={r.detail}>
                {r.label}
                {!r.derived && <span style={{ color: "#8b0000" }}> · input</span>}
              </td>
              <td className="num">{fmt(r.qty, 0)}</td>
              <td>{r.unit}</td>
              <td className="num">{r.thickness ? r.thickness.toFixed(1) : "—"}</td>
              <td className="num">{fmt(r.weight, 1)}</td>
              <td className="num">{r.weld ? fmt(r.weld, 1) : "—"}</td>
              <td>{r.material}</td>
              <td className="num">{money(r.amount)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700, background: "#eef3ee" }}>
            <td />
            <td>Total per unit</td>
            <td colSpan={3} />
            <td className="num">{fmt(totalW, 1)}</td>
            <td />
            <td />
            <td className="num">{money(totalAmt)}</td>
          </tr>
        </tbody>
      </table>
      <div className="lg-note">
        Quantities and thicknesses come from the TEMA / ASME design in step 3; every line keeps the
        clause that produced it (hover a row). Rows marked <b>input</b> (expansion joint, lifting lugs,
        test ring) are estimator inputs on the step 2 sheet.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ step 6 */
export function ExchangerDetails({ equipment }: { equipment: Equipment[] }) {
  const rates = useStore((s) => s.rates);
  const list = equipment.filter(isHe);
  if (!list.length) return null;
  return (
    <div className="est-panel" style={{ marginTop: 12 }}>
      <div className="est-panel-title">Heat exchangers — TEMA / ASME design check</div>
      <div className="est-panel-body">
        {list.map((eq) => {
          if (!eq.he) return null;
          const design = designExchanger(eq.he);
          const roll = rollupCost(eq, buildEquipmentBom(eq, rates), rates);
          return (
            <div key={eq.id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: "#8b0000" }}>
                {eq.tag} · {eq.name} — TEMA {design.spec.tema}
              </div>
              <table className="data" style={{ marginTop: 4 }}>
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>Code</th>
                    <th style={{ width: 150 }}>Item</th>
                    <th>Check</th>
                    <th style={{ width: 64 }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {design.checks.map((c) => (
                    <tr key={c.code + c.item}>
                      <td>{c.code}</td>
                      <td>{c.item}</td>
                      <td className="small">{c.detail}</td>
                      <td style={{ color: c.ok ? "#1c6b1c" : "#8b0000", fontWeight: 700 }}>
                        {c.ok ? "OK" : "REVIEW"}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3}>
                      <b>Price per unit</b> — {fmt(roll.weight, 0)} kg, {fmt(design.surfaceTotal, 0)} m²
                    </td>
                    <td style={{ fontWeight: 700 }}>{money(roll.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}