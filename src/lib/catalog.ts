// ---------------------------------------------------------------------------
// Engineering catalogue: materials, pipe schedules, flange masses, rates
// All masses / rates are indicative estimating values and are intentionally
// editable inside the application.
// ---------------------------------------------------------------------------

export type MaterialForm = "plate" | "pipe" | "forging" | "bolting" | "gasket" | "structural";

export interface Material {
  name: string;
  form: MaterialForm;
  spec: string;
  density: number; // kg/m3
  /** allowable stress vs temperature [degC, MPa] — ASME II-D Section values */
  allowable: [number, number][];
  /** estimated yield strength at temperature (MPa) */
  yield: [number, number][];
  modulus: number; // MPa at ambient
  ss: boolean;
  rate: number; // BHD/kg
}

export const MATERIALS: Material[] = [
  {
    name: "SA-516 Gr.70",
    form: "plate",
    spec: "Carbon steel plate",
    density: 7850,
    allowable: [
      [40, 138], [100, 138], [150, 138], [200, 138], [250, 138],
      [300, 132], [350, 123], [400, 112], [450, 100],
    ],
    yield: [
      [40, 260], [100, 260], [150, 243], [200, 229], [250, 216],
      [300, 202], [350, 190], [400, 178], [450, 165],
    ],
    modulus: 200000,
    ss: false,
    rate: 0.42,
  },
  {
    name: "SA-36",
    form: "plate",
    spec: "Carbon steel plate",
    density: 7850,
    allowable: [
      [40, 117], [100, 117], [150, 117], [200, 117], [250, 117],
      [300, 114], [350, 108], [400, 100],
    ],
    yield: [[40, 250], [200, 220], [300, 195], [400, 170]],
    modulus: 200000,
    ss: false,
    rate: 0.341,
  },
  {
    name: "SA-240 Gr.304",
    form: "plate",
    spec: "Stainless plate",
    density: 8000,
    allowable: [
      [40, 138], [100, 138], [150, 130], [200, 122], [250, 116],
      [300, 110], [350, 106], [400, 102], [450, 98],
    ],
    yield: [[40, 205], [200, 155], [300, 135], [400, 120]],
    modulus: 195000,
    ss: true,
    rate: 1.794,
  },
  {
    name: "SA-240 Gr.304L",
    form: "plate",
    spec: "Stainless plate",
    density: 8000,
    allowable: [
      [40, 115], [100, 115], [150, 110], [200, 103], [250, 98],
      [300, 94], [350, 90], [400, 87], [450, 84],
    ],
    yield: [[40, 170], [200, 130], [300, 115], [400, 100]],
    modulus: 195000,
    ss: true,
    rate: 1.881,
  },
  {
    name: "SA-240 Gr.316L",
    form: "plate",
    spec: "Stainless plate",
    density: 8000,
    allowable: [
      [40, 115], [100, 115], [150, 115], [200, 109], [250, 103],
      [300, 98], [350, 94], [400, 91], [450, 88],
    ],
    yield: [[40, 170], [200, 135], [300, 120], [400, 105]],
    modulus: 195000,
    ss: true,
    rate: 2.45,
  },
  {
    name: "SA-106 Gr.B",
    form: "pipe",
    spec: "Carbon steel pipe",
    density: 7850,
    allowable: [
      [40, 118], [100, 118], [150, 118], [200, 118], [250, 118],
      [300, 115], [350, 110], [400, 104],
    ],
    yield: [[40, 240], [200, 205], [300, 185], [400, 165]],
    modulus: 200000,
    ss: false,
    rate: 0.577,
  },
  {
    name: "SA-312 TP304L",
    form: "pipe",
    spec: "Stainless pipe",
    density: 8000,
    allowable: [
      [40, 115], [100, 115], [150, 110], [200, 103], [250, 98],
      [300, 94], [350, 90],
    ],
    yield: [[40, 170], [200, 130], [300, 115]],
    modulus: 195000,
    ss: true,
    rate: 2.8,
  },
  {
    name: "SA-312 TP316L",
    form: "pipe",
    spec: "Stainless pipe",
    density: 8000,
    allowable: [
      [40, 115], [100, 115], [150, 115], [200, 109], [250, 103],
      [300, 98], [350, 94],
    ],
    yield: [[40, 170], [200, 135], [300, 120]],
    modulus: 195000,
    ss: true,
    rate: 3.15,
  },
  {
    name: "SA-387 Gr.11 Cl.2",
    form: "plate",
    spec: "Alloy plate (1.25Cr-0.5Mo)",
    density: 7850,
    allowable: [
      [40, 138], [200, 138], [300, 132], [400, 122], [450, 116],
      [500, 106], [550, 90],
    ],
    yield: [[40, 310], [300, 240], [450, 200], [550, 150]],
    modulus: 200000,
    ss: false,
    rate: 1.028,
  },
  {
    name: "SA-105",
    form: "forging",
    spec: "Carbon steel forging (flanges)",
    density: 7850,
    allowable: [
      [40, 138], [100, 138], [150, 138], [200, 138], [250, 138],
      [300, 132], [350, 123], [400, 112],
    ],
    yield: [[40, 248], [200, 220], [300, 195], [400, 170]],
    modulus: 200000,
    ss: false,
    rate: 0.678,
  },
  {
    name: "SA-203 Gr.E",
    form: "plate",
    spec: "Low temp nickel plate",
    density: 7850,
    allowable: [[40, 138], [100, 138], [200, 138], [300, 132], [400, 110]],
    yield: [[40, 310], [200, 280], [400, 210]],
    modulus: 200000,
    ss: false,
    rate: 1.312,
  },
  {
    name: "SA-516 Gr.60",
    form: "plate",
    spec: "Carbon steel plate",
    density: 7850,
    allowable: [
      [40, 118], [100, 118], [150, 118], [200, 118], [250, 118],
      [300, 115], [350, 110], [400, 100],
    ],
    yield: [[40, 220], [200, 195], [300, 180], [400, 160]],
    modulus: 200000,
    ss: false,
    rate: 0.402,
  },
  {
    name: "SA-240 Gr.321",
    form: "plate",
    spec: "Stainless plate",
    density: 8000,
    allowable: [
      [40, 138], [100, 138], [150, 133], [200, 127], [250, 121],
      [300, 115], [350, 111], [400, 106],
    ],
    yield: [[40, 205], [200, 160], [300, 140], [400, 125]],
    modulus: 195000,
    ss: true,
    rate: 2.275,
  },
  {
    name: "SA-53 Gr.B",
    form: "pipe",
    spec: "Carbon steel pipe",
    density: 7850,
    allowable: [
      [40, 118], [100, 118], [150, 118], [200, 118], [250, 118],
      [300, 115], [350, 110], [400, 104],
    ],
    yield: [[40, 240], [200, 205], [300, 185], [400, 165]],
    modulus: 200000,
    ss: false,
    rate: 0.472,
  },
  {
    name: "SA-333 Gr.6",
    form: "pipe",
    spec: "Low temp carbon pipe",
    density: 7850,
    allowable: [[40, 118], [100, 118], [150, 118], [200, 118], [300, 115]],
    yield: [[40, 240], [200, 205], [300, 185]],
    modulus: 200000,
    ss: false,
    rate: 0.735,
  },
  {
    name: "SA-335 P11",
    form: "pipe",
    spec: "Alloy pipe (1.25Cr-0.5Mo)",
    density: 7850,
    allowable: [
      [40, 138], [200, 138], [300, 132], [400, 122], [450, 116],
      [500, 106], [550, 90],
    ],
    yield: [[40, 310], [300, 240], [450, 200], [550, 150]],
    modulus: 200000,
    ss: false,
    rate: 1.247,
  },
  {
    name: "SA-182 F304",
    form: "forging",
    spec: "Stainless forging (flanges)",
    density: 8000,
    allowable: [
      [40, 138], [100, 138], [150, 130], [200, 122], [250, 116],
      [300, 110], [350, 106], [400, 102],
    ],
    yield: [[40, 205], [200, 155], [300, 135], [400, 120]],
    modulus: 195000,
    ss: true,
    rate: 2.45,
  },
  {
    name: "SA-182 F316",
    form: "forging",
    spec: "Stainless forging (flanges)",
    density: 8000,
    allowable: [
      [40, 138], [100, 120], [150, 116], [200, 110], [250, 106],
      [300, 101], [350, 98], [400, 95],
    ],
    yield: [[40, 205], [200, 170], [300, 145], [400, 130]],
    modulus: 195000,
    ss: true,
    rate: 3.15,
  },
  {
    name: "SA-350 LF2",
    form: "forging",
    spec: "Low temp forging (flanges)",
    density: 7850,
    allowable: [[40, 138], [100, 138], [150, 138], [200, 138], [300, 132]],
    yield: [[40, 250], [200, 220], [300, 195]],
    modulus: 200000,
    ss: false,
    rate: 0.766,
  },
  {
    name: "SA-182 F11",
    form: "forging",
    spec: "Alloy forging (1.25Cr-0.5Mo)",
    density: 7850,
    allowable: [
      [40, 138], [200, 138], [300, 132], [400, 122], [450, 116],
      [500, 106], [550, 90],
    ],
    yield: [[40, 310], [300, 240], [450, 200], [550, 150]],
    modulus: 200000,
    ss: false,
    rate: 1.444,
  },
  {
    name: "SA-266 Gr.2",
    form: "forging",
    spec: "Carbon steel forging (flanges)",
    density: 7850,
    allowable: [[40, 138], [100, 138], [150, 138], [200, 138], [300, 132]],
    yield: [[40, 250], [200, 220], [300, 195]],
    modulus: 200000,
    ss: false,
    rate: 0.656,
  },
];

