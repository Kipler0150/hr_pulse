import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

export const PAYSLIP_TEMPLATE_VERSION = 1;

const styles = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: "#172033", fontFamily: "Helvetica", fontSize: 10, padding: 42 },
  eyebrow: { color: "#526071", fontSize: 9, letterSpacing: 1.2, marginBottom: 8, textTransform: "uppercase" },
  title: { fontSize: 24, fontWeight: 700, marginBottom: 6 },
  meta: { color: "#526071", marginBottom: 24 },
  section: { borderTopColor: "#d9dee7", borderTopWidth: 1, marginTop: 18, paddingTop: 14 },
  row: { display: "flex", flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  label: { color: "#526071" },
  value: { fontFamily: "Courier", fontWeight: 700 },
  total: { borderTopColor: "#172033", borderTopWidth: 1, marginTop: 8, paddingTop: 12 },
  notice: { backgroundColor: "#f2f5f8", color: "#526071", marginTop: 28, padding: 12 },
});

function money(amountMinor, currency, exponent) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(amountMinor / (10 ** exponent));
}

function Row({ label, value, total = false }) {
  return React.createElement(View, { style: total ? [styles.row, styles.total] : styles.row },
    React.createElement(Text, { style: styles.label }, label),
    React.createElement(Text, { style: styles.value }, value));
}

export async function generatePayslipPdf({ run, payout, deductions, earnings = [] }) {
  const document = React.createElement(Document, {
    author: run.organizationName,
    creator: "HR Pulse",
    subject: `Payroll ${run.payrollReference}`,
    title: `Payslip ${run.payrollReference}`,
  }, React.createElement(Page, { size: "A4", style: styles.page },
    React.createElement(Text, { style: styles.eyebrow }, run.organizationName),
    React.createElement(Text, { style: styles.title }, "Payslip"),
    React.createElement(Text, { style: styles.meta }, `${run.periodStart} to ${run.periodEnd}  •  ${run.payrollReference}`),
    React.createElement(View, null,
      React.createElement(Row, { label: "Employee", value: payout.legalName }),
      React.createElement(Row, { label: "Employee number", value: payout.employeeNumber }),
      React.createElement(Row, { label: "Currency", value: payout.currency })),
    React.createElement(View, { style: styles.section },
      React.createElement(Row, { label: "Base gross pay", value: money(payout.grossAmountMinor - earnings.reduce((total, earning) => total + earning.amountMinor, 0), payout.currency, payout.currencyExponent) }),
      ...earnings.map((earning) => React.createElement(Row, {
        key: earning.id,
        label: `Overtime (${earning.payableMinutes} min${earning.multiplierBasisPoints ? ` at ${(earning.multiplierBasisPoints / 10000).toFixed(2)}x` : ""})`,
        value: money(earning.amountMinor, payout.currency, payout.currencyExponent),
      })),
      React.createElement(Row, { label: "Gross pay", value: money(payout.grossAmountMinor, payout.currency, payout.currencyExponent) }),
      ...deductions.map((deduction) => React.createElement(Row, {
        key: deduction.id,
        label: deduction.name,
        value: `− ${money(deduction.amountMinor, payout.currency, payout.currencyExponent)}`,
      })),
      React.createElement(Row, { label: "Total deductions", value: money(payout.deductionsAmountMinor, payout.currency, payout.currencyExponent) }),
      React.createElement(Row, { label: "Net amount owed", total: true, value: money(payout.netAmountMinor, payout.currency, payout.currencyExponent) })),
    React.createElement(Text, { style: styles.notice }, "This payslip records an amount owed. It does not confirm an external bank transfer.")));
  return renderToBuffer(document);
}
