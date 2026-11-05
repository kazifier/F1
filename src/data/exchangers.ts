// ---------------------------------------------------------------------------
// Heat exchanger scope — the 31 tubular exchangers of the three UOP units.
//
// Sources (client datasheet book, project specification 401 series):
//   9135751-401  UOP Naphtha Hydrotreating  — 10-E01 … 10-E08   (8 items)
//   9135752-401  UOP Fixed-Bed Platforming  — 12-E01 … 12-E12   (12 items)
//   9135753-401  UOP Par-Isom               — 11-E01 … 11-E12*  (11 items, no 11-E05)
//
// * 11-E03 "Charge Heater" is a multitube (hairpin) exchanger in the 401 book —
//   it is a tubular item and is kept in the exchanger scope.
//
// Tag, service name and TEMA type are transcribed from the item sheets. The
// process duty (surface, design pressure / temperature, corrosion allowance and
// MOC family) is the design basis carried on those sheets; every value is shown
// and editable in the wizard, and the mechanical sizing (shell, heads,
// tubesheet, tubes, baffles, bundle weight) is calculated by ./tema from it.
// ---------------------------------------------------------------------------

import type { ExchangerKind, TubePattern } from "../lib/tema";

export type ExchangerGroup = "NHT" | "PAR ISOM" | "FBP";

export interface ExchangerUnit {
  tag: string;
  name: string;
  group: ExchangerGroup;
  service: string;
  /** TEMA designation: front head / shell / rear head */
  tema: string;
  /** mechanical family — kettle reboilers and the fired heater are not plain E shells */
  kind: ExchangerKind;
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
    { ca: 6, notes: ["Hydrogen + wet H2S on both sides — CA 6 mm, PWHT, strength-weld tubes."] },
  ],
  ["10-E02", "Stripper Feed-Splitter Bottoms Exchanger", "BEU", 860, 20, 300, 20, 260, { ca: 6 }],
  ["10-E03", "Stripper Feed-Bottoms Exchanger", "BEU", 640, 20, 290, 20, 250, { ca: 6 }],
  ["10-E04", "Stripper Trim Condenser", "AEU", 310, 18, 200, 18, 160],
  ["10-E05", "Stripper Reboiler", "BKU", 480, 20, 280, 20, 260],
  ["10-E06", "Naphtha Splitter Reboiler", "BKU", 720, 18, 300, 18, 280],
  ["10-E07", "Light Naphtha Cooler", "AEU", 240, 18, 140, 18, 120],
  ["10-E08", "Heavy Naphtha Bottoms Trim Cooler", "AEU", 290, 18, 160, 18, 140],
]);

// ---------------------------------------------------------- FBP (9135752-401)
const FBP: ExchangerUnit[] = build("FBP", [
  [
    "12-E01",
    "Combined Feed Exchanger",
    "CES",
    3490,
    19,
    550,
    22.5,
    538,
    {
      tubeLength: 22000,
      shells: 1,
      kind: "bayonet",
      shellMat: CRMO,
      tubeMat: "SA-213 T11",
      tubesheetMat: CRMO,
      channelMat: CRMO,
      tubeThk: 2.11,
      notes: [
        "Vertical bayonet combined feed exchanger, 22 m effective tubes; 3 490 m² from the datasheet note.",
        "1.25Cr-0.5Mo construction, hydrogen service both sides.",
      ],
    },
  ],
  ["12-E02", "Products Trim Condenser", "AEU", 850, 20, 260, 18, 180, { shellMat: CRMO, tubeMat: "SA-213 T11" }],
  ["12-E03", "Net Gas Cooler", "AEU", 420, 25, 200, 25, 180],
  ["12-E04", "Recontact Cooler", "AEU", 980, 22, 220, 22, 200],
  ["12-E05", "Debutanizer Feed-Bottoms Exchanger", "BEU", 1450, 22, 260, 22, 240, { shellMat: CRMO }],
  ["12-E06", "Debutanizer Reboiler", "BKU", 620, 22, 280, 22, 260],
  ["12-E07", "Debutanizer Bottoms Cooler", "AEU", 380, 20, 180, 20, 160],
  ["12-E08", "Debutanizer Condenser", "AEU", 1250, 20, 160, 20, 140],
  ["12-E09", "Deethanizer Feed-Bottoms Exchanger", "BEU", 1180, 22, 240, 22, 220],
  ["12-E10", "Deethanizer Reboiler", "BKU", 740, 22, 260, 22, 240],
  ["12-E11", "LPG Cooler", "AEU", 260, 20, 140, 20, 120],
  ["12-E12", "Deethanizer Condenser", "AEU", 1520, 18, 150, 18, 130],
]);

// ------------------------------------------------------ PAR ISOM (9135753-401)
const PAR: ExchangerUnit[] = build("PAR ISOM", [
  [
    "11-E01",
    "Cold Combined Feed Exchanger",
    "BEU",
    1860,
    33,
    425,
    39,
    400,
    { ca: 6, notes: ["Hydrogen service both sides; alternate regeneration case 11.5 / 10.5 kg/cm²(g)."] },
  ],
  ["11-E02", "Hot Combined Feed Exchanger", "BEU", 1620, 35.6, 425, 37.9, 400, { ca: 6 }],
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
      notes: [
        "Fired heater: charge heater coil, not a TEMA tubesheet item — sheet and checks follow API 560 + ASME VIII-1 for the coil.",
      ],
    },
  ],
  ["11-E04", "Product Trim Condenser", "AEU", 380, 19, 200, 19, 180],
  ["11-E06", "Stabilizer Feed-Deisohexanizer Sidedraw Exchanger", "AEU", 540, 20, 260, 20, 240],
  ["11-E07", "Stabilizer Feed-Bottoms Exchanger", "AEU", 720, 19.3, 250, 19.3, 230],
  ["11-E08", "Stabilizer Condenser", "AEU", 880, 19, 170, 19, 150],
  ["11-E09", "Stabilizer Reboiler", "BEU", 610, 17.7, 260, 20, 260],
  ["11-E10", "Isomerate Cooler", "AEU", 330, 18, 150, 18, 130],
  ["11-E11", "Deisohexanizer Reboiler", "BKU", 690, 18, 270, 18, 250],
  ["11-E12", "Deisohexanizer Bottoms Cooler", "AEU", 420, 18, 170, 18, 150],
]);

export const EXCHANGER_UNITS: ExchangerUnit[] = [...NHT, ...FBP, ...PAR];

export const EXCHANGER_BY_TAG = (tag: string) => EXCHANGER_UNITS.find((u) => u.tag === tag);

export const EXCHANGER_TAGS = EXCHANGER_UNITS.map((u) => u.tag);