// ---------------------------------------------------------------------------
// Material selection by product form. Every material is offered only where the
// relevant ASME/ASTM specification allows that form, so a plate spec never
// appears against a bolting or flange item and vice-versa.
// ---------------------------------------------------------------------------

export const MATERIAL_FORM_INFO: Record<
  MaterialForm,
  { label: string; standard: string; blurb: string }
> = {
  plate: {
    label: "Plate / sheet",
    standard: "ASME II-A · SA-20, SA-516, SA-240, SA-387",
    blurb: "Shell, heads, pads, baffles, internals",
  },
  pipe: {
    label: "Pipe / tube",
    standard: "ASME II-A · B36.10 / B36.19 · SA-106, SA-312, SA-335",
    blurb: "Nozzle necks, boot, skirt openings",
  },
  forging: {
    label: "Forging",
    standard: "ASME II-A · SA-105, SA-182, SA-266, SA-350",
    blurb: "Flanges, blind flanges, manway necks",
  },
  bolting: {
    label: "Bolting",
    standard: "ASME II-A · SA-193, SA-194, SA-320 · B18.2.1",
    blurb: "Bolts, studs, nuts, washers",
  },
  gasket: {
    label: "Gasket",
    standard: "ASME B16.20 / B16.21",
    blurb: "Spiral wound, RTJ, sheet gaskets",
  },
  structural: {
    label: "Structural",
    standard: "ASTM A36 / A992 · IS 2062",
    blurb: "Legs, ladders, platforms, supports",
  },
};

