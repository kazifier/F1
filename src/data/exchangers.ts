// ---------------------------------------------------------------------------
// Heat exchanger scope — the 31 tubular exchangers of the three UOP units.
//
// Sources (client datasheet book, project specification 401 series):
//   9135751-401  UOP Naphtha Hydrotreating  — 10-E01 … 10-E08   (8 items)
//   9135752-401  UOP Fixed-Bed Platforming  — 12-E01 … 12-E12   (12 items)
//   9135753-401  UOP Par-Isom               — 11-E01 … 11-E12*  (11 items, no 11-E05)
//
// * 11-E03 "Charge Heater" is the API 560 fired heater, kept in the exchanger
//   scope because it belongs to the same 401 book.
//
// Tag, service name and TEMA type are transcribed from the item sheets. The
// process duty (surface, design pressure / temperature, corrosion allowance and
// MOC family) is the design basis carried on those sheets; every value is shown
// and editable in the wizard, and the mechanical sizing (shell, heads,
// tubesheet, tubes, baffles, bundle weight) is calculated by ./tema from it.
//
// Mechanical family, orientation, tube joint and criticality are the shop
// classification from the item sheets and the client's equipment list — see
// ../lib/exchangerClass for the rules. Items flagged below are the ones the
// client asked to be handled with particular care.
// ---------------------------------------------------------------------------

import type { ExchangerKind, TubePattern } from "../lib/tema";
import type { Criticality, MechType, Orientation, TubeJoint } from "../lib/exchangerClass";

export type ExchangerGroup = "NHT" | "PAR ISOM" | "FBP";

export interface ExchangerUnit {
  tag: string;
  name: string;
  group: ExchangerGroup;
  service: string;
  /** TEMA designation: front head / shell / rear head */
  tema: string;
  /** mechanical family — kettle, hairpin, stabbed-in and the fired heater are not plain E shells */
  kind: ExchangerKind;
  /** mechanical classification shown on the sheet (derived from TEMA when absent) */
  mech?: MechType;
  orientation?: Orientation;
  support?: string;
  tubeJoint?: TubeJoint;
  criticality?: Criticality;
  criticalityNote?: string;
  features?: string[];
  /** bundle pulling limit, kg — the 20 t UOP limit unless the item sheet says otherwise */
  maxBundleKg?: number;
  /** shells working in parallel for the item */
  shells: number;
  /** required effective surface per unit, m² */
  surfaceM2: number;
  tubeOd: number;
  tubeThk: number;
  pitch: number;
  pattern: TubePattern;
  /** effective tube length, mm */
  tubeLength: number;
  tubePasses: number;
  shellPasses: number;
  /** design pressure, kg/cm²(g) — datasheet basis */
  pShell: number;
  tShell: number;
  pTube: number;
  tTube: number;
  mdmt: number;
  /** corrosion allowance, mm */
  ca: number;
  shellMat: string;
  tubeMat: string;
  channelMat: string;
  tubesheetMat: string;
  insulated: boolean;
  notes?: string[];
}

const KCS = "SA-516 Gr.70"; // killed carbon steel per UOP Std 3-11
const CRMO = "SA-387 Gr.11 Cl.2"; // 1.25Cr-0.5Mo (FBP reaction section)
const TUBE_CS = "SA-179"; // seamless 19.05 OD carbon steel tube
const TS_CS = "SA-516 Gr.70";
const FORGE_CS = "SA-105";

type Row = [
  tag: string,
  name: string,
  tema: string,
  surfaceM2: number,
  pShell: number,
  tShell: number,
  pTube: number,
  tTube: number,
  extra?: Partial<ExchangerUnit>,
];

const base = {
  group: "NHT" as ExchangerGroup,
  shells: 1,
  tubeOd: 19.05,
  tubeThk: 2.11,
  pitch: 25.4,
  pattern: "30" as TubePattern,
  tubeLength: 6100,
  tubePasses: 2,
  shellPasses: 1,
  mdmt: -8,
  ca: 3,
  shellMat: KCS,
  tubeMat: TUBE_CS,
  channelMat: FORGE_CS,
  tubesheetMat: TS_CS,
  insulated: true,
};

