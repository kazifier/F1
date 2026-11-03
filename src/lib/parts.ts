import {
  NPS_LIST,
  RATING_LIST,
  SCHEDULE_LIST,
  schedulesFor,
  FACE_TYPES,
  NOZZLE_TYPES,
  BOLT_MATERIALS,
  NUT_MATERIALS,
  WASHER_MATERIALS,
  materialsFor,
  materialGroups,
} from "./catalog";
import type { MaterialForm } from "./catalog";
import type { PartDef, FieldDef } from "./types";

const YN = ["Yes", "No"];

/** Material selector restricted to the product form the item is actually made in. */
const matField = (
  key: string,
  ref: string,
  label: string,
  form: MaterialForm,
  width = 130,
): FieldDef =>
  f(key, ref, label, "select", {
    options: materialsFor(form),
    groups: materialGroups(form),
    width,
  });

const boltMatField = (key: string, ref: string, label: string, kind: "bolt" | "nut" | "washer", width = 118): FieldDef => {
  const [options, groupLabel] =
    kind === "bolt"
      ? [BOLT_MATERIALS, "ASME II-A · SA-193 / SA-320 bolts & studs"]
      : kind === "nut"
        ? [NUT_MATERIALS, "ASME II-A · SA-194 / A563 nuts"]
        : [WASHER_MATERIALS, "ASTM F436 · washers"];
  return f(key, ref, label, "select", {
    options,
    groups: [{ label: groupLabel, options }],
    width,
  });
};

function f(
  key: string,
  ref: string,
  label: string,
  type: FieldDef["type"],
  extra: Partial<FieldDef> = {},
): FieldDef {
  return { key, ref, label, type, ...extra };
}

const yesNo = (key: string, ref: string, label: string, extra: Partial<FieldDef> = {}) =>
  f(key, ref, label, "yesno", { options: YN, width: 64, ...extra });

// Excel "Cladd(Y/N)" block: thickness + material only when cladded
const claddFields = (p: string, ref: string): FieldDef[] => [
  yesNo(`${p}_cladd`, ref, "Cladd(Y/N)"),
  f(`${p}_cladThk`, `${ref}.1.1`, "Clad Thickness", "number", {
    unit: "mm",
    width: 78,
    showWhen: { key: `${p}_cladd`, equals: ["Yes"] },
  }),
  matField(`${p}_cladMat`, `${ref}.1.2`, "Clad Material", "plate", 120),
];

const gasketFields = (p: string, ref: string): FieldDef[] => [
  f(`${p}_gskType`, `${ref}.1`, "Gasket Type", "select", {
    options: ["Spiral Wound", "CAF", "Graphite", "PTFE", "Metal Jacket", "Ring Joint"],
    width: 110,
    showWhen: { key: `${p}_gsk`, equals: ["Yes"] },
  }),
  f(`${p}_gskThk`, `${ref}.2`, "Gasket Thk", "number", { unit: "mm", width: 70, showWhen: { key: `${p}_gsk`, equals: ["Yes"] } }),
  {
    ...matField(`${p}_gskMat`, `${ref}.3`, "Gasket Material", "gasket", 118),
    showWhen: { key: `${p}_gsk`, equals: ["Yes"] },
  },
  f(`${p}_gskSpare`, `${ref}.4`, "Spare %", "number", { unit: "%", width: 64, showWhen: { key: `${p}_gsk`, equals: ["Yes"] } }),
];

const boltFields = (p: string, ref: string): FieldDef[] => [
  f(`${p}_boltType`, `${ref}.1`, "Type", "select", { options: ["UNC", "BSW", "Metric"], width: 74, showWhen: { key: `${p}_bolt`, equals: ["Yes"] } }),
  f(`${p}_boltSpare`, `${ref}.2`, "Spare in %", "number", { unit: "%", width: 70, showWhen: { key: `${p}_bolt`, equals: ["Yes"] } }),
];

const boltNut = (p: string, ref: string, label = "Bolt-Nut") =>
  yesNo(`${p}_bolt`, ref, label);