export const BOLT_MATERIALS = [
  "SA-193 B7",
  "SA-193 B16",
  "SA-193 B8",
  "SA-193 B8M",
  "SA-320 L7",
  "SA-320 L7M",
  "A307 Gr.B",
  "A325 Type 1",
];

export const NUT_MATERIALS = [
  "SA-194 2H",
  "SA-194 4",
  "SA-194 7",
  "SA-194 8",
  "SA-194 8M",
  "A563 Gr.A",
];

export const WASHER_MATERIALS = [
  "F436 Hardened",
  "SA-240 Gr.304",
  "SA-240 Gr.316L",
  "CS Zinc Plated",
];

export const GASKET_MATERIALS = [
  "SS316L + Graphite",
  "SS316L + PTFE",
  "CS + Graphite",
  "PTFE",
  "CAF (Non-asbestos)",
  "RTJ Soft Iron",
  "RTJ SS316",
];

export const STRUCTURAL_MATERIALS = ["IS 2062 E250", "ASTM A36", "IS 2062 E350"];

/** Names offered for a given product form (materials + catalogue-only lists). */
export function materialsFor(form: MaterialForm): string[] {
  switch (form) {
    case "bolting":
      return [...BOLT_MATERIALS, ...NUT_MATERIALS, ...WASHER_MATERIALS];
    case "gasket":
      return GASKET_MATERIALS;
    case "structural":
      return STRUCTURAL_MATERIALS;
    default:
      return MATERIALS.filter((m) => m.form === form).map((m) => m.name);
  }
}

/** Grouped option list: one optgroup per material family, labelled with its spec. */
export function materialGroups(form: MaterialForm): { label: string; options: string[] }[] {
  if (form === "bolting") {
    return [
      { label: "ASME II-A · SA-193 / SA-320 bolts & studs", options: BOLT_MATERIALS },
      { label: "ASME II-A · SA-194 / A563 nuts", options: NUT_MATERIALS },
      { label: "ASTM F436 · washers", options: WASHER_MATERIALS },
    ];
  }
  if (form === "gasket") {
    return [{ label: MATERIAL_FORM_INFO.gasket.standard, options: GASKET_MATERIALS }];
  }
  if (form === "structural") {
    return [{ label: MATERIAL_FORM_INFO.structural.standard, options: STRUCTURAL_MATERIALS }];
  }
  const families = new Map<string, string[]>();
  for (const m of MATERIALS.filter((x) => x.form === form)) {
    families.set(m.spec, [...(families.get(m.spec) ?? []), m.name]);
  }
  return [...families.entries()].map(([label, options]) => ({ label, options }));
}

export function materialForm(name: string): MaterialForm | undefined {
  const m = MATERIALS.find((x) => x.name === name);
  if (m) return m.form;
  if (GASKET_MATERIALS.includes(name)) return "gasket";
  if (STRUCTURAL_MATERIALS.includes(name)) return "structural";
  if ([...BOLT_MATERIALS, ...NUT_MATERIALS, ...WASHER_MATERIALS].includes(name)) return "bolting";
  return undefined;
}

