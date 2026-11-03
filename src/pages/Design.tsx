import { useMemo, useState } from "react";
import { useStore, fmt, fmtInt } from "../lib/store";
import { buildEquipmentBom, rollupCost } from "../lib/bom";
import { runDesign, nozzleNeckUG45, areaReinforcement } from "../lib/asme";
import { allowableStress, materialByName, pipeOd, pipeWall, yieldStress } from "../lib/catalog";
import VesselViewer3D, { type NozzleSpec } from "../components/VesselViewer3D";

const CODES = [
  ["ASME BPVC VIII Div.1", "UG-27 / UG-32 / UG-45 / UG-37 / UG-28 / UG-99 / UG-116", "Shell, head, nozzle neck, reinforcement, external pressure, hydrotest, stamping"],
  ["ASME BPVC II Part D", "Allowable stress & external pressure charts", "S, E, yield at design temperature; CS-2 / HA-1 curves"],
  ["ASME BPVC IX", "Welding & brazing qualifications", "WPS / PQR / WPQ for SMAW, GTAW, SAW; groove & fillet"],
  ["ASME BPVC V", "Non-destructive examination", "RT per Article 2, UT per Article 4, PT/MT per Art. 6/7"],
  ["ASME B16.5 / B16.47", "Pipe flanges & flanged fittings", "Rating selection — 150# to 2500#, RF/FF/RTJ"],
  ["ASME B36.10M / B36.19M", "Welded & seamless wrought pipe", "Nozzle neck schedules STD/XS/10S…XXS"],
  ["ASME B31.3", "Process piping", "Nozzle loads, branch connections outside vessel limit"],
  ["TEMA / ASME VIII Div.1 UHX", "Shell & tube heat exchangers", "Tubesheet when equipment type = Heat Exchanger"],
  ["IS 2825 / IBR 1950", "Indian pressure vessel & boiler regulations", "Statutory approval when equipment is in India"],
  ["API 650 / 620", "Atmospheric & low-pressure storage tanks", "When design pressure ≤ 17.2 kPa and tank type is storage"],
];

