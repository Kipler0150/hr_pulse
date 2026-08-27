import { describe, expect, it } from "vitest";
import { CURRENCY_MAP_VERSION, getCurrencyExponent, getSupportedCurrencies, isSupportedCurrency } from "./currency";

describe("payroll currency map", () => {
  it("returns ISO currency exponents used by integer payroll calculation, covers: AC-3 and AC-6", () => {
    expect(getCurrencyExponent("USD")).toBe(2);
    expect(getCurrencyExponent("JPY")).toBe(0);
    expect(CURRENCY_MAP_VERSION).toBe("iso-4217-2026-01");
  });

  it("rejects unsupported and incorrectly cased currency codes, covers: AC-3", () => {
    expect(isSupportedCurrency("USD")).toBe(true);
    expect(isSupportedCurrency("usd")).toBe(false);
    expect(() => getCurrencyExponent("BTC")).toThrow("currency is not supported");
  });

  it("returns a stable supported currency list without duplicates, covers: AC-3", () => {
    const currencies = getSupportedCurrencies();
    expect(currencies).toContain("PHP");
    expect(new Set(currencies).size).toBe(currencies.length);
  });
});