const build = (group: ExchangerGroup, rows: Row[]): ExchangerUnit[] =>
  rows.map(([tag, name, tema, surfaceM2, pShell, tShell, pTube, tTube, extra]) => ({
    ...base,
    group,
    tag,
    name,
    tema,
    // K in the second position is the kettle shell — it is not an E shell
    kind: (tema[1]?.toUpperCase() === "K" ? "kettle" : "shell-tube") as ExchangerKind,
    service: name,
    surfaceM2,
    pShell,
    tShell,
    pTube,
    tTube,
    ...extra,
  }));

// ---------------------------------------------------------- NHT (9135751-401)
const NHT: ExchangerUnit[] = build("NHT", [
  [
    "10-E01",
    "Combined Feed Exchanger",
    "BEU",
    1240,
    36.3,
    425,
    43.1,
    400,
    {
      ca: 6,
      tubeJoint: "expanded+strength",
      criticality: "High",
      criticalityNote:
        "Hydrogen + wet H2S both sides: CA 6 mm, PWHT and strength-welded tube joints per UOP Std 3-11.",
      features: ["Hydrogen + wet H2S service", "CA 6 mm and PWHT", "Strength-welded tube joints"],
      notes: ["Hydrogen + wet H2S on both sides — CA 6 mm, PWHT, strength-weld tubes."],
    },
  ],
  [
    "10-E02",
    "Stripper Feed-Splitter Bottoms Exchanger",
    "BEU",
    860,
    20,
    300,
    20,
    260,
    {
      ca: 6,
      mech: "hairpin",
      tubeJoint: "expanded+seal",
      criticality: "High",
      criticalityNote:
        "Hairpin element — two legs per tube with a 180° return bend; return-bend welds are the pressure-critical detail.",
      features: ["Hairpin (two-leg) element", "Return bends welded to the legs", "CA 6 mm"],
    },
  ],
  [
    "10-E03",
    "Stripper Feed-Bottoms Exchanger",
    "BEU",
    640,
    20,
    290,
    20,
    250,
    {
      ca: 6,
      tubeJoint: "expanded+strength",
      criticality: "High",
      criticalityNote: "Hydrogen service with CA 6 mm — strength-welded tube joints and PWHT.",
      features: ["Hydrogen service", "CA 6 mm"],
    },
  ],
  ["10-E04", "Stripper Trim Condenser", "AEU", 310, 18, 200, 18, 160, { tubeJoint: "expanded" }],
  [
    "10-E05",
    "Stripper Reboiler",
    "BKU",
    480,
    20,
    280,
    20,
    260,
    {
      mech: "kettle",
      tubeJoint: "expanded+seal",
      features: ["Kettle shell with vapour disengagement", "Weir keeps the bundle flooded"],
    },
  ],
  [
    "10-E06",
    "Naphtha Splitter Reboiler",
    "BKU",
    720,
    18,
    300,
    18,
    280,
    { mech: "kettle", tubeJoint: "expanded+seal", features: ["Kettle shell", "U-tube bundle pulled from one end"] },
  ],
  ["10-E07", "Light Naphtha Cooler", "AEU", 240, 18, 140, 18, 120, { tubeJoint: "expanded" }],
  ["10-E08", "Heavy Naphtha Bottoms Trim Cooler", "AEU", 290, 18, 160, 18, 140, { tubeJoint: "expanded" }],
]);

