"use client";

import { SensitiveValue } from "@/components/ui/sensitive-value";
import { formatMoney } from "@/lib/hr-format";

export function PayslipValues({ currency, deductions, earnings, grossAmountMinor, netAmountMinor, deductionsAmountMinor }) {
  const amount = (value) => <SensitiveValue canReveal value={formatMoney(value, currency)} />;
  return <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">Gross pay</dt><dd>{amount(grossAmountMinor)}</dd></div>{earnings.filter((line) => line.earningType === "overtime").map((line) => <div key="overtime"><dt className="text-sm text-muted-foreground">Overtime earning</dt><dd>{amount(line.amountMinor)}</dd></div>)}<div><dt className="text-sm text-muted-foreground">Deductions</dt><dd>{amount(deductionsAmountMinor)}</dd></div><div><dt className="text-sm text-muted-foreground">Net pay</dt><dd>{amount(netAmountMinor)}</dd></div>{deductions.map((line) => <div key={`${line.name}-${line.displayOrder}`}><dt className="text-sm text-muted-foreground">{line.name}</dt><dd>{amount(line.amountMinor)}</dd></div>)}</dl>;
}
