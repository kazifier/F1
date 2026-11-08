import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { PROJECT_UNITS, isBodyFlange, parseNozzles } from "../data/units";
import { unitToEquipment } from "../data/build";
import { EXCHANGER_UNITS } from "../data/exchangers";
import { buildExchangerScope } from "../lib/exchangerParts";
import { designExchanger } from "../lib/tema";
import { jointSummary, nozzleJoints, type NozzleJoint } from "../lib/nozzleDetail";

/**
 * Nozzle detailed materials — one line per nozzle / manway mark with the five
 * bought-out groups the fabricator orders, all derived from the datasheet size
 * and the ASME checks (UG-27 neck, UG-37 reinforcement, B16.5 bolting).
 */
export default function NozzlesPage() {
  const { equipment, updateEquipment, replaceEquipment } = useStore();
  // vessel datasheet rows plus every shell & tube exchanger / fired heater
  const scoped = useMemo(
    () =>
      equipment.filter(
        (e) => e.he || PROJECT_UNITS.some((u) => u.tag === e.tag && u.name === e.name),
      ),
    [equipment],
  );
  const [tag, setTag] = useState<string>("");
  const eq = scoped.find((e) => e.tag === tag) ?? scoped[0];
  const unit = eq ? PROJECT_UNITS.find((u) => u.tag === eq.tag) : undefined;
  const joints = useMemo(() => (eq ? nozzleJoints(eq, unit, { lined: eq.lined }) : []), [eq, unit]);
  const sum = jointSummary(joints);

  const loadScope = () => {
    replaceEquipment(PROJECT_UNITS.map((u) => unitToEquipment(u)));
    setTag(PROJECT_UNITS[0].tag);
  };

  const loadExchangers = () => {
    replaceEquipment(buildExchangerScope(EXCHANGER_UNITS));
    setTag(EXCHANGER_UNITS[0].tag);
  };

  if (!eq) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Nozzle detailed materials</h2>
            <div className="sub">
              Flange, pipe neck, RF pad, gasket and fastener detail for every nozzle and manway mark —
              derived from the datasheet size, the flange class and the UG-27 / UG-37 checks.
            </div>
          </div>
        </div>
        <div className="est-panel">
          <div className="est-panel-head">No equipment in the estimate</div>
          <div className="est-panel-body">
            <p className="small">
              The nozzle schedule is built from the project datasheets. Load the scope to detail all 31
              items, or load a single tag from <b>00 Project Scope</b>.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button className="est-btn" onClick={loadScope}>
                Load columns &amp; vessels (31)
              </button>
              <button className="est-btn" onClick={loadExchangers}>
                Load heat exchangers ({EXCHANGER_UNITS.length})
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const marks = unit ? parseNozzles(unit.nozzles).filter((n) => !isBodyFlange(n)) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Nozzle detailed materials</h2>
          <div className="sub">
            Every mark carries its flange, neck, reinforcement pad, gasket and fastener set. Sizes come
            from the datasheet schedule, ratings from the equipment class; the pad is sized by UG-37 and
            marked <b>SRN</b> where the bare joint already reinforces itself.
          </div>
        </div>
        <div className="actions">
          {scoped.length === 0 && (
            <>
              <button className="est-btn" onClick={loadScope}>
                Load columns &amp; vessels (31)
              </button>
              <button className="est-btn" onClick={loadExchangers}>
                Load heat exchangers ({EXCHANGER_UNITS.length})
              </button>
            </>
          )}
        </div>
      </div>

      <div className="est-toolbar">
        <label className="est-field">
          <span>Equipment</span>
          <select value={eq.tag} onChange={(e) => setTag(e.target.value)}>
            {scoped.map((e) => (
              <option key={e.id} value={e.tag}>
                {e.tag} — {e.name}
              </option>
            ))}
          </select>
        </label>
        <div className="est-readout">
          <span className="k">Design</span>
          <span className="v">
            {(eq.designPressure / 100).toFixed(2)} bar(g) · {eq.designTemperature} °C
          </span>
        </div>
        <div className="est-readout">
          <span className="k">Shell plate</span>
          <span className="v">
            {joints[0]?.ug37.shellT ?? eq.shellThk} mm · E {eq.jointEfficiency} · CA {eq.corrosionAllowance}
          </span>
        </div>
        <div className="est-readout">
          <span className="k">Class</span>
          <span className="v">{joints[0]?.flange.rating ?? "—"}</span>
        </div>
        {eq.he ? (
          <div className="est-readout">
            <span className="k">TEMA {eq.he.tema}</span>
            <span className="v">
              Ø{designExchanger(eq.he).shellId} shell · {eq.heNozzles?.length ?? 0} nozzle marks
            </span>
          </div>
        ) : (
          <label className="est-check">
            <input
              type="checkbox"
              checked={Boolean(eq.lined)}
              onChange={(e) => updateEquipment(eq.id, { lined: e.target.checked })}
            />
            Internally lined — lined flange facing and lined pad
          </label>
        )}
      </div>

      <div className="est-kpis">
        <Kpi k="Marks" v={`${sum.marks}`} n={`${marks.length} lines on the datasheet schedule`} />
        <Kpi k="Joints" v={`${sum.joints}`} n="openings + manways" />
        <Kpi k="Self-reinforced" v={`${sum.srn}`} n="no RF pad required (UG-37)" />
        <Kpi k="SRN weight" v={`${sum.srnWeight.toFixed(0)} kg`} n={`${sum.weight.toFixed(0)} kg for all joints`} />
        <Kpi k="RF pads" v={`${sum.pads}`} n="pads to fabricate" />
        <Kpi k="Studs" v={`${sum.studs}`} n="A193 B7, spares excluded" />
      </div>

      <div className="est-panel">
        <div className="est-panel-head">
          Nozzle &amp; manway material detail — {eq.tag} {eq.name}
        </div>
        <div className="est-panel-body tight scroll-x">
          <table className="est-grid">
            <thead>
              <tr>
                <th>Mark</th>
                <th>Service</th>
                <th className="num">Qty</th>
                <th>Type</th>
                <th>Flange</th>
                <th>Pipe / neck</th>
                <th>RF pad</th>
                <th>Gasket</th>
                <th>Fasteners</th>
                <th className="num">Weight</th>
              </tr>
            </thead>
            <tbody>
              {joints.map((j) => (
                <tr key={j.key}>
                  <td className="est-code">{j.mark}</td>
                  <td>{j.service}</td>
                  <td className="num">{j.qty}</td>
                  <td>
                    <span className={`est-tagtype ${j.type === "SRN" ? "srn" : ""}`}>{j.type}</span>
                    <div className="est-sub">{j.kind}</div>
                  </td>
                  <td>
                    <b>{j.flange.type}</b> · {j.flange.size} · {j.flange.rating}
                    <div className="est-sub">thk {j.flange.thk} mm · {j.flange.mass.toFixed(1)} kg</div>
                    <div className="est-sub">{j.flange.material}</div>
                    <div className="est-sub">{j.flange.facing}</div>
                  </td>
                  <td>
                    <b>
                      Ø{j.neck.od.toFixed(1)} × {j.neck.wall.toFixed(1)} mm
                    </b>
                    <div className="est-sub">
                      {j.neck.plateNeck ? "rolled plate neck" : `Sch ${j.neck.schedule}`} · {j.neck.length} lg
                    </div>
                    <div className="est-sub">{j.neck.material}</div>
                  </td>
                  <td>
                    {j.pad.required ? (
                      <>
                        <b>
                          {j.pad.padId} × {j.pad.padOd} × {j.pad.padThk}
                        </b>
                        <div className="est-sub">ID × OD × thk · SA-516 Gr.70</div>
                        <div className="est-sub">{j.pad.note}</div>
                      </>
                    ) : (
                      <>
                        <b>self-reinforced</b>
                        <div className="est-sub">no pad — UG-37 satisfied by the neck</div>
                      </>
                    )}
                  </td>
                  <td>
                    <b>
                      {j.gasket.type} · {j.gasket.thk} mm
                    </b>
                    <div className="est-sub">
                      {j.gasket.size} · {j.gasket.rating} · {j.gasket.material}
                    </div>
                  </td>
                  <td>
                    <b>
                      {j.fasteners.perJoint} × {j.fasteners.dia} × {j.fasteners.length}
                    </b>
                    <div className="est-sub">
                      {j.fasteners.stud} / {j.fasteners.nut}
                      {j.fasteners.thread ? ` · ${j.fasteners.thread}` : ""}
                    </div>
                    <div className="est-sub">{j.fasteners.total} per set of {j.qty}</div>
                  </td>
                  <td className="num">
                    <b>{j.weight.toFixed(1)}</b>
                    <div className="est-sub">× {j.qty} = {(j.weight * j.qty).toFixed(1)} kg</div>
                  </td>
                </tr>
              ))}
              {joints.length === 0 && (
                <tr>
                  <td colSpan={10} className="est-sub" style={{ padding: 8 }}>
                  {eq.he
                      ? "No nozzle marks on this exchanger — add them from the exchanger wizard, or reset to the TEMA RG-6.4 schedule."
                      : `${marks.length} schedule lines but no dimensioned openings — check the datasheet schedule.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="est-note">
          Type: <b>Standard</b> = separate RF pad; <b>SRN</b> = self-reinforced neck (no pad). Flange:
          BLRF on manways, handholes, body flanges and flanged heads, SW RF up to 1.5″, WNRF above.
          Neck: Sch 80 on 1.5″ and below or Class 900+, Sch 40 to 6″, STD above; NPS 18+ takes the shell
          plate wall, NPS 20+ is a rolled plate neck. Gasket: spiral wound 4.5 mm, 6 mm on blind covers.
          Fasteners: A193 B7 studs with A194 2H nuts per joint, spares listed separately in the BOQ.
          Body flanges ("vessel ID" marks such as F01/F03) are flanged shell joints rather than openings,
          so they are shown on the datasheet register but not detailed or priced as nozzles here.
        </div>
      </div>

      <div className="est-panel">
        <div className="est-panel-head">UG-37 area check per mark</div>
        <div className="est-panel-body tight scroll-x">
          <table className="est-grid">
            <thead>
              <tr>
                <th>Mark</th>
                <th className="num">Opening d (mm)</th>
                <th className="num">t_r shell (mm)</th>
                <th className="num">t_rn neck (mm)</th>
                <th className="num">f_r1</th>
                <th className="num">A req (mm²)</th>
                <th className="num">A avail (mm²)</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {joints.map((j) => (
                <tr key={`ug-${j.key}`}>
                  <td className="est-code">{j.mark}</td>
                  <td className="num">{j.ug37.d.toFixed(1)}</td>
                  <td className="num">{j.ug37.tr.toFixed(2)}</td>
                  <td className="num">{j.ug37.trn.toFixed(2)}</td>
                  <td className="num">{j.ug37.fr1.toFixed(3)}</td>
                  <td className="num">{j.pad.A.toFixed(0)}</td>
                  <td className="num">{j.pad.available.toFixed(0)}</td>
                  <td>
                    {j.pad.adequate ? (
                      <span className="est-ok">{j.pad.required ? "pad OK" : "self-reinforced"}</span>
                    ) : (
                      <span className="est-bad">short {j.pad.deficit.toFixed(0)} mm²</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="est-note">
          A = d·t_r·F + 2·t_n·t_r·F·(1 − f_r1); available = A1 + A2 + A41 (+ A5 where a pad is fitted), per
          UG-37. Manways and handholes are checked on the same basis; where the bare joint already covers
          A, the mark is self-reinforced and no pad is ordered.
        </div>
      </div>
    </>
  );
}

function Kpi({ k, v, n }: { k: string; v: string; n: string }) {
  return (
    <div className="est-kpi">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      <div className="n">{n}</div>
    </div>
  );
}

export type { NozzleJoint };