// ---------------------------------------------------------- FBP (9135752-401)
const FBP: ExchangerUnit[] = build("FBP", [
  [
    "12-E01",
    "Combined Feed Exchanger",
    "AES",
    3490,
    19,
    550,
    22.5,
    538,
    {
      tubeLength: 22000,
      shells: 1,
      kind: "shell-tube",
      mech: "floating",
      orientation: "Vertical",
      support: "Skirt (concrete ringwall)",
      tubeJoint: "expanded+strength",
      criticality: "Critical",
      maxBundleKg: 60000,
      shellMat: CRMO,
      tubeMat: "SA-213 T11",
      tubesheetMat: CRMO,
      channelMat: CRMO,
      tubeThk: 2.11,
      criticalityNote:
        "Vertical skirt-supported combined feed exchanger: floating head with lip seal and an internal expansion bellows, 22 m tubes in 1.25Cr-0.5Mo hydrogen service. Mechanical detail, tube-joint strength and the bellows are all first-of-a-kind — handle with precision.",
      features: [
        "Vertical, skirt supported",
        "Floating head with lip seal",
        "Internal expansion bellows",
        "22 m tubes, 1.25Cr-0.5Mo",
        "Strength-welded tube joints",
      ],
      notes: [
        "Vertical floating-head combined feed exchanger with lip seal and internal expansion bellows, 22 m effective tubes; 3 490 m² from the datasheet note.",
        "1.25Cr-0.5Mo construction, hydrogen service both sides. Bundle pulled vertically with a 60 t rig — the 20 t UOP pulling limit does not apply.",
      ],
    },
  ],
  [
    "12-E02",
    "Products Trim Condenser",
    "AEU",
    850,
    20,
    260,
    18,
    180,
    { shellMat: CRMO, tubeMat: "SA-213 T11", tubeJoint: "expanded+seal" },
  ],
  ["12-E03", "Net Gas Cooler", "AEU", 420, 25, 200, 25, 180, { tubeJoint: "expanded+seal" }],
  ["12-E04", "Recontact Cooler", "AEU", 980, 22, 220, 22, 200, { tubeJoint: "expanded+seal" }],
  [
    "12-E05",
    "Debutanizer Feed-Bottoms Exchanger",
    "BEU",
    1450,
    22,
    260,
    22,
    240,
    {
      shellMat: CRMO,
      tubeJoint: "expanded+strength",
      criticality: "High",
      criticalityNote: "Hydrogen partial pressure with 1.25Cr-0.5Mo shell — strength-welded tube joints.",
      features: ["1.25Cr-0.5Mo shell", "Strength-welded tube joints"],
    },
  ],
  [
    "12-E06",
    "Debutanizer Reboiler",
    "BKU",
    620,
    22,
    280,
    22,
    260,
    { mech: "kettle", tubeJoint: "expanded+seal", features: ["Kettle shell", "Weir and vapour disengagement space"] },
  ],
  ["12-E07", "Debutanizer Bottoms Cooler", "AEU", 380, 20, 180, 20, 160, { tubeJoint: "expanded" }],
  ["12-E08", "Debutanizer Condenser", "AEU", 1250, 20, 160, 20, 140, { tubeJoint: "expanded+seal" }],
  [
    "12-E09",
    "Deethanizer Feed-Bottoms Exchanger",
    "BEU",
    1180,
    22,
    240,
    22,
    220,
    {
      mech: "hairpin",
      tubeJoint: "expanded+seal",
      criticality: "High",
      criticalityNote:
        "Hairpin element — long two-leg tubes with a return bend at the far end; return-bend welds and leg alignment govern.",
      features: ["Hairpin (two-leg) element", "Return bend at the far end"],
    },
  ],
  [
    "12-E10",
    "Deethanizer Reboiler",
    "BKU",
    740,
    22,
    260,
    22,
    240,
    {
      kind: "stabbed-in",
      mech: "stabbed-in",
      support: "Integral — through the column shell",
      tubeJoint: "expanded+seal",
      criticality: "High",
      criticalityNote:
        "Stabbed-in reboiler: the bundle is inserted through a large nozzle in the Deethanizer shell, so the column opening, the internal support and bundle pull clearance are the governing details.",
      features: [
        "Stabbed in through the column shell",
        "Internal U-tube bundle",
        "Bundle pulled through the column nozzle",
      ],
    },
  ],
  ["12-E11", "LPG Cooler", "AEU", 260, 20, 140, 20, 120, { tubeJoint: "expanded" }],
  ["12-E12", "Deethanizer Condenser", "AEU", 1520, 18, 150, 18, 130, { tubeJoint: "expanded+seal" }],
]);

