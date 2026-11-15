import { useState } from "react";
import type { NozzleJoint } from "../lib/nozzleDetail";

/**
 * SRN (self-reinforced nozzle) fabrication detail.
 *
 * An SRN is bought as one forging — flange and neck in a single piece from the
 * shell/head outside surface to the raised face — so there is no pipe neck and
 * no RF pad. This panel sets out the type, the dimensions the fabricator works
 * to, the weld preparation at the shell, and a dimensioned section sketch.
 */

const ACCENT = "#8b1e1e";
const INK = "#1f2328";
const MUTED = "#667080";
const STEEL = "#dcaeae";

const d1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : "—");
const d0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toString() : "—");

function DimH({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  return (
    <g stroke={MUTED} strokeWidth={0.7} fill="none">
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} />
      <text x={(x1 + x2) / 2} y={y - 4} fill={INK} stroke="none" fontSize={8.5} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

function DimV({ y1, y2, x, label }: { y1: number; y2: number; x: number; label: string }) {
  return (
    <g stroke={MUTED} strokeWidth={0.7} fill="none">
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} />
      <text
        x={x - 4}
        y={(y1 + y2) / 2}
        fill={INK}
        stroke="none"
        fontSize={8.5}
        textAnchor="middle"
        transform={`rotate(-90 ${x - 4} ${(y1 + y2) / 2})`}
      >
        {label}
      </text>
    </g>
  );
}

/** section through the forging, the shell and the weld prep */
function SrnSection({ j }: { j: NozzleJoint }) {
  const f = j.forging;
  const shellT = j.ug37.shellT;
  const bore = Math.max(f.neckOd - 2 * f.neckThk, 1);

  const W = 440;
  const H = 300;
  const padL = 108;
  const padR = 96;
  const padT = 58;
  const padB = 44;
  const scale = Math.min(
    (W - padL - padR) / Math.max(f.flangeOd, 1),
    (H - padT - padB) / Math.max(f.height + shellT, 1),
  );
  const s = (mm: number) => Math.max(mm * scale, 0.8);

  const cx = padL + (W - padL - padR) / 2;
  const shellTop = H - padB;
  const bandH = Math.max(s(shellT), 9);
  const shellBot = shellTop + bandH;
  const faceY = shellTop - Math.max(s(f.height), 26);
  const flangeBot = faceY + Math.max(s(f.flangeThk), 7);
  const neckHalf = Math.max(s(f.neckOd) / 2, 5);
  const wall = Math.min(Math.max(s(f.neckThk), 3), neckHalf * 0.75);
  const flangeHalf = Math.max(s(f.flangeOd) / 2, neckHalf + 7);
  const boreHalf = Math.max(s(bore) / 2, 1.5);
  const shellL = cx - flangeHalf - 52;
  const shellR = cx + flangeHalf + 52;

  const hatched = (id: string) => (
    <defs>
      <pattern id={id} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="6" stroke={ACCENT} strokeWidth="0.7" opacity="0.45" />
      </pattern>
    </defs>
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ maxWidth: 470 }}
      role="img"
      aria-label={`SRN nozzle ${j.mark} section, shell to raised face`}
    >
      {hatched("srnHatch")}

      {/* shell plate */}
      <rect x={shellL} y={shellTop} width={shellR - shellL} height={bandH} fill="#ece7e7" stroke={INK} strokeWidth={0.9} />
      {/* bore through the shell */}
      <rect x={cx - boreHalf} y={shellTop} width={boreHalf * 2} height={bandH} fill="#fff" />
      <line x1={cx - boreHalf} y1={shellTop} x2={cx - boreHalf} y2={shellBot} stroke={INK} strokeWidth={0.7} />
      <line x1={cx + boreHalf} y1={shellTop} x2={cx + boreHalf} y2={shellBot} stroke={INK} strokeWidth={0.7} />

      {/* forged neck walls */}
      <rect x={cx - neckHalf} y={flangeBot} width={wall} height={shellTop - flangeBot} fill={STEEL} stroke={INK} strokeWidth={0.9} />
      <rect x={cx + neckHalf - wall} y={flangeBot} width={wall} height={shellTop - flangeBot} fill={STEEL} stroke={INK} strokeWidth={0.9} />

      {/* forged flange with an integral raised face */}
      <rect x={cx - flangeHalf} y={faceY} width={flangeHalf * 2} height={flangeBot - faceY} fill={STEEL} stroke={INK} strokeWidth={0.9} />
      <rect x={cx - boreHalf} y={faceY} width={boreHalf * 2} height={flangeBot - faceY} fill="#fff" stroke={INK} strokeWidth={0.6} />
      <line x1={cx - flangeHalf + 4} y1={faceY} x2={cx + flangeHalf - 4} y2={faceY} stroke={ACCENT} strokeWidth={2.4} />

      {/* full-penetration groove welds at the shell */}
      <polygon
        points={`${cx - neckHalf},${shellTop} ${cx - neckHalf - wall * 1.6},${shellTop} ${cx - neckHalf},${shellTop + bandH * 0.9}`}
        fill={ACCENT}
        opacity={0.3}
        stroke={ACCENT}
        strokeWidth={0.8}
      />
      <polygon
        points={`${cx + neckHalf},${shellTop} ${cx + neckHalf + wall * 1.6},${shellTop} ${cx + neckHalf},${shellTop + bandH * 0.9}`}
        fill={ACCENT}
        opacity={0.3}
        stroke={ACCENT}
        strokeWidth={0.8}
      />

      {/* centre line */}
      <line x1={cx} y1={faceY - 30} x2={cx} y2={shellBot + 12} stroke={MUTED} strokeWidth={0.8} strokeDasharray="8 3 2 3" />

      {/* dimensions */}
      <DimH x1={cx - flangeHalf} x2={cx + flangeHalf} y={faceY - 20} label={`Ø${d0(f.flangeOd)} flange OD`} />
      <DimV y1={faceY} y2={flangeBot} x={cx + flangeHalf + 22} label={`${d1(f.flangeThk)} thk`} />
      <DimV y1={faceY} y2={shellTop} x={cx - flangeHalf - 26} label={`H ${d1(f.height)}`} />      <DimH
        x1={cx - neckHalf}
        x2={cx + neckHalf}
        y={flangeBot + Math.max((shellTop - flangeBot) / 2, 12)}
        label={`Ø${d1(f.neckOd)} neck`}
      />
      <DimV
        y1={flangeBot + 16}
        y2={shellTop - 6}
        x={cx + neckHalf + 22}
        label={`${d1(f.neckThk)} wall`}
      />

      {/* leaders */}
      <text x={cx + flangeHalf + 26} y={faceY + (flangeBot - faceY) / 2 + 24} fill={MUTED} fontSize={8}>
        125–250 AARH
      </text>
      <text x={cx - neckHalf - 96} y={shellTop + bandH + 18} fill={INK} fontSize={8.5}>
        {`full-penetration bevel weld · t ${d1(shellT)} shell`}
      </text>
      <line
        x1={cx - neckHalf - 12}
        y1={shellTop + bandH * 0.6}
        x2={cx - neckHalf - 92}
        y2={shellTop + bandH + 12}
        stroke={MUTED}
        strokeWidth={0.6}
      />

      <text x={shellL} y={16} fill={ACCENT} fontSize={9} fontWeight="bold">
        {`SECTION A–A · SRN ${j.mark} · ${j.size} ${j.flange.rating}`}
      </text>
      <text x={shellL} y={27} fill={MUTED} fontSize={8}>
        one-piece forging, shell outside surface to raised face · not to scale
      </text>
      <text x={W - padR + 6} y={H - 6} fill={MUTED} fontSize={7.5} textAnchor="end">
        dimensions in mm
      </text>
    </svg>
  );
}

