export const CURRENCY_MAP_VERSION = "iso-4217-2026-01";

const currencyExponents = Object.freeze({
  AUD: 2, BDT: 2, BRL: 2, CAD: 2, CHF: 2, CNY: 2, EUR: 2, GBP: 2,
  HKD: 2, IDR: 2, INR: 2, JPY: 0, KRW: 0, MXN: 2, MYR: 2, NZD: 2,
  PHP: 2, PKR: 2, SGD: 2, THB: 2, TWD: 2, USD: 2, VND: 0, ZAR: 2,
});

export function getCurrencyExponent(currency) {
  const exponent = currencyExponents[currency];
  if (exponent === undefined) throw new Error("currency is not supported by the payroll currency map");
  return exponent;
}

export function isSupportedCurrency(currency) {
  return Object.hasOwn(currencyExponents, currency);
}

export function getSupportedCurrencies() {
  return Object.keys(currencyExponents);
}
