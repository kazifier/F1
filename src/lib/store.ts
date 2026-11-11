import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Equipment,
  LogisticsSettings,
  PartRow,
  ProjectInfo,
  ProposalSettings,
  RateBook,
  ScopeParty,
} from "./types";
import { DEFAULT_RATES } from "./bom";
import { PART_DEFS, PART_BY_KEY, defaultRow } from "./parts";
import { applyHeaderDefaults } from "./autofill";
import { BASE_CURRENCY, formatMoney, getCurrency } from "./currency";
import { DEFAULT_EXCHANGER_SPEC, defaultExchangerNozzles } from "./tema";
import { DEFAULT_WELD } from "./welding";
import { DEFAULT_LOGISTICS } from "./logistics";

let seq = 1;
const uid = (p = "eq") => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function emptyParts(): Record<string, PartRow[]> {
  const parts: Record<string, PartRow[]> = {};
  for (const def of PART_DEFS) {
    parts[def.key] = Array.from({ length: def.defaultRows }, () => defaultRow(def.key));
  }
  return parts;
}

export function newEquipment(type = "Pressure Vessel", tag = "", name = ""): Equipment {
  const eq: Equipment = {
    id: uid(),
    type,
    tag: tag || `NEW-${String(seq).padStart(2, "0")}`,
    name: name || "New Equipment",
    service: "",
    qty: 1,
    orientation: "Horizontal",
    diameter: 1500,
    ttLength: 3000,
    shellThk: 12,
    inspection: "3.1",
    designPressure: 350,
    designTemperature: 80,
    mdmt: -10,
    corrosionAllowance: 3,
    jointEfficiency: 0.85,
    headType: "2:1 Ellipsoidal",
    insulationThk: 50,
    radiography: "Spot RT",
    pWHT: "No",
    paintSystem: "Epoxy 2 coat",
    parts: starterParts(),
  };
  if (/exchanger|fired heater/i.test(eq.type)) {
    // an exchanger is estimated from its TEMA/ASME design basis, not vessel parts
    const he = { ...DEFAULT_EXCHANGER_SPEC };
    return { ...eq, parts: {}, he, heExtras: {} };
  }
  // the header is the single source of truth — pre-fill the whole part sheet
  return applyHeaderDefaults(eq);
}

/** sensible starting rows (sizes/ratings) before the header overwrites what it can derive */
function starterParts(): Record<string, PartRow[]> {
  const parts = emptyParts();
  const sizes = ['6"', '3"', '2"', '1"'];
  parts.nozzle = sizes.map((size, i) => ({
    ...defaultRow("nozzle"),
    nz_size: size,
    nz_sch: i >= 2 ? "80" : "40",
    nz_type: "Pipe",
    nz_face: "RF",
    nz_cat: "B",
  }));
  parts.manway = ['20"', '20"'].map((size) => ({
    ...defaultRow("manway"),
    mw_size: size,
    mw_davit: "Yes",
  }));
  parts.ladder = [{ ...defaultRow("ladder"), ld_monkey: "0" }];
  return parts;
}

function setRow(eq: Equipment, partKey: string, index: number, field: string, value: string): Equipment {
  const rows = eq.parts[partKey] ? [...eq.parts[partKey]] : [];
  while (rows.length <= index) rows.push(defaultRow(partKey));
  rows[index] = { ...rows[index], [field]: value };
  return { ...eq, parts: { ...eq.parts, [partKey]: rows } };
}

