// ---------------------------------------------------------------------------
// Currency handling
//
// All money in the store is held in BHD (Bahraini dinar) — the currency of the
// manufacturing facility. Display currency is a project setting; every screen
// converts from the BHD base through the table below.
//
// GCC currencies are pegged to the US dollar (KWD to a basket), so these rates
// are stable reference values rather than live market quotes.
// ---------------------------------------------------------------------------

export type CurrencyCode = "BHD" | "SAR" | "AED" | "KWD" | "QAR" | "OMR" | "USD" | "EUR";

export interface CurrencyDef {
  code: CurrencyCode;
  name: string;
  /** ISO 4217 minor-unit style decimals used for display */
  decimals: number;
  /** units of this currency per 1 BHD */
  perBhd: number;
  country: string;
}

/** base currency of the rate book and every stored amount */
export const BASE_CURRENCY: CurrencyCode = "BHD";

export const CURRENCIES: CurrencyDef[] = [
  { code: "BHD", name: "Bahraini dinar", decimals: 3, perBhd: 1, country: "Bahrain" },
  { code: "SAR", name: "Saudi riyal", decimals: 2, perBhd: 9.9734, country: "Saudi Arabia" },
  { code: "AED", name: "UAE dirham", decimals: 2, perBhd: 9.7685, country: "United Arab Emirates" },
  { code: "KWD", name: "Kuwaiti dinar", decimals: 3, perBhd: 0.828, country: "Kuwait" },
  { code: "QAR", name: "Qatari riyal", decimals: 2, perBhd: 9.6782, country: "Qatar" },
  { code: "OMR", name: "Omani rial", decimals: 3, perBhd: 1.0226, country: "Oman" },
  { code: "USD", name: "US dollar", decimals: 2, perBhd: 2.6596, country: "United States" },
  { code: "EUR", name: "Euro", decimals: 2, perBhd: 2.3808, country: "Eurozone" },
];

export const CURRENCY_BY_CODE: Record<string, CurrencyDef> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c]),
);

/** note shown next to currency pickers */
export const FX_NOTE = "BHD base · GCC pegs, indicative";

export const getCurrency = (code: string | undefined): CurrencyDef =>
  CURRENCY_BY_CODE[(code ?? "").toUpperCase()] ?? CURRENCY_BY_CODE[BASE_CURRENCY];

/** Bahrain VAT — every price in this app is quoted net of VAT */
export const VAT_BH = 10;

/** convert a BHD amount into the display currency */
export const fromBhd = (amountBhd: number, code: string | undefined): number =>
  amountBhd * getCurrency(code).perBhd;

/** convert an amount typed in the display currency back into BHD */
export const toBhd = (amount: number, code: string | undefined): number =>
  amount / getCurrency(code).perBhd;

const group = (v: number, decimals: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** format a BHD amount in the display currency, e.g. "BHD 12,480.500" */
export const formatMoney = (amountBhd: number, code: string | undefined, decimals?: number): string => {
  const c = getCurrency(code);
  if (!Number.isFinite(amountBhd)) return `${c.code} -`;
  return `${c.code} ${group(fromBhd(amountBhd, c.code), decimals ?? c.decimals)}`;
};

/** unit-rate label such as "BHD/kg" */
export const rateUnit = (code: string | undefined, unit = "kg"): string =>
  `${getCurrency(code).code}/${unit}`;

/** "BHD 0.516" from a BHD-per-kg rate */
export const formatRate = (rateBhd: number, code: string | undefined, unit = "kg"): string =>
  `${formatMoney(rateBhd, code)}/${unit}`;