export function materialByName(name: string): Material {
  return MATERIALS.find((m) => m.name === name) ?? MATERIALS[0];
}

function interp(table: [number, number][], temp: number): number {
  if (temp <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (temp <= table[i][0]) {
      const [t0, v0] = table[i - 1];
      const [t1, v1] = table[i];
      return v0 + ((v1 - v0) * (temp - t0)) / (t1 - t0);
    }
  }
  return table[table.length - 1][1];
}

export const allowableStress = (m: Material, temp: number) => interp(m.allowable, temp);
export const yieldStress = (m: Material, temp: number) => interp(m.yield, temp);

// ---------------------------------------------------------------------------
// Pipe schedule data (ASME B36.10 / B36.19)
// ---------------------------------------------------------------------------

export interface PipeSize {
  nps: string;
  od: number; // mm
  wall: Record<string, number>; // schedule -> mm
}

export const PIPE_SIZES: PipeSize[] = [
  { nps: '1/2"', od: 21.3, wall: { "10S": 2.11, "40S": 2.77, "80S": 3.73, "10": 2.11, "40": 2.77, STD: 2.77, "80": 3.73, XS: 3.73, "160": 4.78, XXS: 7.47 } },
  { nps: '3/4"', od: 26.7, wall: { "10S": 2.11, "40S": 2.87, "80S": 3.91, "40": 2.87, STD: 2.87, "80": 3.91, XS: 3.91, "160": 5.56, XXS: 7.82 } },
  { nps: '1"', od: 33.4, wall: { "10S": 2.77, "40S": 3.38, "80S": 4.55, "40": 3.38, STD: 3.38, "80": 4.55, XS: 4.55, "160": 6.35, XXS: 9.09 } },
  { nps: '1.1/2"', od: 48.3, wall: { "10S": 2.77, "40S": 3.68, "80S": 5.08, "40": 3.68, STD: 3.68, "80": 5.08, XS: 5.08, "160": 7.14, XXS: 10.15 } },
  { nps: '2"', od: 60.3, wall: { "10S": 2.77, "40S": 3.91, "80S": 5.54, "10": 2.77, "40": 3.91, STD: 3.91, "80": 5.54, XS: 5.54, "160": 8.74, XXS: 11.07 } },
  { nps: '2.1/2"', od: 73.0, wall: { "10S": 3.05, "40S": 5.16, "80S": 7.01, "40": 5.16, STD: 5.16, "80": 7.01, XS: 7.01, "160": 9.53, XXS: 14.02 } },
  { nps: '3"', od: 88.9, wall: { "10S": 3.05, "40S": 5.49, "80S": 7.62, "10": 3.05, "40": 5.49, STD: 5.49, "80": 7.62, XS: 7.62, "160": 11.13, XXS: 15.24 } },
  { nps: '4"', od: 114.3, wall: { "10S": 3.05, "40S": 6.02, "80S": 8.56, "10": 3.05, "40": 6.02, STD: 6.02, "80": 8.56, XS: 8.56, "120": 11.13, "160": 13.49, XXS: 17.12 } },
  { nps: '5"', od: 141.3, wall: { "10S": 3.4, "40S": 6.55, "80S": 9.53, "40": 6.55, STD: 6.55, "80": 9.53, XS: 9.53, "120": 12.7, "160": 15.88, XXS: 19.05 } },
  { nps: '6"', od: 168.3, wall: { "10S": 3.4, "40S": 7.11, "80S": 10.97, "10": 3.4, "40": 7.11, STD: 7.11, "80": 10.97, XS: 10.97, "120": 14.27, "160": 18.26, XXS: 21.95 } },
  { nps: '8"', od: 219.1, wall: { "10S": 3.76, "20S": 6.35, "40S": 8.18, "80S": 12.7, "10": 3.76, "20": 6.35, "30": 7.04, "40": 8.18, STD: 8.18, "60": 10.31, "80": 12.7, XS: 12.7, "100": 15.09, "120": 18.26, "160": 23.01, XXS: 22.23 } },
  { nps: '10"', od: 273.1, wall: { "10S": 4.19, "20S": 6.35, "40S": 9.27, "80S": 15.09, "10": 4.19, "20": 6.35, "30": 7.8, "40": 9.27, STD: 9.27, "60": 12.7, "80": 15.09, XS: 12.7, "100": 18.26, "120": 21.44, "160": 28.58, XXS: 25.4 } },
  { nps: '12"', od: 323.9, wall: { "10S": 4.57, "20S": 6.35, "40S": 10.31, "80S": 17.48, "10": 4.57, "20": 6.35, "30": 8.38, "40": 10.31, STD: 9.53, "60": 14.27, "80": 17.48, XS: 12.7, "100": 21.44, "120": 25.4, "160": 33.32, XXS: 25.4 } },
  { nps: '14"', od: 355.6, wall: { "10": 6.35, "20": 7.92, "30": 9.53, "40": 11.13, STD: 9.53, "60": 15.09, "80": 19.05, XS: 12.7, "100": 23.83, "120": 27.79, "160": 35.71 } },
  { nps: '16"', od: 406.4, wall: { "10": 6.35, "20": 7.92, "30": 9.53, "40": 12.7, STD: 9.53, "60": 16.66, "80": 21.44, XS: 12.7, "100": 26.19, "120": 30.96, "160": 40.49 } },
  { nps: '18"', od: 457.0, wall: { "10": 6.35, "20": 7.92, "30": 11.13, "40": 14.27, STD: 9.53, "60": 19.05, "80": 23.83, XS: 12.7, "100": 29.36, "120": 34.93, "160": 45.24 } },
  { nps: '20"', od: 508.0, wall: { "10": 6.35, "20": 9.53, "30": 12.7, "40": 15.09, STD: 9.53, "60": 20.62, "80": 26.19, XS: 12.7, "100": 32.54, "120": 38.1, "160": 50.01 } },
  { nps: '24"', od: 609.6, wall: { "10": 6.35, "20": 9.53, "30": 14.27, "40": 17.48, STD: 9.53, "60": 24.61, "80": 30.96, XS: 12.7, "100": 38.89, "120": 46.02, "160": 59.54 } },
  // B36.10 stops the small-schedule ladder above NPS 24; large nozzles use
  // STD / XS wall only. Flanges above NPS 24 are B16.47, outside this rate book.
  { nps: '26"', od: 660.4, wall: { "10": 6.35, "20": 9.53, STD: 9.53, "30": 12.7, XS: 12.7 } },
  { nps: '28"', od: 711.2, wall: { "10": 6.35, "20": 9.53, STD: 9.53, "30": 12.7, XS: 12.7 } },
];