// ---------------------------------------------------------------------------
// Demo / seed project — replicates the 10-D04 Water Break Tank from the legacy app
// ---------------------------------------------------------------------------
function seedTank(): Equipment {
  const eq = newEquipment("Pressure Vessel", "10-D04", "Water Break Tank");
  eq.service = "Water break / degassing drum";
  eq.qty = 2;
  eq.orientation = "Horizontal";
  eq.diameter = 1500;
  eq.ttLength = 3600;
  eq.shellThk = 12;
  eq.inspection = "3.1";
  eq.designPressure = 350;
  eq.designTemperature = 90;
  eq.corrosionAllowance = 3;
  eq.jointEfficiency = 0.85;
  eq.insulationThk = 50;
  eq.radiography = "Spot RT";
  eq.parts = {
    ...eq.parts,
    shell: [
      {
        ...defaultRow("shell"),
        sh_id: "1500", sh_thk: "12", sh_len: "3600", sh_mat: "SA-516 Gr.70",
        sh_cladd: "No", sh_stiff: "Yes", sh_stiffW: "120", sh_stiffThk: "10", sh_stiffQty: "3",
        sh_topPlate: "No", sh_botPlate: "No", sh_baseRing: "No",
      },
    ],
    head: [
      { ...defaultRow("head"), hd_id: "1500", hd_nomThk: "12", hd_minThk: "10.5", hd_mat: "SA-516 Gr.70", hd_type: "2:1 Ellipsoidal", hd_cladd: "No" },
      { ...defaultRow("head"), hd_id: "1500", hd_nomThk: "12", hd_minThk: "10.5", hd_mat: "SA-516 Gr.70", hd_type: "2:1 Ellipsoidal", hd_cladd: "No" },
    ],
    nozzle: [
      { ...defaultRow("nozzle"), nz_size: '6"', nz_sch: "40", nz_rating: "150#", nz_face: "RF", nz_type: "Pipe", nz_length: "150", nz_pipeThk: "7.11", nz_cat: "ISRS-Std", nz_pipeMat: "SA-106 Gr.B", nz_flgMat: "SA-105", nz_blind: "Yes", nz_pad: "Yes", nz_padThk: "12", nz_padOd: "250", nz_gsk: "Yes", nz_gskType: "Spiral Wound", nz_gskThk: "4.5", nz_gskMat: "SS316+Graphite", nz_gskSpare: "10", nz_bolt: "Yes", nz_boltType: "UNC", nz_boltSpare: "10" },
      { ...defaultRow("nozzle"), nz_size: '3"', nz_sch: "40", nz_rating: "150#", nz_face: "RF", nz_type: "Pipe", nz_length: "150", nz_pipeThk: "5.49", nz_cat: "ISRS-Std", nz_pipeMat: "SA-106 Gr.B", nz_flgMat: "SA-105", nz_blind: "No", nz_pad: "Yes", nz_padThk: "12", nz_padOd: "170", nz_gsk: "Yes", nz_gskType: "Spiral Wound", nz_gskThk: "4.5", nz_gskMat: "SS316+Graphite", nz_gskSpare: "10", nz_bolt: "Yes", nz_boltType: "UNC", nz_boltSpare: "10" },
      { ...defaultRow("nozzle"), nz_size: '2"', nz_sch: "80", nz_rating: "150#", nz_face: "RF", nz_type: "Pipe", nz_length: "150", nz_pipeThk: "5.54", nz_cat: "ISRS-Std", nz_pipeMat: "SA-106 Gr.B", nz_flgMat: "SA-105", nz_blind: "No", nz_pad: "Yes", nz_padThk: "12", nz_padOd: "140", nz_gsk: "Yes", nz_gskType: "Spiral Wound", nz_gskThk: "4.5", nz_gskMat: "SS316+Graphite", nz_gskSpare: "10", nz_bolt: "Yes", nz_boltType: "UNC", nz_boltSpare: "10" },
      { ...defaultRow("nozzle"), nz_size: '1"', nz_sch: "80", nz_rating: "150#", nz_face: "RF", nz_type: "Pipe", nz_length: "120", nz_pipeThk: "4.55", nz_cat: "ISRS-Std", nz_pipeMat: "SA-106 Gr.B", nz_flgMat: "SA-105", nz_blind: "No", nz_pad: "No", nz_gsk: "Yes", nz_gskType: "Spiral Wound", nz_gskThk: "4.5", nz_gskMat: "SS316+Graphite", nz_gskSpare: "10", nz_bolt: "Yes", nz_boltType: "UNC", nz_boltSpare: "10" },
    ],
    manway: [
      { ...defaultRow("manway"), mw_size: '20"', mw_rating: "150#", mw_mat: "SA-516 Gr.70", mw_bolt: "Yes", mw_boltType: "UNC", mw_boltSpare: "10", mw_gsk: "Yes", mw_gskType: "Spiral Wound", mw_gskThk: "4.5", mw_gskMat: "SS316+Graphite", mw_gskSpare: "10", mw_davit: "Yes" },
      { ...defaultRow("manway"), mw_size: '20"', mw_rating: "150#", mw_mat: "SA-516 Gr.70", mw_bolt: "Yes", mw_boltType: "UNC", mw_boltSpare: "10", mw_gsk: "Yes", mw_gskType: "Spiral Wound", mw_gskThk: "4.5", mw_gskMat: "SS316+Graphite", mw_gskSpare: "10", mw_davit: "No" },
    ],
    support: [
      { ...defaultRow("support"), su_saddle: "Yes", su_saddleQty: "2", su_saddleH: "800", su_skirt: "No", su_leg: "No" },
    ],
    ladder: [{ ...defaultRow("ladder"), ld_monkey: "4500" }],
    platform: [{ ...defaultRow("platform"), pf_area: "2.5" }],
    demister: [{ ...defaultRow("demister"), dm_thk: "150", dm_dia: "1500", dm_mat: "SA-240 Gr.304" }],
    vortex: [{ ...defaultRow("vortex"), vx_dia: '6"', vx_thk: "6", vx_h: "300" }],
  };
  return eq;
}

