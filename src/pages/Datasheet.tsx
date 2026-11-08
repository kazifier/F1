import { useMemo, useState } from "react";
import { useStore, fmt } from "../lib/store";
import { runDesign, nozzleNeckUG45, areaReinforcement } from "../lib/asme";
import {
  MATERIALS, HEAD_TYPES, NPS_LIST, SCHEDULE_LIST, materialByName, allowableStress,
  pipeOd, pipeWall, flangeMass, flangeThk, flangeOd,
} from "../lib/catalog";
import type { NozzleInput } from "../lib/types";
import { defaultExchangerNozzles, designExchanger } from "../lib/tema";
import { exportCsv, pipeMass, plateMass } from "../lib/bom";
import { PROJECT_UNITS, parseNozzles, isManway } from "../data/units";

interface Sheet {
  tag: string;
  description: string;
  orientation: string;
  shellId: number;
  shellThk: number;
  shellLength: number;
  headThk: number;
  headType: string;
  designPressure: number;
  designTemperature: number;
  externalPressure: number;
  material: string;
  ca: number;
  E: number;
  windSpeed: number;
  seismic: number;
  radiography: string;
}

const blank: Sheet = {
  tag: "10-V-101",
  description: "New pressure vessel",
  orientation: "Vertical",
  shellId: 1800,
  shellThk: 14,
  shellLength: 4200,
  headThk: 14,
  headType: "2:1 Ellipsoidal",
  designPressure: 1000,
  designTemperature: 150,
  externalPressure: 100,
  material: "SA-516 Gr.70",
  ca: 3,
  E: 0.85,
  windSpeed: 39,
  seismic: 0.1,
  radiography: "Spot RT",
};

interface ManwayRow {
  id: string;
  mark: string;
  nps: string;
  rating: string;
  /** neck projection, mm */
  projection: number;
}

const blankManway = (i: number): ManwayRow => ({
  id: `mw-${Date.now()}-${i}`,
  mark: `M${i}`,
  nps: '20"',
  rating: "150#",
  projection: 250,
});

/** "24 x 20" / "20" → 20" */
const toNps = (raw: string): string => {
  const sized = raw.split(/[x×]/)[0].trim();
  if (!/^\d/.test(sized)) return "";
  return `${sized.replace(/^(\d+)\.5$/, "$1.1/2").replace(/^(\d+)\.25$/, "$1/4")}"`;
};

const blankNozzle = (i: number): NozzleInput => ({
  id: `nz-${Date.now()}-${i}`,
  mark: `N${i}`,
  nps: '4"',
  schedule: "40",
  type: "Pipe",
  cladding: "No",
  projection: 150,
  padThickness: 0,
  padOd: 0,
  corrodedNeck: 0,
  repad: "No",
});

