import { afterEach, describe, expect, it } from "vitest";

import { getCursorSecret, isSelfServiceEnabled } from "./config";
import { SelfServiceError } from "./errors";

describe("self service release and migration contracts", () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    enabled: process.env.HR_PULSE_SELF_SERVICE_ENABLED,
    realData: process.env.HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED,
    cursorSecret: process.env.HR_PULSE_SELF_SERVICE_CURSOR_SECRET,
  };

  afterEach(() => {
    process.env.NODE_ENV = original.nodeEnv;
    for (const [key, value] of Object.entries({
      HR_PULSE_SELF_SERVICE_ENABLED: original.enabled,
      HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED: original.realData,
      HR_PULSE_SELF_SERVICE_CURSOR_SECRET: original.cursorSecret,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("requires both exact production release gates before serving real employee data", () => {
    process.env.NODE_ENV = "production";
    for (const [enabled, realData] of [["false", "false"], ["true", "false"], ["false", "true"]]) {
      process.env.HR_PULSE_SELF_SERVICE_ENABLED = enabled;
      process.env.HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED = realData;
      expect(isSelfServiceEnabled()).toBe(false);
    }
    process.env.HR_PULSE_SELF_SERVICE_ENABLED = "true";
    process.env.HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED = "true";
    expect(isSelfServiceEnabled()).toBe(true);
    process.env.HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED = "TRUE";
    expect(isSelfServiceEnabled()).toBe(false);
  });

  it("fails closed instead of using an unsigned cursor when production secret is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.HR_PULSE_SELF_SERVICE_CURSOR_SECRET;
    expect(() => getCursorSecret()).toThrowError(new SelfServiceError("SELF_SERVICE_UNAVAILABLE"));
  });

  it("records the migration normalization and backfill contract", async () => {
    const migration = await import("../../drizzle/0029_employee_self_service.sql?raw");
    const sql = migration.default;
    expect(sql).toContain("ALTER TABLE public.employees ALTER COLUMN preferred_name TYPE text");
    expect(sql).toContain("ALTER TABLE public.employees ALTER COLUMN phone TYPE text");
    expect(sql).toContain("char_length(pg_catalog.btrim(preferred_name)) > 200 THEN NULL");
    expect(sql).toContain("phone !~ '^[+][0-9]{7,15}$'");
    expect(sql).toContain("SET version = 1 WHERE version IS NULL OR version < 1");
    expect(sql).toContain("payroll_period_end = run.period_end");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS payouts_employee_period_cursor_idx");
    expect(sql).toContain("jsonb_build_array('preferred_name', 'phone')");
    expect(sql).toContain("'resultingVersion', employee.version");
    expect(sql).toContain("ALTER TABLE public.employees ALTER COLUMN version SET NOT NULL");
  });
});