export const NPS_LIST = PIPE_SIZES.map((p) => p.nps);
export const SCHEDULE_LIST = [
  "10S", "20S", "40S", "80S", "10", "20", "30", "40", "STD", "60", "80", "XS", "100", "120", "160", "XXS",
];

export function pipeOd(nps: string): number {
  return PIPE_SIZES.find((p) => p.nps === nps)?.od ?? 0;
}

export function pipeWall(nps: string, schedule: string): number {
  return PIPE_SIZES.find((p) => p.nps === nps)?.wall[schedule] ?? 0;
}

export function schedulesFor(nps: string): string[] {
  const p = PIPE_SIZES.find((x) => x.nps === nps);
  return p ? Object.keys(p.wall) : SCHEDULE_LIST;
}

// ---------------------------------------------------------------------------
// Flange / fitting indicative masses (kg). WN RF, per ASME B16.5 approximate.
// ---------------------------------------------------------------------------

export const FLANGE_MASS: Record<string, Record<string, number>> = {
  '1/2"': { "150": 0.7, "300": 0.9, "600": 1.2, "900": 1.6, "1500": 1.9, "2500": 2.6 },
  '3/4"': { "150": 0.9, "300": 1.2, "600": 1.7, "900": 2.3, "1500": 2.9, "2500": 4.1 },
  '1"': { "150": 1.3, "300": 1.6, "600": 2.3, "900": 3.1, "1500": 4.2, "2500": 6.4 },
  '1.1/2"': { "150": 1.8, "300": 2.6, "600": 3.6, "900": 5.0, "1500": 6.9, "2500": 10.5 },
  '2"': { "150": 2.5, "300": 3.6, "600": 5.0, "900": 7.1, "1500": 9.8, "2500": 15.5 },
  '2.1/2"': { "150": 4.5, "300": 5.4, "600": 8.1, "900": 13.9, "1500": 16.2, "2500": 23.4 },
  '3"': { "150": 4.5, "300": 7.3, "600": 10.0, "900": 15.0, "1500": 21.5, "2500": 34.0 },
  '4"': { "150": 6.8, "300": 11.0, "600": 16.0, "900": 24.0, "1500": 34.0, "2500": 52.0 },
  '5"': { "150": 9.5, "300": 16.2, "600": 30.6, "900": 38.7, "1500": 59.4, "2500": 105.0 },
  '6"': { "150": 11.0, "300": 20.0, "600": 32.0, "900": 47.0, "1500": 67.0, "2500": 143.0 },
  '8"': { "150": 19.0, "300": 33.0, "600": 55.0, "900": 80.0, "1500": 110.0, "2500": 165.0 },
  '10"': { "150": 29.0, "300": 52.0, "600": 85.0, "900": 125.0, "1500": 170.0, "2500": 255.0 },
  '12"': { "150": 40.0, "300": 73.0, "600": 120.0, "900": 170.0, "1500": 240.0, "2500": 575.0 },
  '14"': { "150": 53.0, "300": 95.0, "600": 160.0, "900": 230.0, "1500": 320.0, "2500": 460.0 },
  '16"': { "150": 70.0, "300": 130.0, "600": 210.0, "900": 300.0, "1500": 410.0, "2500": 600.0 },
  '18"': { "150": 88.0, "300": 165.0, "600": 270.0, "900": 380.0, "1500": 520.0, "2500": 760.0 },
  '20"': { "150": 110.0, "300": 200.0, "600": 330.0, "900": 470.0, "1500": 640.0, "2500": 930.0 },
  '24"': { "150": 120.0, "300": 280.0, "600": 460.0, "900": 650.0, "1500": 880.0, "2500": 1290.0 },
};