// ------------------------------------------------------ PAR ISOM (9135753-401)
const PAR: ExchangerUnit[] = build("PAR ISOM", [
  [
    "11-E01",
    "Cold Combined Feed Exchanger",
    "BES",
    1860,
    33,
    425,
    39,
    400,
    {
      ca: 6,
      mech: "floating",
      tubeJoint: "expanded+strength",
      criticality: "High",
      criticalityNote:
        "High ΔT feed/effluent service — floating head takes the differential expansion; CA 6 mm hydrogen service with strength-welded tube joints.",
      features: ["High ΔT feed/effluent duty", "Floating head", "Hydrogen both sides, CA 6 mm"],
      notes: ["Hydrogen service both sides; alternate regeneration case 11.5 / 10.5 kg/cm²(g)."],
    },
  ],
  [
    "11-E02",
    "Hot Combined Feed Exchanger",
    "BES",
    1620,
    35.6,
    425,
    37.9,
    400,
    {
      ca: 6,
      mech: "floating",
      tubeJoint: "expanded+strength",
      criticality: "High",
      criticalityNote:
        "High ΔT feed/effluent service — floating head with backing device; CA 6 mm hydrogen service with strength-welded tube joints.",
      features: ["High ΔT feed/effluent duty", "Floating head", "Hydrogen both sides, CA 6 mm"],
    },
  ],
  [
    "11-E03",
    "Charge Heater",
    "AEU",
    210,
    26,
    380,
    26,
    360,
    {
      tubeLength: 3050,
      tubeOd: 25.4,
      tubeThk: 2.77,
      pitch: 32,
      pattern: "90",
      kind: "fired-heater",
      mech: "fired-heater",
      orientation: "Vertical",
      support: "Grade mounted structural steel",
      tubeJoint: "welded",
      criticality: "Critical",
      criticalityNote:
        "API 560 fired heater: radiant and convection coil, refractory casing, burners and stack. Coil wall, flux, burner spacing and stack draft are the critical design items — no TEMA tubesheet applies.",
      features: [
        "API 560 cabin heater",
        "Radiant + convection coil",
        "Natural-draft stack with damper",
        "876 coil tubes at 25.4 mm OD",
      ],
      notes: [
        "Fired heater: charge heater coil, not a TEMA tubesheet item — sheet and checks follow API 560 + ASME VIII-1 for the coil.",
      ],
    },
  ],
  ["11-E04", "Product Trim Condenser", "AEU", 380, 19, 200, 19, 180, { tubeJoint: "expanded" }],
  [
    "11-E06",
    "Stabilizer Feed-Deisohexanizer Sidedraw Exchanger",
    "AEU",
    540,
    20,
    260,
    20,
    240,
    {
      mech: "hairpin",
      tubeJoint: "expanded+seal",
      criticality: "High",
      criticalityNote:
        "Hairpin element — two legs with a return bend; the sidedraw service needs the sealed tube joint so the two sides cannot mix.",
      features: ["Hairpin (two-leg) element", "Seal-welded tube joints"],
    },
  ],
  ["11-E07", "Stabilizer Feed-Bottoms Exchanger", "AEU", 720, 19.3, 250, 19.3, 230, { tubeJoint: "expanded+seal" }],
  ["11-E08", "Stabilizer Condenser", "AEU", 880, 19, 170, 19, 150, { tubeJoint: "expanded" }],
  ["11-E09", "Stabilizer Reboiler", "BEU", 610, 17.7, 260, 20, 260, { tubeJoint: "expanded+seal" }],
  ["11-E10", "Isomerate Cooler", "AEU", 330, 18, 150, 18, 130, { tubeJoint: "expanded" }],
  [
    "11-E11",
    "Deisohexanizer Reboiler",
    "BKU",
    690,
    18,
    270,
    18,
    250,
    { mech: "kettle", tubeJoint: "expanded+seal", features: ["Kettle shell", "Weir and vapour disengagement space"] },
  ],
  ["11-E12", "Deisohexanizer Bottoms Cooler", "AEU", 420, 18, 170, 18, 150, { tubeJoint: "expanded" }],
]);

export const EXCHANGER_UNITS: ExchangerUnit[] = [...NHT, ...FBP, ...PAR];

export const EXCHANGER_BY_TAG = (tag: string) => EXCHANGER_UNITS.find((u) => u.tag === tag);

export const EXCHANGER_TAGS = EXCHANGER_UNITS.map((u) => u.tag);