/** weld preparation at the shell, enlarged */
function WeldDetail({ j }: { j: NozzleJoint }) {
  const t = j.ug37.shellT;
  return (
    <svg viewBox="0 0 240 150" width="100%" style={{ maxWidth: 250 }} role="img" aria-label="SRN weld preparation detail">
      <rect x={16} y={84} width={208} height={30} fill="#ece7e7" stroke={INK} strokeWidth={0.9} />
      {/* single-V groove through the shell wall, 37.5° each side */}
      <polygon points="104,84 128,84 144,112 88,112" fill={ACCENT} opacity={0.2} stroke={ACCENT} strokeWidth={0.9} />
      <line x1={88} y1={112} x2={144} y2={112} stroke={ACCENT} strokeWidth={1.6} />
      {/* scarfing forging set on the shell, weld cap at the corner */}
      <rect x={104} y={18} width={24} height={66} fill={STEEL} stroke={INK} strokeWidth={0.9} />
      <polygon points="104,84 90,84 104,74" fill={ACCENT} opacity={0.45} stroke={ACCENT} strokeWidth={0} />
      <polygon points="128,84 142,84 128,74" fill={ACCENT} opacity={0.45} stroke={ACCENT} strokeWidth={0} />
      <line x1={144} y1={104} x2={166} y2={96} stroke={MUTED} strokeWidth={0.6} />
      <text x={168} y={96} fill={INK} fontSize={8}>
        37.5° ± 2.5°
      </text>
      <text x={168} y={118} fill={MUTED} fontSize={7.5}>
        land 2 ± 0.5
      </text>
      <text x={16} y={132} fill={INK} fontSize={8}>
        {`gap 2 +1/0 · root ground flush · shell t ${d1(t)}`}
      </text>
      <text x={16} y={14} fill={ACCENT} fontSize={8.5} fontWeight="bold">
        DETAIL B · weld prep
      </text>
      <text x={136} y={30} fill={MUTED} fontSize={7.5}>
        neck wall {d1(j.forging.neckThk)} mm
      </text>
    </svg>
  );
}