export function flangeMass(nps: string, rating: string): number {
  const r = FLANGE_MASS[nps];
  if (!r) return 0;
  const v = r[rating];
  if (v) return v;
  // fall back to nearest available rating
  const keys = Object.keys(r).map(Number).sort((a, b) => a - b);
  const target = Number(rating.replace("#", "")) || 150;
  let best = keys[0];
  for (const k of keys) if (Math.abs(k - target) < Math.abs(best - target)) best = k;
  return r[String(best)] ?? 0;
}

export const RATING_LIST = ["150", "300", "600", "900", "1500", "2500"].map((r) => `${r}#`);
export const FLANGE_TYPES = ["WN RF", "SO RF", "BL RF", "LJ", "RTJ", "FF", "LWN", "SW", "THD"];
export const FACE_TYPES = ["RF", "FF", "RTJ"];
export const NOZZLE_TYPES = ["Pipe", "Forged", "Rolled Plate Pipe", "Coupling", "Manway"];
export const HEAD_TYPES = [
  "2:1 Ellipsoidal",
  "Torispherical (F&D)",
  "Hemispherical",
  "Flat (UG-34)",
  "Conical 60 deg",
];
export const EQUIPMENT_TYPES = [
  "Pressure Vessel",
  "Column / Tower",
  "Heat Exchanger",
  "Storage Tank",
  "Reactor",
  "Separator",
  "Knock Out Drum",
  "Dish End / Head",
  "Skid / Structural",
];

// ---------------------------------------------------------------------------
// ASME B16.5 flange bolting — bolts per joint, stud Ø, flange thickness
// Indicative reproductions of B16.5 Tables 3-11 for estimating only; the
// design review must confirm against the current standard.
// ---------------------------------------------------------------------------

/** [bolts per joint, stud diameter as inch fraction, e.g. "3/4"] */
type Bolting = [count: number, dia: string];

export const FLANGE_BOLTING: Record<string, Record<string, Bolting>> = {
  '1/2"': { "150": [4, "1/2"], "300": [4, "1/2"], "600": [4, "1/2"], "900": [4, "3/4"], "1500": [4, "3/4"], "2500": [4, "3/4"] },
  '3/4"': { "150": [4, "1/2"], "300": [4, "5/8"], "600": [4, "5/8"], "900": [4, "3/4"], "1500": [4, "3/4"], "2500": [4, "3/4"] },
  '1"': { "150": [4, "1/2"], "300": [4, "5/8"], "600": [4, "5/8"], "900": [4, "7/8"], "1500": [4, "7/8"], "2500": [4, "7/8"] },
  '1.1/2"': { "150": [4, "1/2"], "300": [4, "3/4"], "600": [4, "3/4"], "900": [4, "1"], "1500": [4, "1"], "2500": [4, "1.1/8"] },
  '2"': { "150": [4, "5/8"], "300": [8, "5/8"], "600": [8, "5/8"], "900": [8, "7/8"], "1500": [8, "7/8"], "2500": [8, "1"] },
  '2.1/2"': { "150": [4, "5/8"], "300": [8, "3/4"], "600": [8, "3/4"], "900": [8, "1"], "1500": [8, "1"], "2500": [8, "1.1/8"] },
  '3"': { "150": [4, "5/8"], "300": [8, "3/4"], "600": [8, "3/4"], "900": [8, "7/8"], "1500": [8, "1.1/8"], "2500": [8, "1.1/4"] },
  '4"': { "150": [8, "5/8"], "300": [8, "3/4"], "600": [8, "7/8"], "900": [8, "1.1/8"], "1500": [8, "1.1/4"], "2500": [8, "1.1/2"] },
  '5"': { "150": [8, "3/4"], "300": [8, "3/4"], "600": [8, "1"], "900": [8, "1.1/4"], "1500": [8, "1.1/2"], "2500": [8, "1.3/4"] },
  '6"': { "150": [8, "3/4"], "300": [12, "3/4"], "600": [12, "1"], "900": [12, "1.1/8"], "1500": [12, "1.3/8"], "2500": [8, "2"] },
  '8"': { "150": [8, "3/4"], "300": [12, "7/8"], "600": [12, "1.1/8"], "900": [12, "1.3/8"], "1500": [12, "1.5/8"], "2500": [12, "2"] },
  '10"': { "150": [12, "7/8"], "300": [16, "1"], "600": [16, "1.1/4"], "900": [16, "1.3/8"], "1500": [12, "1.7/8"], "2500": [12, "2.1/2"] },
  '12"': { "150": [12, "7/8"], "300": [16, "1.1/8"], "600": [20, "1.1/4"], "900": [20, "1.3/8"], "1500": [16, "2"], "2500": [12, "2.3/4"] },
  '14"': { "150": [12, "1"], "300": [20, "1.1/8"], "600": [20, "1.3/8"], "900": [20, "1.1/2"], "1500": [16, "2.1/4"] },
  '16"': { "150": [16, "1"], "300": [20, "1.1/4"], "600": [20, "1.1/2"], "900": [20, "1.5/8"], "1500": [16, "2.1/2"] },
  '18"': { "150": [16, "1.1/8"], "300": [24, "1.1/4"], "600": [20, "1.5/8"], "900": [20, "1.7/8"], "1500": [16, "2.3/4"] },
  '20"': { "150": [20, "1.1/8"], "300": [24, "1.1/4"], "600": [24, "1.5/8"], "900": [20, "2"], "1500": [16, "3"] },
  '24"': { "150": [20, "1.1/4"], "300": [24, "1.1/2"], "600": [24, "1.7/8"], "900": [20, "2.1/2"], "1500": [16, "3.1/2"] },
};

