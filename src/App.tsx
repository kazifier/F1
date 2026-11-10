import { useEffect, useState } from "react";
import ProjectPage from "./pages/Project";
import NozzlesPage from "./pages/Nozzles";
import EstimatorPage from "./pages/Estimator";
import DesignPage from "./pages/Design";
import BoqPage from "./pages/Boq";
import DatasheetPage from "./pages/Datasheet";
import IntakePage from "./pages/Intake";
import ProposalPage from "./pages/Proposal";
import WeldingPage from "./pages/Welding";
import { useStore } from "./lib/store";
import { CURRENCIES, FX_NOTE, VAT_BH } from "./lib/currency";

export type Route =
  | "project"
  | "estimator"
  | "nozzles"
  | "design"
  | "boq"
  | "welding"
  | "datasheet"
  | "intake"
  | "proposal";

const ROUTES: { key: Route; idx: string; label: string; title: string }[] = [
  { key: "project", idx: "00", label: "Project Scope", title: "6 columns · 25 vessels" },
  { key: "estimator", idx: "01", label: "Estimating Wizard", title: "Step-by-step estimate" },
  { key: "nozzles", idx: "02", label: "Nozzle Materials", title: "Flange · neck · pad · gasket · studs" },
  { key: "design", idx: "03", label: "ASME Design + 3D", title: "Code design & 3D model" },
  { key: "boq", idx: "04", label: "Optimised BOQ", title: "Combined bill of quantities" },
  { key: "welding", idx: "05", label: "Welding & Manhours", title: "WPS · layers · shop hours" },
  { key: "datasheet", idx: "06", label: "Datasheet Calc", title: "Thickness & nozzle check" },
  { key: "intake", idx: "07", label: "AI Doc Intake", title: "Read datasheets & drawings" },
  { key: "proposal", idx: "08", label: "Proposal", title: "Technical · commercial · unpriced" },
];

function readHash(): Route {
  const h = window.location.hash.replace("#/", "").replace("#", "");
  return (ROUTES.find((r) => r.key === h)?.key ?? "estimator") as Route;
}

export default function App() {
  const [route, setRoute] = useState<Route>(readHash());
  const { project, setProject } = useStore();

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (r: Route) => {
    window.location.hash = `/${r}`;
    setRoute(r);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>
            Vessel<span>Est</span>
          </h1>
          <p>Estimating &amp; design suite</p>
        </div>
        <nav className="nav">
          {ROUTES.map((r) => (
            <a
              key={r.key}
              href={`#/${r.key}`}
              className={route === r.key ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                go(r.key);
              }}
            >
              <span className="idx">{r.idx}</span>
              <span>
                {r.label}
                <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 1 }}>{r.title}</div>
              </span>
            </a>
          ))}
        </nav>
        <div className="sidebar-cur">
          <label>Currency</label>
          <select
            value={project.currency}
            onChange={(e) => setProject({ currency: e.target.value })}
            title={FX_NOTE}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          <div className="note">
            All prices exclude VAT ({VAT_BH}% Bahrain). Amounts are held in BHD and shown in {project.currency}.
          </div>
        </div>
        <div className="sidebar-foot">
          ASME VIII Div.1 · B16.5 · B36.10/19
          <br />
          All calculations are estimating-grade and require review by a qualified pressure-vessel
          engineer before fabrication.
        </div>
      </aside>
      <main className="main">
        <div className="main-inner">
          {route === "project" && <ProjectPage />}
          {route === "estimator" && <EstimatorPage />}
          {route === "nozzles" && <NozzlesPage />}
          {route === "design" && <DesignPage />}
          {route === "boq" && <BoqPage />}
          {route === "welding" && <WeldingPage />}
          {route === "datasheet" && <DatasheetPage />}
          {route === "intake" && <IntakePage />}
          {route === "proposal" && <ProposalPage />}
        </div>
      </main>
    </div>
  );
}