export default function DesignPage() {
  const { equipment, rates } = useStore();
  const [activeId, setActiveId] = useState<string | null>(equipment[0]?.id ?? null);
  const eq = equipment.find((e) => e.id === activeId) ?? equipment[0];

  const model = useMemo(() => {
    if (!eq) return null;
    const shell = eq.parts.shell?.[0] ?? {};
    const head = eq.parts.head?.[0] ?? {};
    const items = buildEquipmentBom(eq, rates);
    const cost = rollupCost(eq, items, rates);
    const insideDiameter = Number(shell.sh_id) || Number(head.hd_id) || 1000;
    const shellThk = Number(shell.sh_thk) || 10;
    const shellLength = Number(shell.sh_len) || 2000;
    const material = shell.sh_mat || head.hd_mat || "SA-516 Gr.70";
    const design = runDesign(
      {
        pressure: eq.designPressure,
        temperature: eq.designTemperature,
        externalPressure: 100,
        insideDiameter,
        material,
        ca: eq.corrosionAllowance,
        E: eq.jointEfficiency,
        headType: head.hd_type || eq.headType,
        shellLength,
      },
      cost.weight,
      39,
      0.1,
      shellThk,
    );
    const support = eq.parts.support?.[0] ?? {};
    const skirtHeight = support.su_skirt === "Yes" ? Number(support.su_skirtH) || 0 : 0;
    const saddles = support.su_saddle === "Yes" ? Number(support.su_saddleQty) || 2 : 0;
    const nozzles: NozzleSpec[] = (eq.parts.nozzle ?? [])
      .filter((r) => r.nz_size)
      .map((r, i, arr) => {
        const nps = r.nz_size;
        return {
          nps,
          od: pipeOd(nps) || 100,
          wall: Number(r.nz_pipeThk) || pipeWall(nps, r.nz_sch) || 6,
          position: 0.18 + (0.62 * i) / Math.max(1, arr.length - 1 || 1),
          angle: (i * 360) / Math.max(2, arr.length),
          projection: Number(r.nz_length) || 150,
        };
      });

    // UG-45 / UG-37 for each nozzle
    const shellReq = Math.max(design.shellCirc.required, design.shellLong.required);
    const nozzleChecks = (eq.parts.nozzle ?? []).map((r, i) => {
      const nps = r.nz_size || '2"';
      const sch = r.nz_sch || "40";
      const Snoz = allowableStress(materialByName(r.noz_pipeMat || material), eq.designTemperature);
      const ug45 = nozzleNeckUG45(
        eq.designPressure / 1000,
        nps,
        sch,
        Snoz,
        design.S,
        eq.jointEfficiency,
        eq.corrosionAllowance,
        shellReq,
        eq.radiography === "Full RT",
      );
      const od = ug45.od;
      const neckT = Number(r.nz_pipeThk) || ug45.scheduleThickness;
      const d = od - 2 * neckT;
      const reinf = areaReinforcement({
        d,
        shellT: shellThk,
        tr: Math.max(design.shellCirc.base, design.shellLong.base),
        E1: eq.jointEfficiency,
        F: 1,
        tn: neckT,
        trn: ug45.taBase,
        fr1: Math.min(Snoz / design.S, 1),
        fr2: Math.min(Snoz / design.S, 1),
        padWidth:
          r.nz_pad === "Yes" && Number(r.nz_padOd) > 0
            ? (Number(r.nz_padOd) - od) / 2
            : 0,
        padThk: r.nz_pad === "Yes" ? Number(r.nz_padThk) || 0 : 0,
        legShell: 8,
        legPad: 8,
      });
      return {
        mark: `N${i + 1}`,
        nps,
        sch,
        rating: r.nz_rating || "150#",
        type: r.nz_type || "Pipe",
        ug45,
        neckT,
        reinf,
        pad: r.nz_pad === "Yes",
      };
    });

    return { eq, shell, head, items, cost, insideDiameter, shellThk, shellLength, material, design, nozzles, skirtHeight, saddles, nozzleChecks, shellReq };
  }, [eq, rates]);

  if (!model) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="dim">Add an equipment in the estimating wizard to run the design check.</p>
          <a className="btn" href="#/estimator">Go to wizard</a>
        </div>
      </div>
    );
  }

  const { design, nozzleChecks } = model;
  const mdmtAllow = design.column;
  const isColumn = model.eq.type.toLowerCase().includes("column") || model.eq.type.toLowerCase().includes("tower");
  const Sa = allowableStress(materialByName(model.material), model.eq.designTemperature);
  const Sy = yieldStress(materialByName(model.material), model.eq.designTemperature);
  const mdmtImpactExempt = model.eq.mdmt > -29 && model.shellThk <= 25;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>ASME VIII Div.1 design &amp; 3D model</h2>
          <div className="sub">
            Code thickness, MAWP, external pressure, nozzle neck (UG-45), reinforcement (UG-37) and a
            wind/seismic column check — driven live by the equipment selected below. The 3D model is
            generated from the same geometry, not a static picture.
          </div>
        </div>
        <div className="actions">
          <div className="eq-tabs">
            {equipment.map((e) => (
              <button
                key={e.id}
                className={`eq-tab ${e.id === model.eq.id ? "active" : ""}`}
                onClick={() => setActiveId(e.id)}
              >
                <span className="t">{e.tag}</span>
                <span className="n">{e.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi k="Required shell thickness" v={`${fmt(design.shellGov, 2)} mm`} n={`incl. ${model.eq.corrosionAllowance} mm CA · selected ${fmt(model.shellThk, 1)} mm`} tone={model.shellThk >= design.shellGov ? "ok" : "bad"} />
        <Kpi k="MAWP (shell)" v={`${fmt(design.mawpShell * 1000, 0)} kPa`} n={`design ${model.eq.designPressure} kPa · ${fmt(design.mawpShell / design.input.pressure, 2)}× margin`} />
        <Kpi k="Hydrotest (UG-99b)" v={`${fmt(design.mawpHydro * 1000, 0)} kPa`} n={`1.3 × MAWP × Sₜ/S`} />
        <Kpi k="Allowable stress S" v={`${fmt(design.S, 1)} MPa`} n={`${model.material} @ ${model.eq.designTemperature}°C · Sᵧ ${fmt(Sy, 0)} MPa`} />
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Thickness calculations — UG-27 &amp; UG-32</h3>
          <span className="hint">
            {model.material} · P = {model.eq.designPressure} kPa(g) · T = {model.eq.designTemperature}°C ·
            E = {model.eq.jointEfficiency} · CA = {model.eq.corrosionAllowance} mm
          </span>
        </div>
        <div className="card-body tight scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th>Clause</th>
                <th>Formula</th>
                <th className="num">t base (mm)</th>
                <th className="num">+CA (mm)</th>
                <th className="num">Selected (mm)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <Row label="Shell — circumferential" clause="UG-27(c)(1)" formula={design.shellCirc.formula} base={design.shellCirc.base} req={design.shellCirc.required} sel={model.shellThk} />
              <Row label="Shell — longitudinal" clause="UG-27(c)(2)" formula={design.shellLong.formula} base={design.shellLong.base} req={design.shellLong.required} sel={model.shellThk} />
              <Row
                label={`Head — ${design.head.label}`}
                clause={design.head.clause}
                formula={design.head.formula}
                base={design.head.base}
                req={design.head.required}
                sel={Number(model.head.hd_nomThk) || 0}
              />
              <Row
                label="Nozzle neck — governing (UG-45)"
                clause="UG-45(b)"
                formula="t = min[ max(t_a, t_b1), t_b3 ]"
                base={Math.min(...nozzleChecks.map((n) => n.ug45.tUG45), Number.POSITIVE_INFINITY)}
                req={Math.min(...nozzleChecks.map((n) => n.ug45.tUG45), Number.POSITIVE_INFINITY)}
                sel={Math.min(...nozzleChecks.map((n) => n.neckT), Number.POSITIVE_INFINITY)}
              />
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head">
            <h3>External pressure — UG-28</h3>
            <span className="hint">elastic buckling, closed form</span>
          </div>
          <div className="card-body">
            <table className="data">
              <tbody>
                <tr><td>Dₒ / t</td><td className="num">{fmt(design.extPressure.ratio, 1)}</td></tr>
                <tr><td>L / Dₒ</td><td className="num">{fmt(design.extPressure.LDo, 2)}</td></tr>
                <tr><td>Factor A (= 0.125 / (Dₒ/t))</td><td className="num">{design.extPressure.A.toExponential(2)}</td></tr>
                <tr><td>Critical buckling pressure P_cr</td><td className="num">{fmt(design.extPressure.Pcr * 1000, 0)} kPa</td></tr>
                <tr><td>Allowable external pressure P_a (SF = 3)</td><td className="num"><b>{fmt(design.extPressure.Pa * 1000, 0)} kPa</b></td></tr>
                <tr><td>Limited by</td><td>{design.extPressure.limitedBy}</td></tr>
              </tbody>
            </table>
            <div className="callout mt12">
              Vacuum rating of this shell at the selected thickness is {fmt(design.extPressure.Pa * 1000, 0)} kPa.
              If the equipment sees full vacuum (101.3 kPa) and this number is lower, increase thickness or
              add stiffening rings — the stiffener rows in the shell part of the wizard feed this check.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>{isColumn ? "Column" : "Vessel"} structural check — wind &amp; seismic</h3>
            <span className="hint">screening per IS 875 / ASCE 7 combination</span>
          </div>
          <div className="card-body">
            {mdmtAllow && (
              <table className="data">
                <tbody>
                  <tr><td>Design wind pressure q (V = 39 m/s)</td><td className="num">{fmt(mdmtAllow.windPressure, 0)} N/m²</td></tr>
                  <tr><td>Wind shear at base</td><td className="num">{fmt(mdmtAllow.windForce, 1)} kN</td></tr>
                  <tr><td>Wind moment at base</td><td className="num">{fmt(mdmtAllow.windMoment, 0)} kNm</td></tr>
                  <tr><td>Seismic shear (Ah = 0.1)</td><td className="num">{fmt(mdmtAllow.seismicForce, 1)} kN</td></tr>
                  <tr><td>Governing moment</td><td className="num">{fmt(mdmtAllow.M, 0)} kNm ({mdmtAllow.governing})</td></tr>
                  <tr><td>Bending stress σ_b</td><td className="num">{fmt(mdmtAllow.sigmaB, 2)} MPa</td></tr>
                  <tr><td>Pressure stress σ_p + axial σ_a</td><td className="num">{fmt(mdmtAllow.sigmaP + mdmtAllow.sigmaA, 2)} MPa</td></tr>
                  <tr><td>Combined vs S·E</td><td className={`num ${mdmtAllow.ok ? "ok" : "bad"}`}><b>{fmt(mdmtAllow.total, 2)} / {fmt(mdmtAllow.allowable, 1)} MPa</b></td></tr>
                  <tr><td>Compressive (buckling) check</td><td className={`num ${mdmtAllow.compressOk ? "ok" : "bad"}`}>{fmt(mdmtAllow.compress, 2)} / {fmt(mdmtAllow.compressAllow, 1)} MPa</td></tr>
                </tbody>
              </table>
            )}
            <div className={`callout mt12 ${mdmtAllow?.ok ? "good" : "warn"}`}>
              {mdmtAllow?.ok
                ? "Combined longitudinal stress is within the allowable — shell thickness also satisfies the wind/seismic bending case."
                : "Combined stress exceeds S·E. A skirt or intermediate stiffener ring is required at the base, or increase the lower course thickness."}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Nozzle schedule — UG-45 neck &amp; UG-37 reinforcement</h3>
          <span className="hint">S = {fmt(Sa, 1)} MPa · t_shell,required = {fmt(model.shellReq, 2)} mm</span>
        </div>
        <div className="card-body tight scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Mark</th><th>Size</th><th>Sch</th><th>Rating</th><th className="num">OD (mm)</th>
                <th className="num">Sch wall</th><th className="num">t_a</th><th className="num">t_b1</th>
                <th className="num">t_b3</th><th className="num">t UG-45</th><th className="num">Provided</th>
                <th>UG-45</th><th className="num">A req (mm²)</th><th className="num">A avail (mm²)</th><th>UG-37</th>
              </tr>
            </thead>
            <tbody>
              {nozzleChecks.map((nz) => (
                <tr key={nz.mark}>
                  <td className="mono">{nz.mark}</td>
                  <td className="mono">{nz.nps}</td>
                  <td className="mono">{nz.sch}</td>
                  <td>{nz.rating}</td>
                  <td className="num">{fmt(nz.ug45.od, 1)}</td>
                  <td className="num">{fmt(nz.ug45.scheduleThickness, 2)}</td>
                  <td className="num">{fmt(nz.ug45.ta, 2)}</td>
                  <td className="num">{fmt(nz.ug45.tb1, 2)}</td>
                  <td className="num">{fmt(nz.ug45.tb3, 2)}</td>
                  <td className="num">{fmt(nz.ug45.tUG45, 2)}</td>
                  <td className="num">{fmt(nz.neckT, 2)}</td>
                  <td className={nz.neckT >= nz.ug45.tUG45 ? "ok" : "bad"}>
                    {nz.neckT >= nz.ug45.tUG45 ? "OK" : "Thin"}
                  </td>
                  <td className="num">{fmt(nz.reinf.A, 1)}</td>
                  <td className="num">{fmt(nz.reinf.available, 1)}</td>
                  <td className={nz.reinf.adequate ? "ok" : "bad"}>
                    {nz.reinf.adequate ? "OK" : nz.pad ? "Increase pad" : "Add pad"}
                  </td>
                </tr>
              ))}
              {nozzleChecks.length === 0 && (
                <tr><td colSpan={15} className="dim">No nozzles defined — add them in the wizard, step 4.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>3D view</h3>
          <span className="hint">
            Ø{fmt(model.insideDiameter, 0)} ID × {fmt(model.shellLength, 0)} T/T · {model.nozzles.length} nozzles ·{" "}
            {model.skirtHeight > 0 ? "skirt" : model.saddles > 0 ? `${model.saddles} saddle` : "no support"}
          </span>
        </div>
        <div className="card-body tight" style={{ height: 520 }}>
          <VesselViewer3D
            shellId={model.insideDiameter}
            shellThk={model.shellThk}
            shellLength={model.shellLength}
            headType={model.head.hd_type || model.eq.headType}
            orientation={model.skirtHeight > 0 || model.eq.type.toLowerCase().includes("column") ? "Vertical" : "Horizontal"}
            nozzles={model.nozzles}
            skirtHeight={model.skirtHeight}
            saddles={model.skirtHeight > 0 ? 0 : model.saddles}
            ladder={(model.eq.parts.ladder ?? []).some((r) => Number(r.ld_monkey) > 0)}
          />
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head">
            <h3>Manufacturing &amp; inspection notes</h3>
          </div>
          <div className="card-body">
            <ul className="notes small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
              <li>
                Joint efficiency E = {model.eq.jointEfficiency} — Type 1 double-welded butt joint with{" "}
                {model.eq.radiography} per UW-11 / UW-12.
              </li>
              <li>
                PWHT: {model.eq.pWHT === "Yes" ? "required (UCS-56) — furnace charge per equipment, include thermocouple survey" : "not required provided thickness & service temperature stay inside UCS-56 exemptions"}.
              </li>
              <li>
                MDMT {model.eq.mdmt}°C — {mdmtImpactExempt ? "impact testing of UCS-66 curve D is exempt for this thickness/material combination." : "impact testing required per UCS-66; specify Charpy V-notch at MDMT."}
              </li>
              <li>
                Hydrotest at {fmt(design.mawpHydro * 1000, 0)} kPa gauge per UG-99(b), hold 30 min minimum, water at ambient; apply corrosion allowance consideration per UG-99(b) note.
              </li>
              <li>
                Plate forming: heads dished to UG-32 tolerance with fibre elongation {
                  model.head.hd_type === "Hemispherical" ? "≈ 12% (hot formed)" :
                  model.head.hd_type === "Flat (UG-34)" ? "not applicable" :
                  model.head.hd_type === "Torispherical (F&D)" ? "≈ 5-6%" : "≈ 8%"
                }; shell roundness within UG-80, D/t = {fmt(model.insideDiameter / model.shellThk, 1)}.
              </li>
              <li>
                Welded nozzle reinforcement pad fillet leg 8 mm min, full penetration for category D at skirt / support attachment.
              </li>
              <li>
                Insulation {model.eq.insulationThk} mm — cladding over CUI coating at support and nozzle interfaces per API 583.
              </li>
            </ul>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Applicable codes</h3>
            <span className="hint">design &amp; manufacturing basis</span>
          </div>
          <div className="card-body tight scroll-y" style={{ maxHeight: 380 }}>
            <table className="data">
              <thead>
                <tr><th>Code</th><th>Section / part</th><th>Used for</th></tr>
              </thead>
              <tbody>
                {CODES.map((c) => (
                  <tr key={c[0]}>
                    <td className="nowrap">{c[0]}</td>
                    <td className="small dim">{c[1]}</td>
                    <td className="small">{c[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="callout warn mt16">
        <b>Engineering caveat.</b> These are estimating-grade calculations: external-pressure results use a
        closed-form elastic buckling solution rather than the full ASME II-D chart interpolation, and the
        structural check ignores local load (WRC 107 / 297) and piping flexibility. Every vessel must be
        re-analysed and stamped by the holder of the ASME "U" certificate before fabrication. Total erected
        weight used in the wind check is {fmtInt(model.cost.weight)} kg.
      </div>
    </>
  );
}

function Row({ label, clause, formula, base, req, sel }: { label: string; clause: string; formula: string; base: number; req: number; sel: number }) {
  const ok = sel > 0 && sel >= req;
  return (
    <tr>
      <td>{label}</td>
      <td className="mono small nowrap">{clause}</td>
      <td className="mono tiny dim" style={{ maxWidth: 320 }}>{formula}</td>
      <td className="num">{Number.isFinite(base) ? fmt(base, 2) : "-"}</td>
      <td className="num"><b>{Number.isFinite(req) ? fmt(req, 2) : "-"}</b></td>
      <td className="num">{sel > 0 ? fmt(sel, 2) : "-"}</td>
      <td>
        <span className={`pill ${ok ? "ok" : "bad"}`}>{ok ? "adequate" : "under"}</span>
      </td>
    </tr>
  );
}

function Kpi({ k, v, n, tone }: { k: string; v: string; n?: string; tone?: "ok" | "bad" }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className={`v ${tone ?? ""}`}>{v}</div>
      {n && <div className="n">{n}</div>}
    </div>
  );
}
