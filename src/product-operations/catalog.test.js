import { describe, expect, it } from "vitest";
import { AUDIT_ACTION_CATALOG, PRODUCT_EVENT_CATALOG, normalizeAuditAction } from "./catalog";

describe("product operations catalogues", () => {
  it("keeps the audit action catalogue fixed", () => {
    expect(AUDIT_ACTION_CATALOG).toContain("payroll.completed");
    expect(AUDIT_ACTION_CATALOG).toContain("access.authorization_denied");
    expect(() => normalizeAuditAction("employee.secret_exported")).toThrow("not supported");
  });

  it("canonicalizes known legacy actions without accepting arbitrary values", () => {
    expect(normalizeAuditAction("organization.founded")).toBe("organization.created");
    expect(normalizeAuditAction("payroll.recovered")).toBe("payroll.retry_requested");
  });

  it("does not mix product milestone events with audit-only transitions", () => {
    expect(PRODUCT_EVENT_CATALOG).toContain("payroll.failed");
    expect(PRODUCT_EVENT_CATALOG).not.toContain("payroll.processing");
  });
});