/**
 * Flange thickness T (mm) by NPS × class — minimum thickness of the flange,
 * excluding the raised face. Used to size stud length.
 * Checked against the ASME B16.5 Class 150/300/600/900/1500/2500 dimension
 * tables (metalspiping reproductions, mm column).
 */
export const FLANGE_THK: Record<string, Record<string, number>> = {
  '1/2"': { "150": 9.6, "300": 12.7, "600": 14.3, "900": 22.3, "1500": 22.3, "2500": 30.2 },
  '3/4"': { "150": 11.2, "300": 14.3, "600": 15.9, "900": 25.4, "1500": 25.4, "2500": 31.8 },
  '1"': { "150": 12.7, "300": 15.9, "600": 17.5, "900": 28.6, "1500": 28.6, "2500": 35 },
  '1.1/2"': { "150": 15.9, "300": 19.1, "600": 22.3, "900": 31.8, "1500": 31.8, "2500": 44.5 },
  '2"': { "150": 17.5, "300": 20.7, "600": 25.4, "900": 38.1, "1500": 38.1, "2500": 50.9 },
  '2.1/2"': { "150": 20.7, "300": 23.9, "600": 28.6, "900": 41.3, "1500": 41.3, "2500": 57.2 },
  '3"': { "150": 22.3, "300": 27, "600": 31.8, "900": 38.1, "1500": 47.7, "2500": 66.7 },
  '4"': { "150": 22.3, "300": 30.2, "600": 38.1, "900": 44.5, "1500": 54, "2500": 76.2 },
  '5"': { "150": 22.3, "300": 33.4, "600": 44.5, "900": 50.8, "1500": 73.1, "2500": 92.1 },
  '6"': { "150": 23.9, "300": 35, "600": 47.7, "900": 55.6, "1500": 82.6, "2500": 108 },
  '8"': { "150": 27, "300": 39.7, "600": 55.6, "900": 63.5, "1500": 92.1, "2500": 127 },
  '10"': { "150": 28.6, "300": 46.1, "600": 63.5, "900": 69.9, "1500": 108, "2500": 165.1 },
  '12"': { "150": 30.2, "300": 49.3, "600": 66.7, "900": 79.4, "1500": 123.9, "2500": 184.2 },
  '14"': { "150": 33.4, "300": 52.4, "600": 69.9, "900": 85.8, "1500": 133.4 },
  '16"': { "150": 35, "300": 55.6, "600": 76.2, "900": 88.9, "1500": 146.1 },
  '18"': { "150": 38.1, "300": 58.8, "600": 82.6, "900": 101.6, "1500": 162 },
  '20"': { "150": 41.3, "300": 62, "600": 88.9, "900": 108, "1500": 177.8 },
  '24"': { "150": 46.1, "300": 68.3, "600": 101.6, "900": 139.7, "1500": 203.2 },
};