function seedColumn(): Equipment {
  const eq = newEquipment("Column / Tower", "10-C01", "Amine Absorber");
  eq.service = "CO2 absorption, 24 trays";
  eq.qty = 1;
  eq.orientation = "Vertical";
  eq.diameter = 2200;
  eq.ttLength = 18000;
  eq.shellThk = 16;
  eq.inspection = "3.2";
  eq.designPressure = 700;
  eq.designTemperature = 120;
  eq.corrosionAllowance = 3;
  eq.jointEfficiency = 1;
  eq.insulationThk = 100;
  eq.radiography = "Full RT";
  eq.pWHT = "Yes";
  eq.parts = {
    ...eq.parts,
    shell: [
      { ...defaultRow("shell"), sh_id: "2200", sh_thk: "16", sh_len: "18000", sh_mat: "SA-516 Gr.70", sh_stiff: "Yes", sh_stiffW: "150", sh_stiffThk: "12", sh_stiffQty: "6" },
    ],
    head: [
      { ...defaultRow("head"), hd_id: "2200", hd_nomThk: "16", hd_minThk: "14", hd_mat: "SA-516 Gr.70", hd_type: "2:1 Ellipsoidal" },
      { ...defaultRow("head"), hd_id: "2200", hd_nomThk: "16", hd_minThk: "14", hd_mat: "SA-516 Gr.70", hd_type: "2:1 Ellipsoidal" },
    ],
    nozzle: [
      { ...defaultRow("nozzle"), nz_size: '12"', nz_sch: "STD", nz_rating: "300#", nz_length: "200", nz_pipeThk: "9.53", nz_pipeMat: "SA-106 Gr.B", nz_flgMat: "SA-105", nz_pad: "Yes", nz_padThk: "16", nz_padOd: "420", nz_gsk: "Yes", nz_gskType: "Spiral Wound", nz_gskMat: "SS316+Graphite", nz_bolt: "Yes" },
      { ...defaultRow("nozzle"), nz_size: '8"', nz_sch: "40", nz_rating: "300#", nz_length: "180", nz_pipeThk: "8.18", nz_pipeMat: "SA-106 Gr.B", nz_flgMat: "SA-105", nz_pad: "Yes", nz_padThk: "16", nz_padOd: "320", nz_gsk: "Yes", nz_gskType: "Spiral Wound", nz_gskMat: "SS316+Graphite", nz_bolt: "Yes" },
      { ...defaultRow("nozzle"), nz_size: '6"', nz_sch: "40", nz_rating: "300#", nz_length: "160", nz_pipeThk: "7.11", nz_pipeMat: "SA-106 Gr.B", nz_flgMat: "SA-105", nz_pad: "Yes", nz_padThk: "16", nz_padOd: "260", nz_gsk: "Yes", nz_gskType: "Spiral Wound", nz_gskMat: "SS316+Graphite", nz_bolt: "Yes" },
    ],
    manway: [
      { ...defaultRow("manway"), mw_size: '20"', mw_rating: "300#", mw_mat: "SA-516 Gr.70", mw_bolt: "Yes", mw_gsk: "Yes", mw_gskType: "Spiral Wound", mw_gskMat: "SS316+Graphite", mw_davit: "Yes" },
      { ...defaultRow("manway"), mw_size: '20"', mw_rating: "300#", mw_mat: "SA-516 Gr.70", mw_bolt: "Yes", mw_gsk: "Yes", mw_gskType: "Spiral Wound", mw_gskMat: "SS316+Graphite", mw_davit: "Yes" },
      { ...defaultRow("manway"), mw_size: '20"', mw_rating: "300#", mw_mat: "SA-516 Gr.70", mw_bolt: "Yes", mw_gsk: "Yes", mw_gskType: "Spiral Wound", mw_gskMat: "SS316+Graphite", mw_davit: "No" },
    ],
    support: [
      { ...defaultRow("support"), su_skirt: "Yes", su_skirtH: "3000", su_skirtThk: "14", su_saddle: "No" },
    ],
    ladder: [{ ...defaultRow("ladder"), ld_monkey: "21000" }],
    platform: [
      { ...defaultRow("platform"), pf_area: "6.5" },
      { ...defaultRow("platform"), pf_area: "6.5" },
      { ...defaultRow("platform"), pf_area: "6.5" },
    ],
    baffle: [{ ...defaultRow("baffle"), bf_thk: "6", bf_mat: "SA-240 Gr.304", bf_qty: "24" }],
  };
  return eq;
}

