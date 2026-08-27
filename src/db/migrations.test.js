import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../drizzle/0002_fix_rls_profile_lookup.sql", import.meta.url),
);
const integrityMigrationPath = fileURLToPath(
  new URL("../../drizzle/0003_zippy_mastermind.sql", import.meta.url),
);
const validationMigrationPath = fileURLToPath(
  new URL("../../drizzle/0004_validate_payout_gross_constraint.sql", import.meta.url),
);
const payrollTriggerMigrationPath = fileURLToPath(
  new URL("../../drizzle/0006_fix_payroll_terminal_trigger.sql", import.meta.url),
);

describe("database migrations", () => {
  it("resolves organization access through the Supabase Auth user ID", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain(
      "JOIN profiles profile ON profile.id = membership.profile_id",
    );
    expect(migration).toContain("profile.auth_user_id = auth.uid()");
  });

  it("applies the database checks that protect core values", () => {
    const migration = readFileSync(integrityMigrationPath, "utf8");

    expect(migration).toContain("pay_settings_gross_nonnegative");
    expect(migration).toContain("leave_date_order_check");
    expect(migration).toContain("attendance_clock_order_check");
    expect(migration).toContain("payouts_net_check");
  });

  it("validates the payout gross constraint after legacy data is repaired", () => {
    const migration = readFileSync(validationMigrationPath, "utf8");

    expect(migration).toContain(
      'VALIDATE CONSTRAINT "payouts_gross_nonnegative"',
    );
  });

  it("compares terminal payroll statuses without cross casting enum values", () => {
    const migration = readFileSync(payrollTriggerMigrationPath, "utf8");

    expect(migration).toContain("OLD.status::text = 'completed'");
    expect(migration).toContain("OLD.status::text = 'finalized'");
    expect(migration).toContain("OLD.status::text = 'generated'");
    expect(migration).not.toMatch(/OLD\.status\s*=\s*'/);
  });
});