export default function DatasheetPage() {
  const { equipment } = useStore();
  const [sheet, setSheet] = useState<Sheet>(blank);
  const [nozzles, setNozzles] = useState<NozzleInput[]>([
    { ...blankNozzle(1), mark: "N1", nps: '8"', schedule: "40", repad: "Yes", padThickness: 14, padOd: 320 },
    { ...blankNozzle(2), mark: "N2", nps: '6"', schedule: "40", repad: "Yes", padThickness: 14, padOd: 260 },
    { ...blankNozzle(3), mark: "N3", nps: '2"', schedule: "80", repad: "No" },
  ]);
  const [manways, setManways] = useState<ManwayRow[]>([blankManway(1)]);
  const [sourceId, setSourceId] = useState("");

  const loadFrom = (id: string) => {
    const eq = equipment.find((e) => e.id === id);
    setSourceId(id);
    if (!eq) return;
    // an exchanger carries its geometry in the TEMA design, not in part rows
    if (eq.he) {
      const d = designExchanger(eq.he);
      setSheet({
        tag: eq.tag,
        description: eq.name,
        orientation: d.shellId > 0 && eq.he.tubeLength > 10000 ? "Vertical" : "Horizontal",
        shellId: d.shellId,
        shellThk: d.shellThk,
        shellLength: eq.he.tubeLength,
        headThk: d.headThk,
        headType: "2:1 Ellipsoidal",
        designPressure: eq.he.shellPressure,
        designTemperature: eq.he.shellTemp,
        externalPressure: 100,
        material: eq.he.shellMat,
        ca: eq.he.ca,
        E: 1,
        windSpeed: 39,
        seismic: 0.1,
        radiography: "Full RT",
      });
      setNozzles(
        (eq.heNozzles ?? defaultExchangerNozzles(eq.he, d)).map((n, i) => ({
          id: `nz-${eq.id}-${n.mark}-${i}`,
          mark: n.mark,
          nps: n.nps,
          schedule: "40",
          type: "Pipe",
          cladding: "No",
          projection: 200,
          padThickness: 0,
          padOd: 0,
          corrodedNeck: 0,
          repad: "No",
        })),
      );
      setManways([]);
      return;
    }
    const sh = eq.parts.shell?.[0] ?? {};
    const hd = eq.parts.head?.[0] ?? {};
    setSheet({
      tag: eq.tag,
      description: eq.name,
      orientation: (eq.parts.support ?? []).some((r) => r.su_skirt === "Yes") ? "Vertical" : "Horizontal",
      shellId: Number(sh.sh_id) || 1500,
      shellThk: Number(sh.sh_thk) || 12,
      shellLength: Number(sh.sh_len) || 3000,
      headThk: Number(hd.hd_nomThk) || 12,
      headType: hd.hd_type || eq.headType,
      designPressure: eq.designPressure,
      designTemperature: eq.designTemperature,
      externalPressure: 100,
      material: sh.sh_mat || "SA-516 Gr.70",
      ca: eq.corrosionAllowance,
      E: eq.jointEfficiency,
      windSpeed: 39,
      seismic: 0.1,
      radiography: eq.radiography,
    });
    setNozzles(
      (eq.parts.nozzle ?? [])
        .filter((r) => r.nz_size)
        .map((r, i) => ({
          id: `nz-${eq.id}-${i}`,
          mark: `N${i + 1}`,
          nps: r.nz_size,
          schedule: r.nz_sch || "40",
          type: r.nz_type || "Pipe",
          cladding: r.nz_cladd || "No",
          projection: Number(r.nz_length) || 150,
          padThickness: r.nz_pad === "Yes" ? Number(r.nz_padThk) || 0 : 0,
          padOd: r.nz_pad === "Yes" ? Number(r.nz_padOd) || 0 : 0,
          corrodedNeck: Number(r.nz_pipeThk) || 0,
          repad: r.nz_pad === "Yes" ? "Yes" : "No",
        })),
    );

    // every manway on the vessel: part rows first, then the datasheet register
    const mwRows: ManwayRow[] = (eq.parts.manway ?? [])
      .filter((r) => r.mw_size)
      .map((r, i) => ({
        id: `mw-${eq.id}-${i}`,
        mark: `M${i + 1}`,
        nps: String(r.mw_size),
        rating: String(r.mw_rating || "150#"),
        projection: 250,
      }));
    if (mwRows.length === 0) {
      const register = PROJECT_UNITS.find((u) => u.tag === eq.tag);
      (register ? parseNozzles(register.nozzles) : [])
        .filter((n) => isManway(n) && /^\d/.test(n.size))
        .forEach((n, i) => {
          const nps = toNps(n.size);
          if (nps) mwRows.push({ id: `mw-${eq.id}-r${i}`, mark: n.mark, nps, rating: "150#", projection: 250 });
        });
    }
    setManways(mwRows);
  };

  const design = useMemo(
    () =>
      runDesign(
        {
          pressure: sheet.designPressure,
          temperature: sheet.designTemperature,
          externalPressure: sheet.externalPressure,
          insideDiameter: sheet.shellId,
          material: sheet.material,
          ca: sheet.ca,
          E: sheet.E,
          headType: sheet.headType,
          shellLength: sheet.shellLength,
        },
        0,
        sheet.windSpeed,
        sheet.seismic,
        sheet.shellThk,
      ),
    [sheet],
  );

  const shellRequired = Math.max(design.shellCirc.required, design.shellLong.required);
  const SnozAllowable = allowableStress(materialByName(sheet.material), sheet.designTemperature);

  const results = nozzles.map((nz) => {
    const od = pipeOd(nz.nps) || 60.3;
    const schWall = pipeWall(nz.nps, nz.schedule);
    const provided = nz.corrodedNeck || schWall;
    const ug45 = nozzleNeckUG45(
      sheet.designPressure / 1000,
      nz.nps,
      nz.schedule,
      SnozAllowable,
      design.S,
      sheet.E,
      sheet.ca,
      shellRequired,
      sheet.radiography === "Full RT",
    );
    const innerD = od - 2 * provided;
    const padWidth = nz.repad === "Yes" && nz.padOd > 0 ? (nz.padOd - od) / 2 : 0;
    const reinf = areaReinforcement({
      d: innerD,
      shellT: sheet.shellThk,
      tr: Math.max(design.shellCirc.base, design.shellLong.base),
      E1: sheet.E,
      F: 1,
      tn: provided,
      trn: ug45.taBase,
      fr1: 1,
      fr2: 1,
      padWidth,
      padThk: nz.repad === "Yes" ? nz.padThickness : 0,
      legShell: 8,
      legPad: nz.repad === "Yes" ? 8 : 0,
    });
    // the same joint with no pad: if it already covers A it is self-reinforced
    const bare = areaReinforcement({
      d: innerD,
      shellT: sheet.shellThk,
      tr: Math.max(design.shellCirc.base, design.shellLong.base),
      E1: sheet.E,
      F: 1,
      tn: provided,
      trn: ug45.taBase,
      fr1: 1,
      fr2: 1,
      padWidth: 0,
      padThk: 0,
      legShell: 8,
      legPad: 0,
    });
    const srn = bare.adequate;
    const pipeNeckKg = pipeMass(od, provided, nz.projection || 150, "SA-106 Gr.B");
    const fThk = flangeThk(nz.nps, "150");
    const flangeKg = flangeMass(nz.nps, "150");
    const padKg =
      nz.repad === "Yes" && nz.padOd > 0 && nz.padThickness > 0
        ? plateMass((Math.PI / 4) * (Math.pow(nz.padOd / 1000, 2) - Math.pow(od / 1000, 2)), nz.padThickness, "SA-516 Gr.70")
        : 0;
    // SRN: one forging from the shell/head outside surface to the RF face —
    // height = projection + flange thickness, neck at the governing UG-45 wall
    const height = (nz.projection || 150) + fThk;
    const neckThk = Math.max(ug45.tUG45, provided);
    const forgedNeckKg = pipeMass(od, neckThk, Math.max(height - fThk, 0), "SA-106 Gr.B");
    const flangeOuter =
      flangeOd(nz.nps, "150") ||
      (flangeKg > 0 && fThk > 0
        ? Math.sqrt((4 * flangeKg) / (Math.PI * 7850 * (fThk / 1000)) + Math.pow(Math.max(od - 2 * provided, 1) / 1000, 2)) * 1000
        : od + 60);
    return {
      nz, od, schWall, provided, ug45, reinf, innerD, bare, srn,
      height, neckThk, flangeOd: flangeOuter, fThk,
      weight: srn ? flangeKg + forgedNeckKg * 1.08 : pipeNeckKg + flangeKg + padKg,
    };
  });

  // every manway is checked on the same basis as a nozzle, with a blind cover
  // and a plate (rolled) neck rather than a pipe schedule
  const manwayResults = manways.map((mw) => {
    const od = pipeOd(mw.nps) || 508;
    const wall = Math.max(10, sheet.shellThk);
    const ug45 = nozzleNeckUG45(
      sheet.designPressure / 1000,
      mw.nps,
      "40",
      SnozAllowable,
      design.S,
      sheet.E,
      sheet.ca,
      shellRequired,
      sheet.radiography === "Full RT",
    );
    const innerD = od - 2 * wall + 2 * sheet.ca;
    const reinf = areaReinforcement({
      d: innerD,
      shellT: sheet.shellThk,
      tr: Math.max(design.shellCirc.base, design.shellLong.base),
      E1: sheet.E,
      F: 1,
      tn: wall,
      trn: ug45.taBase,
      fr1: 1,
      fr2: 1,
      padWidth: 0,
      padThk: 0,
      legShell: 8,
      legPad: 0,
    });
    const coverKg = flangeMass(mw.nps, mw.rating.replace("#", "")) || flangeMass(mw.nps, "150");
    return {
      mw,
      od,
      wall,
      flangeThk: flangeThk(mw.nps, mw.rating.replace("#", "")) || flangeThk(mw.nps, "150"),
      ug45,
      reinf,
      srn: reinf.adequate,
      weight: pipeMass(od, wall, mw.projection, "SA-106 Gr.B") + coverKg * 2,
    };
  });

  const srnNozzles = results.filter((r) => r.srn);
  const srnWeight = [...results, ...manwayResults].reduce((a, r) => a + (r.srn ? r.weight : 0), 0);

  const anyFail =
    sheet.shellThk < shellRequired ||
    sheet.headThk < design.head.required ||
    results.some((r) => r.provided < r.ug45.tUG45 || !r.reinf.adequate) ||
    manwayResults.some((r) => r.wall < r.ug45.tUG45 || !r.reinf.adequate);

  const set = <K extends keyof Sheet>(k: K, v: Sheet[K]) => setSheet((s) => ({ ...s, [k]: v }));

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Datasheet check — thickness &amp; nozzles</h2>
          <div className="sub">
            Enter the mechanical datasheet exactly as received from the process/mechanical engineer. The sheet
            returns the code thicknesses (UG-27 / UG-32), minimum nozzle neck (UG-45) and whether each opening
            is adequately reinforced (UG-37) — including where a pad is genuinely redundant.
          </div>
        </div>
        <div className="actions">
          <select value={sourceId} onChange={(e) => loadFrom(e.target.value)} className="btn" style={{ minWidth: 220 }}>
            <option value="">Load from wizard equipment…</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.tag} — {e.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={() =>
              exportCsv(
                [
                  ...results.map((r) => ({
                    Item: `Nozzle ${r.nz.mark}`,
                    Size: r.nz.nps,
                    Schedule: r.nz.schedule,
                    "OD (mm)": r.od.toFixed(1),
                    "t UG-45 req": r.ug45.tUG45.toFixed(2),
                    "t provided": r.provided.toFixed(2),
                    "UG-45": r.provided >= r.ug45.tUG45 ? "OK" : "THIN",
                    "A required": r.reinf.A.toFixed(0),
                    "A available": r.reinf.available.toFixed(0),
                    "UG-37": r.reinf.adequate ? "OK" : "REINFORCE",
                    "SRN": r.srn ? "Yes — one-piece forging" : "No — pad required",
                    "H to RF (mm)": r.srn ? r.height.toFixed(0) : "",
                    "Flange OD x thk": `${r.flangeOd.toFixed(0)} x ${r.fThk.toFixed(1)}`,
                    "Weight (kg)": r.weight.toFixed(1),
                  })),
                  ...manwayResults.map((r) => ({
                    Item: `Manway ${r.mw.mark}`,
                    Size: r.mw.nps,
                    Schedule: `plate ${r.wall.toFixed(0)}`,
                    "OD (mm)": r.od.toFixed(1),
                    "t UG-45 req": r.ug45.tUG45.toFixed(2),
                    "t provided": r.wall.toFixed(2),
                    "UG-45": r.wall >= r.ug45.tUG45 ? "OK" : "THIN",
                    "A required": r.reinf.A.toFixed(0),
                    "A available": r.reinf.available.toFixed(0),
                    "UG-37": r.reinf.adequate ? "OK" : "REINFORCE",
                    "SRN": r.srn ? "Yes — self-reinforced" : "No — pad required",
                    "Weight (kg)": r.weight.toFixed(1),
                  })),
                  { Item: "Shell", "t required": shellRequired.toFixed(2), "t provided": sheet.shellThk },
                  { Item: "Head", "t required": design.head.required.toFixed(2), "t provided": sheet.headThk },
                ],
                `datasheet-check-${sheet.tag}.csv`,
              )
            }
          >
            Export check sheet
          </button>
        </div>
      </div>

      <div className={`callout ${anyFail ? "bad" : "good"}`} style={{ marginBottom: 14 }}>
        <b>{anyFail ? "Not compliant as entered." : "Compliant as entered."}</b>{" "}
        {anyFail
          ? "At least one component is below the code-required thickness or under-reinforced — see the red rows below and increase thickness / pad before release to fabrication."
          : "Shell, head and every nozzle meet the ASME VIII Div.1 minimum thickness and area-replacement requirements for this design basis."}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Datasheet header</h3>
          <span className="hint">all lengths mm · pressure kPa(g)</span>
        </div>
        <div className="card-body">
          <div className="grid g4">
            <Field label="Tag No.">
              <input value={sheet.tag} onChange={(e) => set("tag", e.target.value)} />
            </Field>
            <Field label="Description">
              <input value={sheet.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <Field label="Orientation">
              <select value={sheet.orientation} onChange={(e) => set("orientation", e.target.value)}>
                <option>Vertical</option>
                <option>Horizontal</option>
              </select>
            </Field>
            <Field label="Material">
              <select value={sheet.material} onChange={(e) => set("material", e.target.value)}>
                {MATERIALS.map((m) => (
                  <option key={m.name}>{m.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Shell ID (mm)">
              <input type="number" value={sheet.shellId} onChange={(e) => set("shellId", Number(e.target.value))} />
            </Field>
            <Field label="Shell thickness (mm)">
              <input type="number" value={sheet.shellThk} onChange={(e) => set("shellThk", Number(e.target.value))} />
            </Field>
            <Field label="Tangent to tangent (mm)">
              <input type="number" value={sheet.shellLength} onChange={(e) => set("shellLength", Number(e.target.value))} />
            </Field>
            <Field label="Head thickness (mm)">
              <input type="number" value={sheet.headThk} onChange={(e) => set("headThk", Number(e.target.value))} />
            </Field>
            <Field label="Design pressure (kPa g)">
              <input type="number" value={sheet.designPressure} onChange={(e) => set("designPressure", Number(e.target.value))} />
            </Field>
            <Field label="Design temperature (°C)">
              <input type="number" value={sheet.designTemperature} onChange={(e) => set("designTemperature", Number(e.target.value))} />
            </Field>
            <Field label="External pressure (kPa g)">
              <input type="number" value={sheet.externalPressure} onChange={(e) => set("externalPressure", Number(e.target.value))} />
            </Field>
            <Field label="Corrosion allowance (mm)">
              <input type="number" value={sheet.ca} onChange={(e) => set("ca", Number(e.target.value))} />
            </Field>
            <Field label="Head type">
              <select value={sheet.headType} onChange={(e) => set("headType", e.target.value)}>
                {HEAD_TYPES.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </Field>
            <Field label="Joint efficiency E">
              <select value={String(sheet.E)} onChange={(e) => set("E", Number(e.target.value))}>
                <option value="1">1.00</option>
                <option value="0.85">0.85</option>
                <option value="0.7">0.70</option>
              </select>
            </Field>
            <Field label="Radiography">
              <select value={sheet.radiography} onChange={(e) => set("radiography", e.target.value)}>
                <option>Full RT</option>
                <option>Spot RT</option>
                <option>No RT</option>
              </select>
            </Field>
            <Field label="Wind speed (m/s)">
              <input type="number" value={sheet.windSpeed} onChange={(e) => set("windSpeed", Number(e.target.value))} />
            </Field>
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head"><h3>Shell &amp; head verdict</h3></div>
          <div className="card-body tight">
            <table className="data">
              <thead>
                <tr><th>Component</th><th>Clause</th><th className="num">Required</th><th className="num">Provided</th><th>Result</th></tr>
              </thead>
              <tbody>
                <VerdictRow label="Shell (circumferential)" clause="UG-27(c)(1)" req={design.shellCirc.required} provided={sheet.shellThk} />
                <VerdictRow label="Shell (longitudinal)" clause="UG-27(c)(2)" req={design.shellLong.required} provided={sheet.shellThk} />
                <VerdictRow label={`Head — ${sheet.headType}`} clause={design.head.clause} req={design.head.required} provided={sheet.headThk} />
                <tr>
                  <td>External pressure (vacuum) rating</td>
                  <td className="mono small">UG-28</td>
                  <td className="num">{fmt(sheet.externalPressure, 0)} kPa</td>
                  <td className="num">{fmt(design.extPressure.Pa * 1000, 0)} kPa</td>
                  <td className={design.extPressure.Pa * 1000 >= sheet.externalPressure ? "ok" : "bad"}>
                    {design.extPressure.Pa * 1000 >= sheet.externalPressure ? "OK" : "Stiffen"}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="card-body">
              <div className="formula mt8">t_shell = P·R/(S·E − 0.6P) = {fmt(sheet.designPressure / 1000, 3)} × {fmt(sheet.shellId / 2, 0)} / ({fmt(design.S, 1)} × {sheet.E} − 0.6 × {fmt(sheet.designPressure / 1000, 3)}) = {fmt(design.shellCirc.base, 2)} mm + CA {sheet.ca} = {fmt(design.shellCirc.required, 2)} mm</div>
              <div className="formula mt8">{design.head.formula} → {fmt(design.head.required, 2)} mm</div>
              <div className="small dim mt12">
                MAWP at provided thickness: {fmt(design.mawpShell * 1000, 0)} kPa · hydrotest{" "}
                {fmt(design.mawpHydro * 1000, 0)} kPa · D/t = {fmt(sheet.shellId / sheet.shellThk, 1)} · S ={" "}
                {fmt(design.S, 1)} MPa at {sheet.designTemperature}°C
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Structural screening</h3></div>
          <div className="card-body tight">
            {design.column && (
              <table className="data">
                <tbody>
                  <tr><td>Governing lateral moment</td><td className="num">{fmt(design.column.M, 0)} kNm ({design.column.governing})</td></tr>
                  <tr><td>Bending stress</td><td className="num">{fmt(design.column.sigmaB, 2)} MPa</td></tr>
                  <tr><td>Pressure + axial stress</td><td className="num">{fmt(design.column.sigmaP + design.column.sigmaA, 2)} MPa</td></tr>
                  <tr><td>Allowable S·E</td><td className="num">{fmt(design.column.allowable, 1)} MPa</td></tr>
                  <tr><td>Utilisation</td><td className="num">{fmt(design.column.ratio * 100, 1)} %</td></tr>
                  <tr>
                    <td>Result</td>
                    <td className={design.column.ok ? "ok" : "bad"}>{design.column.ok ? "OK" : "Overstressed"}</td>
                  </tr>
                </tbody>
              </table>
            )}
            <div className="card-body">
              <div className="callout small">
                Wind pressure {fmt(design.column?.windPressure ?? 0, 0)} N/m² for V = {sheet.windSpeed} m/s;
                seismic coefficient Ah = {sheet.seismic}. Skirt/leg design and anchor bolt sizing are outside
                this screening — see the column check on screen 02.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Nozzle schedule — UG-45 &amp; UG-37</h3>
          <div className="row">
            <span className="hint">
              {srnNozzles.length} of {results.length} nozzles are one-piece forgings (SRN) · {fmt(srnWeight, 0)} kg
            </span>
            <button className="btn btn-sm" onClick={() => setNozzles((n) => [...n, blankNozzle(n.length + 1)])}>
              + nozzle
            </button>
          </div>
        </div>
        <div className="card-body tight scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Mark</th><th>Size</th><th>Sch</th><th>Type</th><th className="num">OD</th>
                <th className="num">Sch wall</th><th className="num">Neck as-supplied</th>
                <th>RF Pad</th><th className="num">Pad thk</th><th className="num">Pad OD</th>
                <th className="num">H to RF</th><th className="num">Flange Ø×thk</th>
                <th className="num">t UG-45</th><th>UG-45</th>
                <th className="num">A req</th><th className="num">A avail</th><th>UG-37</th>
                <th>SRN</th><th className="num">Weight</th><th />
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.nz.id}>
                  <td>
                    <input style={{ width: 46 }} value={r.nz.mark} onChange={(e) => update(i, { mark: e.target.value })} />
                  </td>
                  <td>
                    <select value={r.nz.nps} onChange={(e) => update(i, { nps: e.target.value })}>
                      {NPS_LIST.map((n) => <option key={n}>{n}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={r.nz.schedule} onChange={(e) => update(i, { schedule: e.target.value })}>
                      {SCHEDULE_LIST.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    {r.srn ? (
                      <b className="small">Forged</b>
                    ) : (
                      <select value={r.nz.type} onChange={(e) => update(i, { type: e.target.value })}>
                        <option>Pipe</option>
                        <option>Forged</option>
                        <option>Rolled Plate Pipe</option>
                        <option>Coupling</option>
                      </select>
                    )}
                  </td>
                  <td className="num">{fmt(r.od, 1)}</td>
                  <td className="num">{fmt(r.schWall, 2)}</td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 74, textAlign: "right" }}
                      value={r.nz.corrodedNeck || ""}
                      placeholder={String(r.schWall)}
                      onChange={(e) => update(i, { corrodedNeck: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <select
                      value={r.nz.repad}
                      onChange={(e) => update(i, { repad: e.target.value, padThickness: e.target.value === "Yes" ? 14 : 0 })}
                    >
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                  </td>
                  <td>
                    <input type="number" style={{ width: 66, textAlign: "right" }} value={r.nz.padThickness} onChange={(e) => update(i, { padThickness: Number(e.target.value) })} />
                  </td>
                  <td>
                    <input type="number" style={{ width: 70, textAlign: "right" }} value={r.nz.padOd} onChange={(e) => update(i, { padOd: Number(e.target.value) })} />
                  </td>
                  <td className="num">{r.srn ? fmt(r.height, 0) : "-"}</td>
                  <td className="num">{fmt(r.flangeOd, 0)} × {fmt(r.fThk, 1)}</td>
                  <td className="num"><b>{fmt(r.ug45.tUG45, 2)}</b></td>
                  <td className={r.provided >= r.ug45.tUG45 ? "ok" : "bad"}>
                    {r.provided >= r.ug45.tUG45 ? `OK (+${fmt(r.provided - r.ug45.tUG45, 2)})` : `Thin ${fmt(r.ug45.tUG45 - r.provided, 2)}`}
                  </td>
                  <td className="num">{fmt(r.reinf.A, 0)}</td>
                  <td className="num">{fmt(r.reinf.available, 0)}</td>
                  <td className={r.reinf.adequate ? "ok" : "bad"}>
                    {r.reinf.adequate
                      ? `OK (+${fmt(r.reinf.available - r.reinf.A, 0)})`
                      : `Deficit ${fmt(r.reinf.deficit, 0)} mm²`}
                  </td>
                  <td>{r.srn ? <b className="ok">SRN · forged</b> : <span className="bad">pad</span>}</td>
                  <td className="num">{fmt(r.weight, 1)} kg</td>
                  <td>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => setNozzles((n) => n.filter((x) => x.id !== r.nz.id))}
                      title="Remove nozzle"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr><td colSpan={20} className="dim">No nozzles — press “+ nozzle”.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Manways — UG-45 &amp; UG-37</h3>
          <div className="row">
            <span className="hint">
              {manwayResults.length} manway{manwayResults.length === 1 ? "" : "s"} ·{" "}
              {fmt(manwayResults.reduce((a, r) => a + r.weight, 0), 0)} kg · plate neck on the shell thickness
            </span>
            <button className="btn btn-sm" onClick={() => setManways((m) => [...m, blankManway(m.length + 1)])}>
              + manway
            </button>
          </div>
        </div>
        <div className="card-body tight scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Mark</th><th>Size</th><th>Rating</th>
                <th className="num">Neck Ø</th><th className="num">Neck wall</th><th className="num">Cover thk</th>
                <th className="num">t UG-45</th><th>UG-45</th>
                <th className="num">A req</th><th className="num">A avail</th><th>UG-37</th>
                <th>SRN</th><th className="num">Weight</th><th />
              </tr>
            </thead>
            <tbody>
              {manwayResults.map((r, i) => (
                <tr key={r.mw.id}>
                  <td>
                    <input style={{ width: 46 }} value={r.mw.mark} onChange={(e) => updateManway(i, { mark: e.target.value })} />
                  </td>
                  <td>
                    <select value={r.mw.nps} onChange={(e) => updateManway(i, { nps: e.target.value })}>
                      {NPS_LIST.map((n) => <option key={n}>{n}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={r.mw.rating} onChange={(e) => updateManway(i, { rating: e.target.value })}>
                      {["150#", "300#", "600#", "900#", "1500#", "2500#"].map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </td>
                  <td className="num">{fmt(r.od, 1)}</td>
                  <td className="num">{fmt(r.wall, 1)}</td>
                  <td className="num">{fmt(r.flangeThk, 1)}</td>
                  <td className="num"><b>{fmt(r.ug45.tUG45, 2)}</b></td>
                  <td className={r.wall >= r.ug45.tUG45 ? "ok" : "bad"}>
                    {r.wall >= r.ug45.tUG45 ? `OK (+${fmt(r.wall - r.ug45.tUG45, 2)})` : `Thin ${fmt(r.ug45.tUG45 - r.wall, 2)}`}
                  </td>
                  <td className="num">{fmt(r.reinf.A, 0)}</td>
                  <td className="num">{fmt(r.reinf.available, 0)}</td>
                  <td className={r.reinf.adequate ? "ok" : "bad"}>
                    {r.reinf.adequate ? `OK (+${fmt(r.reinf.available - r.reinf.A, 0)})` : `Deficit ${fmt(r.reinf.deficit, 0)} mm²`}
                  </td>
                  <td>{r.srn ? <b className="ok">SRN</b> : <span className="bad">pad</span>}</td>
                  <td className="num">{fmt(r.weight, 1)} kg</td>
                  <td>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => setManways((m) => m.filter((x) => x.id !== r.mw.id))}
                      title="Remove manway"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {manwayResults.length === 0 && (
                <tr><td colSpan={14} className="dim">No manways — press “+ manway”.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head"><h3>How the check is applied</h3></div>
          <div className="card-body small" style={{ lineHeight: 1.8 }}>
            <p style={{ marginTop: 0 }}>
              <b>Local thin area (UG-37).</b> The metal removed by the opening, A = d·t_r·F, must be replaced
              by excess shell thickness, excess neck thickness, pad and weld metal. A1 uses the excess of the
              shell over the required thickness; A2 the excess of the nozzle neck within 2.5·t; A5 the pad
              within its radial width. If the numbers show a surplus with no pad, the pad is redundant — remove
              it and save the weld and NDT time.
            </p>
            <p>
              <b>Minimum neck (UG-45).</b> t = min[ max(t_a, t_b1), t_b3 ]: t_a from UG-27 on the neck, t_b1 =
              {" "}0.875·t_s for full RT (2.5·t_s where not), t_b3 = 6.22 mm up to NPS 6 and 9.53 mm from NPS 8.
              The schedule wall of a standard piped nozzle is frequently thicker than the code minimum — that
              is normal, not an error.
            </p>
            <p style={{ marginBottom: 0 }}>
              <b>Where the numbers are indicative.</b> External pressure uses the closed-form elastic
              buckling solution; local loads from piping (WRC 107 / 297), fatigue and MDMT impact testing are
              outside this sheet.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Datasheet flags</h3></div>
          <div className="card-body">
            <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.85 }}>
              <li className={sheet.shellThk - sheet.ca < 6 ? "warn" : ""}>
                Corroded shell thickness = {fmt(sheet.shellThk - sheet.ca, 1)} mm
                {sheet.shellThk - sheet.ca < 6 ? " — check minimum structural thickness and handling rigidity." : " — acceptable for handling and rolling."}
              </li>
              <li className={design.column && design.column.ratio > 0.9 ? "warn" : ""}>
                Structural utilisation {fmt((design.column?.ratio ?? 0) * 100, 0)}%
                {design.column && design.column.ratio > 0.9 ? " — close to the limit; verify with a detailed FEA or stiffener rings." : " — comfortable margin."}
              </li>
              <li>
                {results.filter((r) => r.reinf.adequate && r.nz.repad === "Yes").length} nozzle(s) carry an
                unnecessary reinforcement pad — confirm before releasing plate cutting.
              </li>
              <li>
                {sheet.radiography === "Full RT" ? "Full RT: E = 1.0 permitted, NDT cost is higher; confirm whether spot RT is acceptable to the client specification." : `${sheet.radiography}: E limited to ${sheet.E}; if full RT is later specified the thickness can usually be reduced.`}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );

  function update(i: number, patch: Partial<NozzleInput>) {
    setNozzles((n) => n.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function updateManway(i: number, patch: Partial<ManwayRow>) {
    setManways((m) => m.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function VerdictRow({ label, clause, req, provided }: { label: string; clause: string; req: number; provided: number }) {
  const ok = provided >= req;
  return (
    <tr>
      <td>{label}</td>
      <td className="mono small">{clause}</td>
      <td className="num"><b>{fmt(req, 2)}</b></td>
      <td className="num">{fmt(provided, 2)}</td>
      <td className={ok ? "ok" : "bad"}>{ok ? `OK (+${fmt(provided - req, 2)})` : `Under by ${fmt(req - provided, 2)}`}</td>
    </tr>
  );
}