function seedExchanger(): Equipment {
  const eq = newEquipment("Heat Exchanger", "10-E01", "Lean / Rich Amine Exchanger");
  eq.service = "TEMA BEM, 320 m2";
  eq.qty = 1;
  eq.orientation = "Horizontal";
  eq.diameter = 900;
  eq.ttLength = 6000;
  eq.shellThk = 14;
  eq.inspection = "3.1";
  eq.designPressure = 900;
  eq.designTemperature = 140;
  eq.corrosionAllowance = 3;
  eq.jointEfficiency = 0.85;
  eq.insulationThk = 75;
  eq.radiography = "Full RT";
  eq.he = {
    ...DEFAULT_EXCHANGER_SPEC,
    tema: "BEM",
    surfaceM2: 320,
    shellPressure: 883,
    tubePressure: 883,
    shellTemp: 140,
    tubeTemp: 140,
  };
  eq.parts = {
    ...eq.parts,
    shell: [{ ...defaultRow("shell"), sh_id: "900", sh_thk: "14", sh_len: "6000", sh_mat: "SA-516 Gr.70", sh_stiff: "No" }],
    head: [
      { ...defaultRow("head"), hd_id: "900", hd_nomThk: "14", hd_minThk: "12", hd_mat: "SA-516 Gr.70", hd_type: "2:1 Ellipsoidal" },
      { ...defaultRow("head"), hd_id: "900", hd_nomThk: "14", hd_minThk: "12", hd_mat: "SA-516 Gr.70", hd_type: "2:1 Ellipsoidal" },
    ],
    nozzle: [
      { ...defaultRow("nozzle"), nz_size: '8"', nz_sch: "40", nz_rating: "300#", nz_length: "180", nz_pipeThk: "8.18", nz_pipeMat: "SA-106 Gr.B", nz_flgMat: "SA-105", nz_pad: "Yes", nz_padThk: "14", nz_padOd: "300", nz_gsk: "Yes", nz_gskType: "Spiral Wound", nz_gskMat: "SS316+Graphite", nz_bolt: "Yes" },
      { ...defaultRow("nozzle"), nz_size: '8"', nz_sch: "40", nz_rating: "300#", nz_length: "180", nz_pipeThk: "8.18", nz_pipeMat: "SA-106 Gr.B", nz_flgMat: "SA-105", nz_pad: "Yes", nz_padThk: "14", nz_padOd: "300", nz_gsk: "Yes", nz_gskType: "Spiral Wound", nz_gskMat: "SS316+Graphite", nz_bolt: "Yes" },
      { ...defaultRow("nozzle"), nz_size: '2"', nz_sch: "80", nz_rating: "300#", nz_length: "150", nz_pipeThk: "5.54", nz_pipeMat: "SA-106 Gr.B", nz_flgMat: "SA-105", nz_pad: "No", nz_gsk: "Yes", nz_gskType: "Spiral Wound", nz_gskMat: "SS316+Graphite", nz_bolt: "Yes" },
    ],
    manway: [{ ...defaultRow("manway"), mw_size: '20"', mw_rating: "300#", mw_mat: "SA-516 Gr.70", mw_bolt: "Yes", mw_gsk: "Yes", mw_gskType: "Spiral Wound", mw_gskMat: "SS316+Graphite", mw_davit: "No" }],
    support: [{ ...defaultRow("support"), su_saddle: "Yes", su_saddleQty: "2", su_saddleH: "700" }],
    baffle: [{ ...defaultRow("baffle"), bf_thk: "6", bf_mat: "SA-516 Gr.70", bf_qty: "18" }],
  };
  return eq;
}