// Nozzle / Boot / Skirt-opening material sub-block (1.3.8)
const nozzleMaterialFields: FieldDef[] = [
  matField("noz_pipeMat", "1.3.8.1", "Pipe Material", "pipe", 128),
  matField("noz_flgMat", "1.3.8.2", "Flange Material", "forging", 128),
  matField("noz_blindMat", "1.3.8.3", "Blind Flange Material", "forging", 128),
  matField("noz_padMat", "1.3.8.4", "RF Pad Material", "plate", 128),
  boltMatField("noz_boltMat", "1.3.8.5", "Bolt Material", "bolt"),
  boltMatField("noz_nutMat", "1.3.8.6", "Nut Material", "nut"),
  boltMatField("noz_washerMat", "1.3.8.7", "Washer Material", "washer"),
  matField("noz_gskMat", "1.3.8.8", "Gasket Material", "gasket", 128),
  matField("noz_rolledMat", "1.3.8.9", "Rolled Plate Pipe Matl", "plate", 132),
  matField("noz_soMat", "1.3.8.10", "Slip-On Flange Matl", "forging", 132),
];

export const PART_DEFS: PartDef[] = [
  {
    key: "shell",
    ref: "1.1",
    label: "Shell",
    rowLabel: "Shell Segment",
    idPrefix: "PV-S",
    section: "main",
    defaultRows: 1,
    maxRows: 6,
    fields: [
      ...claddFields("sh", "1.1.1"),
      f("sh_id", "1.1.2", "ID", "number", { unit: "mm" }),
      f("sh_thk", "1.1.3", "Shell Thk", "number", { unit: "mm" }),
      f("sh_len", "1.1.4", "Length", "number", { unit: "mm" }),
      matField("sh_mat", "1.1.4.2", "Matl.Spec.", "plate"),
      yesNo("sh_stiff", "1.1.5", "Stiffener"),
      f("sh_stiffW", "1.1.5.1", "Stiff. Width", "number", { unit: "mm", showWhen: { key: "sh_stiff", equals: ["Yes"] } }),
      f("sh_stiffOd", "1.1.5.1.2", "Stiff. OD", "number", { unit: "mm", showWhen: { key: "sh_stiff", equals: ["Yes"] } }),
      f("sh_stiffThk", "1.1.5.1.3", "Stiff. Thk", "number", { unit: "mm", showWhen: { key: "sh_stiff", equals: ["Yes"] } }),
      f("sh_stiffQty", "1.1.5.1.4", "Stiff. Qty", "number", { unit: "no", showWhen: { key: "sh_stiff", equals: ["Yes"] } }),
      yesNo("sh_topPlate", "1.1.6", "Top Plate"),
      yesNo("sh_botPlate", "1.1.7", "Bottom Plate"),
      yesNo("sh_baseRing", "1.1.8", "Base Ring"),
    ],
  },
  {
    key: "head",
    ref: "1.2",
    label: "Vessel Head",
    rowLabel: "Vessel Head",
    idPrefix: "PV-H",
    section: "main",
    defaultRows: 2,
    maxRows: 4,
    fields: [
      ...claddFields("hd", "1.2.1"),
      f("hd_id", "1.2.2", "ID", "number", { unit: "mm" }),
      f("hd_nomThk", "1.2.3", "Nom Thk", "number", { unit: "mm" }),
      f("hd_minThk", "1.2.4", "Min Thk", "number", { unit: "mm" }),
      matField("hd_mat", "1.2.5", "Matl.Spec.", "plate"),
      f("hd_type", "1.2.6", "Head Type", "select", { options: ["2:1 Ellipsoidal", "Torispherical (F&D)", "Hemispherical", "Flat (UG-34)", "Conical"], width: 140 }),
    ],
  },
  {
    key: "nozzle",
    ref: "1.3",
    label: "Nozzle",
    rowLabel: "Nozzle",
    idPrefix: "PV-N",
    section: "main",
    defaultRows: 4,
    maxRows: 30,
    fields: [
      ...claddFields("nz", "1.3.1"),
      f("nz_cat", "1.3.2", "Category", "select", { options: ["ISRS-Std", "A", "B", "C", "D"], width: 84 }),
      f("nz_size", "1.3.3", "Size", "select", { options: NPS_LIST, width: 80 }),
      f("nz_sch", "1.3.4", "Schedule", "select", { options: SCHEDULE_LIST, width: 84 }),
      f("nz_pipeThk", "1.3.5", "Pipe Thk", "number", { unit: "mm" }),
      f("nz_face", "1.3.6", "Face Type", "select", { options: FACE_TYPES, width: 74 }),
      f("nz_length", "1.3.7", "Length", "number", { unit: "mm" }),
      f("nz_type", "1.3.7.1", "Type", "select", { options: NOZZLE_TYPES, width: 110 }),
      f("nz_rating", "1.3.9", "Rating", "select", { options: RATING_LIST, width: 80 }),
      ...nozzleMaterialFields,
      yesNo("nz_blind", "1.3.9.2", "Blind Flange"),
      f("nz_blindThk", "1.3.9.1", "Blind Flg Thk", "number", { unit: "mm", showWhen: { key: "nz_blind", equals: ["Yes"] } }),
      yesNo("nz_pad", "1.3.10", "RF Pad"),
      f("nz_padThk", "1.3.10.1", "Pad Thk", "number", { unit: "mm", width: 74, showWhen: { key: "nz_pad", equals: ["Yes"] } }),
      f("nz_padId", "1.3.10.2", "Pad ID", "number", { unit: "mm", width: 74, showWhen: { key: "nz_pad", equals: ["Yes"] } }),
      f("nz_padOd", "1.3.10.3", "Pad OD", "number", { unit: "mm", width: 74, showWhen: { key: "nz_pad", equals: ["Yes"] } }),
      yesNo("nz_elbow", "1.3.11", "Elbow"),
      f("nz_elbowR", "1.3.11.1", "Elbow Radius", "number", { unit: "mm", width: 90, showWhen: { key: "nz_elbow", equals: ["Yes"] } }),
      f("nz_elbowAngle", "1.3.11.2", "Angle", "select", { options: ["45", "90", "180"], width: 70, showWhen: { key: "nz_elbow", equals: ["Yes"] } }),
      boltNut("nz", "1.3.12", "Bolt-Nut"),
      ...boltFields("nz", "1.3.12"),
      yesNo("nz_gsk", "1.3.13", "Gasket"),
      ...gasketFields("nz", "1.3.13"),
      yesNo("nz_soFlg", "1.3.14", "SlipOn Flange"),
      f("nz_soThk", "1.3.14.1", "SO Flg Thk", "number", { unit: "mm", width: 84, showWhen: { key: "nz_soFlg", equals: ["Yes"] } }),
    ],
  },
  {
    key: "manway",
    ref: "1.4",
    label: "Manways",
    rowLabel: "Manway",
    idPrefix: "PV-M",
    section: "main",
    defaultRows: 2,
    maxRows: 8,
    fields: [
      f("mw_size", "1.4.1", "Size", "select", { options: NPS_LIST, width: 80 }),
      f("mw_rating", "1.4.2", "Rating", "select", { options: RATING_LIST, width: 80 }),
      matField("mw_mat", "1.4.3", "Matl.Spec.", "forging"),
      yesNo("mw_torque", "1.4.4", "Torque Valve"),
      boltNut("mw", "1.4.5", "Bolt-Nut"),
      ...boltFields("mw", "1.4.5"),
      yesNo("mw_gsk", "1.4.6", "Gasket"),
      ...gasketFields("mw", "1.4.6"),
      yesNo("mw_davit", "1.4.7", "Davit"),
    ],
  },
  {
    key: "support",
    ref: "1.5",
    label: "External Support",
    rowLabel: "External Support",
    idPrefix: "PV-EXT",
    section: "supporting",
    defaultRows: 1,
    maxRows: 4,
    fields: [
      yesNo("su_saddle", "1.5.1", "Saddle"),
      f("su_saddleQty", "1.5.1.1", "Saddle Qty", "number", { unit: "no", width: 84, showWhen: { key: "su_saddle", equals: ["Yes"] } }),
      f("su_saddleH", "1.5.1.2", "Saddle Height", "number", { unit: "mm", width: 96, showWhen: { key: "su_saddle", equals: ["Yes"] } }),
      yesNo("su_skirt", "1.5.2", "Skirt"),
      f("su_skirtH", "1.5.2.1", "Skirt Height", "number", { unit: "mm", width: 96, showWhen: { key: "su_skirt", equals: ["Yes"] } }),
      f("su_skirtThk", "1.5.2.2", "Skirt Thk", "number", { unit: "mm", width: 84, showWhen: { key: "su_skirt", equals: ["Yes"] } }),
      yesNo("su_leg", "1.5.3", "Leg Support"),
      f("su_legQty", "1.5.3.1", "Leg Qty", "number", { unit: "no", width: 74, showWhen: { key: "su_leg", equals: ["Yes"] } }),
      f("su_legSize", "1.5.3.2", "Leg Size", "select", { options: ["L50x50x5", "L65x65x6", "L75x75x8", "L100x100x10", 'Pipe 4" Sch40', 'Pipe 6" Sch40'], width: 110, showWhen: { key: "su_leg", equals: ["Yes"] } }),
    ],
  },
  {
    key: "ladder",
    ref: "1.6",
    label: "Ladders",
    rowLabel: "Ladder",
    idPrefix: "PV-LDR",
    section: "supporting",
    defaultRows: 1,
    maxRows: 3,
    fields: [
      f("ld_monkey", "1.6.1", "Monkey Ladder", "number", { unit: "mm" }),
      f("ld_stairs", "1.6.2", "Stairs", "number", { unit: "mm" }),
    ],
  },
  {
    key: "platform",
    ref: "1.7",
    label: "Platforms",
    rowLabel: "Platform",
    idPrefix: "PV-PLT",
    section: "supporting",
    defaultRows: 1,
    maxRows: 4,
    fields: [f("pf_area", "1.7.1", "Platform Area", "number", { unit: "sq.m" })],
  },
  {
    key: "rungs",
    ref: "1.8",
    label: "Internal Rungs",
    rowLabel: "Rung",
    idPrefix: "PV-RNG",
    section: "internal",
    defaultRows: 1,
    maxRows: 4,
    fields: [
      f("rn_dia", "1.8.1", "Rod Dia", "number", { unit: "mm" }),
      f("rn_len", "1.8.2", "Rod Length", "number", { unit: "mm" }),
      matField("rn_mat", "1.8.3", "Material", "plate", 120),
      f("rn_qty", "1.8.4", "Qty", "number", { unit: "no" }),
    ],
  },
  {
    key: "baffle",
    ref: "1.9",
    label: "Baffles / Trays",
    rowLabel: "Baffle / Tray",
    idPrefix: "PV-BFL",
    section: "internal",
    defaultRows: 1,
    maxRows: 4,
    fields: [
      f("bf_kind", "1.9.0", "Item", "select", { options: ["Tray", "Baffle", "Distributor", "Support ring"], width: 96 }),
      f("bf_dia", "1.9.0.1", "Dia", "number", { unit: "mm" }),
      f("bf_thk", "1.9.1", "Baffle/Tray Thk", "number", { unit: "mm" }),
      matField("bf_mat", "1.9.2", "Material", "plate", 120),
      f("bf_qty", "1.9.3", "Qty", "number", { unit: "no" }),
    ],
  },
  {
    key: "demister",
    ref: "1.10",
    label: "Demisters",
    rowLabel: "Demister",
    idPrefix: "PV-DMS",
    section: "internal",
    defaultRows: 1,
    maxRows: 2,
    fields: [
      f("dm_thk", "1.10.1", "Demister Thk", "number", { unit: "mm" }),
      f("dm_dia", "1.10.2", "Demister Dia", "number", { unit: "mm" }),
      matField("dm_mat", "1.10.3", "Material", "plate", 120),
    ],
  },
  {
    key: "coalescer",
    ref: "1.11",
    label: "Coalescers",
    rowLabel: "Coalescer",
    idPrefix: "PV-COA",
    section: "internal",
    defaultRows: 1,
    maxRows: 2,
    fields: [
      f("co_thk", "1.11.1", "Coalescer Pack Thk", "number", { unit: "mm" }),
      f("co_dia", "1.11.2", "Coalescer Dia", "number", { unit: "mm" }),
    ],
  },
  {
    key: "vortex",
    ref: "1.12",
    label: "Vortex Breaker",
    rowLabel: "Vortex Breaker",
    idPrefix: "PV-VTX",
    section: "internal",
    defaultRows: 1,
    maxRows: 2,
    fields: [
      f("vx_dia", "1.12.1", "Nozzle Dia", "select", { options: NPS_LIST, width: 80 }),
      f("vx_thk", "1.12.2", "Plate Thickness", "number", { unit: "mm" }),
      f("vx_h", "1.12.3", "Plate Height", "number", { unit: "mm" }),
    ],
  },
  {
    key: "boot",
    ref: "1.13",
    label: "Boot",
    rowLabel: "Boot",
    idPrefix: "PV-BT",
    section: "main",
    defaultRows: 1,
    maxRows: 2,
    fields: [
      f("bt_cap", "1.13.1", "Cap Type", "select", { options: ["Ellipsoidal", "Torispherical", "Flat", "Dished"], width: 110 }),
      f("bt_size", "1.13.2", "Size", "select", { options: NPS_LIST, width: 80 }),
      f("bt_sch", "1.13.3", "Schedule", "select", { options: SCHEDULE_LIST, width: 84 }),
      matField("bt_mat", "1.13.4", "Material", "pipe", 120),
      yesNo("bt_rolled", "1.13.4.1", "From Rolled Plate"),
      f("bt_plate", "1.13.4.1.1", "Plate Thk", "number", { unit: "mm", width: 84, showWhen: { key: "bt_rolled", equals: ["Yes"] } }),
      f("bt_width", "1.13.4.1.2", "Width", "number", { unit: "mm", width: 84, showWhen: { key: "bt_rolled", equals: ["Yes"] } }),
      f("bt_length", "1.13.4.1.3", "Length", "number", { unit: "mm", width: 84, showWhen: { key: "bt_rolled", equals: ["Yes"] } }),
      yesNo("bt_pad", "1.13.5", "RF Pad"),
      f("bt_padThk", "1.13.5.1", "Pad Thk", "number", { unit: "mm", width: 78, showWhen: { key: "bt_pad", equals: ["Yes"] } }),
      f("bt_padId", "1.13.5.2", "Pad ID", "number", { unit: "mm", width: 78, showWhen: { key: "bt_pad", equals: ["Yes"] } }),
      f("bt_padOd", "1.13.5.3", "Pad OD", "number", { unit: "mm", width: 78, showWhen: { key: "bt_pad", equals: ["Yes"] } }),
    ],
  },
  {
    key: "skirtOpening",
    ref: "1.14",
    label: "Skirt Opening",
    rowLabel: "Skirt Opening",
    idPrefix: "PV-SO",
    section: "supporting",
    defaultRows: 1,
    maxRows: 4,
    fields: [
      f("so_size", "1.14.1", "Size", "select", { options: NPS_LIST, width: 80 }),
      f("so_sch", "1.14.2", "Schedule", "select", { options: SCHEDULE_LIST, width: 84 }),
      matField("so_mat", "1.14.3", "Material", "pipe", 120),
    ],
  },
];

export const PART_BY_KEY: Record<string, PartDef> = Object.fromEntries(
  PART_DEFS.map((p) => [p.key, p]),
);

export function defaultRow(partKey: string): Record<string, string> {
  const def = PART_BY_KEY[partKey];
  const row: Record<string, string> = {};
  for (const fld of def.fields) {
    row[fld.key] =
      fld.type === "yesno" ? (fld.key.includes("_cladd") || fld.key.includes("_gsk") ? "No" : "No")
        : fld.type === "select" ? (fld.options?.[0] ?? "")
        : "";
  }
  return row;
}

export function schedulesOf(nps: string) {
  return schedulesFor(nps);
}
