export function formatPayrollMoney(amountMinor, currency, exponent) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(amountMinor / (10 ** exponent));
}

export function formatPayrollPeriod(start, end) {
  return `${start} to ${end}`;
}