export interface AppState {
  project: ProjectInfo;
  equipment: Equipment[];
  rates: RateBook;
  /** cross-country procurement & delivery basis */
  logistics: LogisticsSettings;
  /** offer preparation — parties, commercial basis and scope matrix */
  proposal: ProposalSettings;
  /** BOQ line key → origin country selected for that part */
  sourcing: Record<string, string>;
  step: number;
  activeEquipmentId: string | null;
  activePart: string;
  setProject: (p: Partial<ProjectInfo>) => void;
  setStep: (s: number) => void;
  setActiveEquipment: (id: string | null) => void;
  setActivePart: (key: string) => void;
  addEquipment: (eq?: Equipment) => void;
  /** replace the whole estimate (used when a datasheet scope is loaded) */
  replaceEquipment: (list: Equipment[]) => void;
  /** column breakdown rows that are not part of the take-off */
  setColumnExtra: (id: string, component: string, field: "qty" | "amount", value: string) => void;
  /** heat exchanger rows that the TEMA design does not produce */
  setHeExtra: (id: string, component: string, field: "qty" | "amount", value: string) => void;
  /** edit the exchanger design basis and re-derive its sheet */
  setHeSpec: (id: string, patch: Partial<import("./tema").ExchangerSpec>) => void;
  /** edit one exchanger nozzle and re-price the nozzle line */
  setHeNozzle: (id: string, mark: string, patch: Partial<import("./types").HeNozzleRow>) => void;
  addHeNozzle: (id: string) => void;
  removeHeNozzle: (id: string, mark: string) => void;
  /** restore the TEMA RG-6.4 generated nozzle schedule */
  resetHeNozzles: (id: string) => void;
  removeEquipment: (id: string) => void;
  updateEquipment: (id: string, patch: Partial<Equipment>) => void;
  /** re-derive the whole part sheet from the equipment header */
  applyDefaults: (id: string) => void;
  setCell: (id: string, partKey: string, index: number, field: string, value: string) => void;
  addRow: (id: string, partKey: string) => void;
  removeRow: (id: string, partKey: string, index: number) => void;
  setRates: (patch: Partial<RateBook>) => void;
  setLogistics: (patch: Partial<LogisticsSettings>) => void;
  setProposal: (patch: Partial<ProposalSettings>) => void;
  /** change one cell of the end user / client / Ramsis scope matrix */
  setScopeCell: (rowId: string, party: ScopeParty, value: string) => void;
  /** choose the supply country for one BOQ line */
  setSourcing: (key: string, origin: string) => void;
  /** restore the default origin for every line */
  clearSourcing: () => void;
  resetAll: () => void;
  loadDemo: () => void;
}