export default function SrnNozzleDetail({ joints }: { joints: NozzleJoint[] }) {
  const srn = joints.filter((x) => x.forging.onePiece);
  const [selected, setSelected] = useState("");
  if (!srn.length) return null;

  const j = srn.find((x) => x.key === selected) ?? srn[0];
  const f = j.forging;
  const bore = Math.max(f.neckOd - 2 * f.neckThk, 1);
  const total = srn.reduce((a, x) => a + x.forging.weight * x.qty, 0);
  const flangeStyles = Array.from(new Set(srn.map((x) => x.flange.type))).join(" / ");

  const Spec = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 8, padding: "5px 0", borderBottom: "1px dashed #e6dcdc" }}>
      <div style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div>
      <div style={{ fontSize: 12 }}>{children}</div>
    </div>
  );

  return (
    <div className="est-panel">
      <div className="est-panel-head">
        SRN nozzle — fabrication detail
        <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 11, color: "rgba(255,255,255,0.78)" }}>
          {srn.length} mark{srn.length === 1 ? "" : "s"} · {total.toFixed(1)} kg · one-piece forgings
        </span>
      </div>
      <div className="est-panel-body">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 330px", minWidth: 0 }}>
            <SrnSection j={j} />
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {srn.map((x) => (
                <button
                  key={x.key}
                  className={`est-btn ${x.key === j.key ? "active" : ""}`}
                  style={{
                    padding: "2px 8px",
                    fontSize: 11,
                    borderColor: x.key === j.key ? ACCENT : undefined,
                    color: x.key === j.key ? ACCENT : undefined,
                  }}
                  onClick={() => setSelected(x.key)}
                >
                  {x.mark} · {x.size}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: "0 1 250px", minWidth: 0 }}>
            <WeldDetail j={j} />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <Spec k="Type">
            <b>SRN</b> — self-reinforced nozzle, set-on: one forged piece from the shell / dished-end outside surface to the
            raised face. No pipe neck, no RF pad; UG-37 reinforcement is carried by the neck alone.
          </Spec>
          <Spec k="Bought item">
            Forged nozzle, <b>SA-105N</b> (ASTM A105N), flange and neck in a single forging, raised face machined. Weight{" "}
            <b>{d1(f.weight)} kg</b> each
            {j.qty > 1 ? ` · ${j.qty} off = ${d1(f.weight * j.qty)} kg` : ""}.
          </Spec>
          <Spec k="Flange">
            <b>{j.flange.type}</b> · {j.flange.size} · Class {j.flange.rating.replace("#", "")} · OD Ø{d1(f.flangeOd)} ×{" "}
            {d1(f.flangeThk)} thk · facing RF, 125–250 AARH, gasket {j.gasket.type} {j.gasket.thk} mm. The flange is{" "}
            <b>forged integral with the neck</b> — nothing is welded on and there is no pipe between flange and shell.
          </Spec>
          <Spec k="Neck / bore">
            Neck Ø{d1(f.neckOd)} × {d1(f.neckThk)} wall (governing UG-45 + UG-37), bore Ø{d1(bore)} matching the{" "}
            {d1(j.ug37.d)} mm opening in the shell; height H {d1(f.height)} mm from the shell surface to the RF face.
          </Spec>
          <Spec k="Weld to shell">
            Full-penetration single-V groove weld, set-on, welded from the outside: bevel 37.5° ± 2.5°, root face 2 ± 0.5 mm,
            root gap 2 +1/0 mm, ground flush inside where access allows. WPS/PQR to ASME IX — GTAW root, SMAW fill and cap,
            preheat ≥ 10 °C, interpass ≤ 250 °C.
          </Spec>
          <Spec k="Examination">
            100% PT on the root pass and on the finished weld; RT or UT of the weld per the datasheet (UW-51 full, UW-52 spot),
            PT on the RF face; hardness check on the cap where specified.
          </Spec>
          <Spec k="Heat treatment">
            None required for P-No. 1 at this wall thickness; PWHT only if the datasheet or the client specification calls for
            it.
          </Spec>
          <Spec k="Testing / marking">
            Hydrotest with the vessel at the shell test pressure; stamp the mark, size, class and heat number on the flange rim,
            with the mill certificate to EN 10204 3.1.
          </Spec>
        </div>

        <div className="est-panel-body tight scroll-x" style={{ marginTop: 10, padding: 0 }}>
          <table className="est-grid">
            <thead>
              <tr>
                <th>Mark</th>
                <th className="num">Qty</th>
                <th>Size · class</th>
                <th>Flange</th>
                <th className="num">Neck Ø × wall</th>
                <th className="num">H to RF</th>
                <th className="num">Flange OD × thk</th>
                <th className="num">Bore</th>
                <th className="num">Weight</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {srn.map((x) => {
                const g = x.forging;
                return (
                  <tr key={`srn-${x.key}`}>
                    <td className="est-code">{x.mark}</td>
                    <td className="num">{x.qty}</td>
                    <td>
                      {x.size} · {x.flange.rating}
                    </td>
                    <td>{x.flange.type}</td>
                    <td className="num">
                      {d1(g.neckOd)} × {d1(g.neckThk)}
                    </td>
                    <td className="num">{d1(g.height)}</td>
                    <td className="num">
                      {d1(g.flangeOd)} × {d1(g.flangeThk)}
                    </td>
                    <td className="num">{d1(Math.max(g.neckOd - 2 * g.neckThk, 1))}</td>
                    <td className="num">{d1(g.weight)}</td>
                    <td className="num">
                      <b>{d1(g.weight * x.qty)}</b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="est-note">
          SRN marks are ordered as <b>forged nozzles</b>, not as a flange plus pipe plus pad: one heat number, one drawing per
          mark, weight taken from the forging rather than a pipe length. Flange style in this scope: {flangeStyles}. Dimensions
          are the fabricator's working values; the RF face height H is measured from the shell or head outside surface, so the
          forging is ordered to H and machined after the shell is rolled. The sketch is schematic — the approved nozzle drawing
          governs.
        </div>
      </div>
    </div>
  );
}