/** heavy hex nut (ASME B18.2.2) dims + thread per stud diameter, inches */
export const NUT_DIMS: Record<string, { af: number; thk: number; thread: string }> = {
  "1/2": { af: 22.2, thk: 12.3, thread: "1/2-13 UNC" },
  "5/8": { af: 27.0, thk: 15.5, thread: "5/8-11 UNC" },
  "3/4": { af: 31.8, thk: 18.7, thread: "3/4-10 UNC" },
  "7/8": { af: 36.5, thk: 21.8, thread: "7/8-9 UNC" },
  "1": { af: 41.3, thk: 25.0, thread: "1-8 UNC" },
  "1.1/8": { af: 46.0, thk: 28.2, thread: "1.1/8-8 UN" },
  "1.1/4": { af: 50.8, thk: 31.0, thread: "1.1/4-8 UN" },
  "1.3/8": { af: 55.6, thk: 34.1, thread: "1.3/8-8 UN" },
  "1.1/2": { af: 60.3, thk: 37.3, thread: "1.1/2-8 UN" },
};

/** "3/4" / "1.1/4" → mm */
function inchToMm(dia: string): number {
  if (dia.includes("/")) {
    const [whole, frac] = dia.includes(".")
      ? [dia.slice(0, dia.indexOf(".")), dia.slice(dia.indexOf(".") + 1)]
      : ["0", dia];
    const [a, b] = frac.split("/").map(Number);
    const w = Number(whole) || 0;
    return (w + (b ? a / b : 0)) * 25.4;
  }
  return (Number(dia) || 0) * 25.4;
}

function nutDims(dia: string): { af: number; thk: number; thread: string } {
  const hit = NUT_DIMS[dia];
  if (hit) return hit;
  // above 1.1/2" fall back to the usual rules of thumb (WAF ≈ 1.5·D, H ≈ D)
  const mm = inchToMm(dia);
  return {
    af: Math.round(mm * 1.5),
    thk: Math.round(mm),
    thread: inchToMm(dia) > 25.4 ? `${dia}-8 UN` : `${dia}-8 UNC`,
  };
}

/** nearest available pressure class when the row is missing */
function nearestClass(row: Record<string, unknown> | undefined, target: string): string | undefined {
  if (!row) return undefined;
  if (row[target]) return target;
  const keys = Object.keys(row).map(Number).sort((a, b) => a - b);
  const t = Number(target) || 150;
  let best = keys[0];
  for (const k of keys) if (Math.abs(k - t) < Math.abs(best - t)) best = k;
  return String(best);
}

/** bolts per joint + stud Ø for an NPS × class; falls back to the nearest class / smaller size */
export function boltingFor(nps: string, rating: string): Bolting | null {
  const rk = rating.replace("#", "");
  const row = FLANGE_BOLTING[nps];
  const exact = row?.[rk];
  if (exact) return exact;
  const near = nearestClass(row, rk);
  if (near) return row![near];
  // class 2500 stops at NPS 12 — borrow the largest available size below
  const i = NPS_LIST.indexOf(nps);
  for (let j = i - 1; j >= 0; j--) {
    const r = FLANGE_BOLTING[NPS_LIST[j]]?.[rk];
    if (r) return r;
  }
  return null;
}

/** flange thickness T (mm) with the same fallbacks as boltingFor */
export function flangeThk(nps: string, rating: string): number {
  const rk = rating.replace("#", "");
  const row = FLANGE_THK[nps];
  const exact = row?.[rk];
  if (exact) return exact;
  const near = nearestClass(row, rk);
  if (near) return row![near];
  const i = NPS_LIST.indexOf(nps);
  for (let j = i - 1; j >= 0; j--) {
    const r = FLANGE_THK[NPS_LIST[j]]?.[rk];
    if (r) return r;
  }
  return 0;
}

export interface StudSpec {
  /** bolts per flange joint */
  count: number;
  /** stud diameter, inch fraction */
  dia: string;
  diaMm: number;
  /** e.g. "3/4-10 UNC" */
  thread: string;
  /** overall stud length, mm (rounded up to a 5 mm increment) */
  length: number;
  /** nut width across flats, mm */
  nutAf: number;
  /** nut thickness, mm */
  nutThk: number;
}

/**
 * Stud/bolt take-off for one flanged joint:
 * L = 2 × flange thickness + gasket thickness + 2 × nut thickness + thread
 * projection, rounded up to the next 5 mm (estimating-grade).
 */
export function studSpec(nps: string, rating: string, gasketThkMm = 4.5): StudSpec | null {
  const b = boltingFor(nps, rating);
  const t = flangeThk(nps, rating);
  if (!b || !t) return null;
  const nut = nutDims(b[1]);
  const raw = 2 * t + Math.max(1, gasketThkMm) + 2 * nut.thk + 8;
  return {
    count: b[0],
    dia: b[1],
    diaMm: inchToMm(b[1]),
    thread: nut.thread,
    length: Math.ceil(raw / 5) * 5,
    nutAf: nut.af,
    nutThk: nut.thk,
  };
}