const defaultProject: ProjectInfo = {
  projectNo: "PRJ-2026-0184",
  projectName: "Gas Processing Facility — Phase II",
  client: "Bharat Petrochem Ltd.",
  consultant: "Techno Engineers & Consultants",
  location: "Sitra, Kingdom of Bahrain",
  enquiryDate: new Date().toISOString().slice(0, 10),
  preparedBy: "Estimating Department",
  currency: BASE_CURRENCY,
  revision: "R0",
};

const defaultProposal: ProposalSettings = {
  offerType: "Techno-Commercial",
  offerNo: "T-2026-0001",
  revision: "R0",
  date: new Date().toISOString().slice(0, 10),
  attention: "Manager – Procurement Department",
  client: "",
  clientAddress: "",
  endUser: "",
  subject: "",
  enquiryRef: "",
  validityDays: 30,
  deliveryWeeks: 40,
  paymentDays: 30,
  advancePct: 10,
  designPct: 10,
  retentionPct: 0,
  warrantyMonths: 12,
  warrantyExWeeks: 18,
  preparedBy: "Adi Krishna K",
  preparedRole: "Proposal Manager",
  phone: "+973 1783 0801",
  mobile: "+973 3960 0458",
  email: "adi.krishna@ramsis.com.bh",
  scope: {},
  notes: "",
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      project: defaultProject,
      equipment: [seedTank(), seedColumn(), seedExchanger()],
      rates: DEFAULT_RATES,
      logistics: { ...DEFAULT_LOGISTICS },
      proposal: { ...defaultProposal },
      sourcing: {},
      step: 1,
      activeEquipmentId: null,
      activePart: "shell",
      setProject: (p) => set({ project: { ...get().project, ...p } }),
      setStep: (step) => set({ step }),
      setActiveEquipment: (activeEquipmentId) =>
        set({ activeEquipmentId, activePart: get().activePart || "shell" }),
      setActivePart: (activePart) => set({ activePart }),
      addEquipment: (eq) => {
        const item = eq ?? newEquipment();
        set({ equipment: [...get().equipment, item], activeEquipmentId: item.id });
      },
      replaceEquipment: (list) =>
        set({ equipment: list, activeEquipmentId: list[0]?.id ?? null, activePart: "shell" }),
      setColumnExtra: (id, component, field, value) =>
        set({
          equipment: get().equipment.map((e) => {
            if (e.id !== id) return e;
            const extras = { ...(e.columnExtras ?? {}) };
            const row = { ...(extras[component] ?? { qty: "", amount: "" }) };
            row[field] = value;
            extras[component] = row;
            return { ...e, columnExtras: extras };
          }),
        }),
      setHeExtra: (id, component, field, value) =>
        set({
          equipment: get().equipment.map((e) => {
            if (e.id !== id) return e;
            const extras = { ...(e.heExtras ?? {}) };
            const row = { ...(extras[component] ?? { qty: "", amount: "" }) };
            row[field] = value;
            extras[component] = row;
            return { ...e, heExtras: extras };
          }),
        }),
      setHeSpec: (id, patch) =>
        set({
          equipment: get().equipment.map((e) => {
            if (e.id !== id || !e.he) return e;
            const he = { ...e.he, ...patch };
            // the header mirrors the design so the rest of the app stays consistent
            return { ...e, he, heNozzles: e.heNozzles ?? defaultExchangerNozzles(he) };
          }),
        }),
      setHeNozzle: (id, mark, patch) =>
        set({
          equipment: get().equipment.map((e) => {
            if (e.id !== id || !e.he) return e;
            const rows = e.heNozzles ?? defaultExchangerNozzles(e.he);
            return {
              ...e,
              heNozzles: rows.map((r) => (r.mark === mark ? { ...r, ...patch } : r)),
            };
          }),
        }),
      addHeNozzle: (id) =>
        set({
          equipment: get().equipment.map((e) => {
            if (e.id !== id || !e.he) return e;
            const rows = e.heNozzles ?? defaultExchangerNozzles(e.he);
            const next = `N${rows.length + 1}`;
            return {
              ...e,
              heNozzles: [
                ...rows,
                {
                  mark: next,
                  service: "Spare / future",
                  nps: '2"',
                  qty: 1,
                  pressure: e.he.shellPressure,
                  temperature: e.he.shellTemp,
                  shellSide: true,
                },
              ],
            };
          }),
        }),
      removeHeNozzle: (id, mark) =>
        set({
          equipment: get().equipment.map((e) => {
            if (e.id !== id || !e.he) return e;
            const rows = e.heNozzles ?? defaultExchangerNozzles(e.he);
            return { ...e, heNozzles: rows.filter((r) => r.mark !== mark) };
          }),
        }),
      resetHeNozzles: (id) =>
        set({
          equipment: get().equipment.map((e) =>
            e.id === id && e.he ? { ...e, heNozzles: defaultExchangerNozzles(e.he) } : e,
          ),
        }),
      removeEquipment: (id) =>
        set({
          equipment: get().equipment.filter((e) => e.id !== id),
          activeEquipmentId: get().activeEquipmentId === id ? null : get().activeEquipmentId,
        }),
      updateEquipment: (id, patch) =>
        set({ equipment: get().equipment.map((e) => (e.id === id ? { ...e, ...patch } : e)) }),
      applyDefaults: (id) =>
        set({
          equipment: get().equipment.map((e) => (e.id === id ? applyHeaderDefaults(e) : e)),
        }),
      setCell: (id, partKey, index, field, value) =>
        set({
          equipment: get().equipment.map((e) =>
            e.id === id ? setRow(e, partKey, index, field, value) : e,
          ),
        }),
      addRow: (id, partKey) =>
        set({
          equipment: get().equipment.map((e) => {
            if (e.id !== id) return e;
            const def = PART_BY_KEY[partKey];
            const rows = e.parts[partKey] ?? [];
            if (rows.length >= def.maxRows) return e;
            return { ...e, parts: { ...e.parts, [partKey]: [...rows, defaultRow(partKey)] } };
          }),
        }),
      removeRow: (id, partKey, index) =>
        set({
          equipment: get().equipment.map((e) => {
            if (e.id !== id) return e;
            const rows = (e.parts[partKey] ?? []).filter((_, i) => i !== index);
            return { ...e, parts: { ...e.parts, [partKey]: rows.length ? rows : [defaultRow(partKey)] } };
          }),
        }),
      setRates: (patch) => set({ rates: { ...get().rates, ...patch } }),
      setLogistics: (patch) => set({ logistics: { ...get().logistics, ...patch } }),
      setProposal: (patch) => set({ proposal: { ...get().proposal, ...patch } }),
      setScopeCell: (rowId, party, value) =>
        set({ proposal: { ...get().proposal, scope: { ...get().proposal.scope, [`${rowId}|${party}`]: value } } }),
      setSourcing: (key, origin) => set({ sourcing: { ...get().sourcing, [key]: origin } }),
      clearSourcing: () => set({ sourcing: {} }),
      resetAll: () =>
        set({
          project: defaultProject,
          equipment: [],
          rates: DEFAULT_RATES,
          logistics: { ...DEFAULT_LOGISTICS },
      proposal: { ...defaultProposal },
          sourcing: {},
          step: 1,
          activeEquipmentId: null,
        }),
      loadDemo: () =>
        set({
          project: defaultProject,
          equipment: [seedTank(), seedColumn(), seedExchanger()],
          rates: DEFAULT_RATES,
          logistics: { ...DEFAULT_LOGISTICS },
      proposal: { ...defaultProposal },
          sourcing: {},
          step: 1,
          activeEquipmentId: null,
        }),
    }),
    {
      name: "vessel-estimator-v1",
      version: 8,
      migrate: (persisted: unknown, version: number) => {
        const s = persisted as { equipment?: Equipment[] } & Record<string, unknown>;
        // v7: proposal preparation settings
        if (version < 7) {
          const st = s as { proposal?: ProposalSettings };
          st.proposal = { ...defaultProposal, ...(st.proposal ?? {}) };
        }
        // v8: the design-approval milestone replaces the material PO release
        if (version < 8) {
          const st = s as { proposal?: Partial<ProposalSettings> };
          const merged = { ...defaultProposal, ...(st.proposal ?? {}) };
          delete (merged as unknown as Record<string, unknown>).materialPoPct;
          st.proposal = merged;
        }
        // v3: rate book moved from INR benchmarks to BHD, currency is now a display setting
        // v6: the workshop is in Bahrain, so Bahrain is the default supply country
        if (version < 6) {
          const st = s as { logistics?: { defaultOrigin?: string }; sourcing?: unknown };
          if (st.logistics) st.logistics.defaultOrigin = "Bahrain";
          else st.logistics = { ...DEFAULT_LOGISTICS };
          st.sourcing = {};
        }
        // v5: procurement / delivery basis and per-line sourcing added
        if (version < 5) {
          const st = s as { logistics?: unknown; sourcing?: unknown };
          if (!st.logistics) st.logistics = { ...DEFAULT_LOGISTICS };
          if (!st.sourcing) st.sourcing = {};
        }
        // v4: welding / manhour basis added to the rate book
        if (version < 4) {
          const r = s.rates as (RateBook & { weld?: unknown }) | undefined;
          if (r && !r.weld) r.weld = { ...DEFAULT_WELD };
        }
        if (version < 3) {
          const rates = s.rates as (Record<string, unknown> & { materialRate?: Record<string, number> }) | undefined;
          if (rates) {
            const k = 1 / 228.6;
            for (const key of ["fabricationCmf", "fabricationSsf", "weldingRate", "testingRate", "pwhtRate", "paintingRate"]) {
              if (typeof rates[key] === "number") rates[key] = +((rates[key] as number) * k).toFixed(4);
            }
            for (const key of ["insulationRate", "flangeRate", "materialRate"]) {
              const group = rates[key] as Record<string, number> | undefined;
              if (group) {
                for (const gk of Object.keys(group)) group[gk] = +(group[gk] * k).toFixed(4);
              }
            }
            rates.vatPct = (rates.vatPct as number) ?? 10;
            rates.vatIncluded = false;
            delete rates.gstPct;
          }
          const project = s.project as { currency?: string } | undefined;
          if (!project || !project.currency || project.currency === "INR") {
            s.project = { ...(project ?? {}), currency: BASE_CURRENCY } as never;
          }
        }
        if (s?.equipment) {
          s.equipment = s.equipment.map((e) => {
            const shell = e.parts?.shell?.[0] ?? {};
            return {
              ...e,
              orientation: e.orientation ?? (e.parts?.support?.[0]?.su_skirt === "Yes" ? "Vertical" : "Horizontal"),
              diameter: e.diameter || Number(shell.sh_id) || 1500,
              ttLength: e.ttLength || Number(shell.sh_len) || 3000,
              shellThk: e.shellThk || Number(shell.sh_thk) || 12,
              inspection: e.inspection ?? (e.radiography === "Full RT" ? "3.2" : "3.1"),
            };
          });
        }
        return s as never;
      },
    },
  ),
);

export const fmt = (v: number, d = 2) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })
    : "-";

export const fmtInt = (v: number) =>
  Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "-";

/** currency currently selected for the project (BHD by default) */
export const currentCurrency = () => getCurrency(useStore.getState().project.currency);

/** format a BHD amount in the project's display currency */
export const money = (v: number, code?: string) =>
  formatMoney(v, code ?? useStore.getState().project.currency);
