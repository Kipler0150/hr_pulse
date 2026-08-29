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
const attendanceMigrationPath = fileURLToPath(
  new URL("../../drizzle/0007_marvelous_ezekiel.sql", import.meta.url),
);
const attendanceGrantMigrationPath = fileURLToPath(
  new URL("../../drizzle/0008_restrict_attendance_function_grants.sql", import.meta.url),
);
const overtimeMigrationPath = fileURLToPath(
  new URL("../../drizzle/0009_cooing_grey_gargoyle.sql", import.meta.url),
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

  it("enforces trusted attendance transitions, role scoped reads, and append only history, covers: AC-1, AC-3, AC-5, and AC-8", () => {
    const migration = readFileSync(attendanceMigrationPath, "utf8");

    expect(migration).toContain("attendance_state_consistency_check");
    expect(migration).toContain("attendance_one_open_per_employee");
    expect(migration).toContain("attendance_intervals_immutable");
    expect(migration).toContain("audit_events_append_only");
    expect(migration).toContain("employees_can_read_own_attendance");
    expect(migration).toContain("attendance_reviewers_can_read_organization_attendance");
    expect(migration).toContain("transaction_timestamp()");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION attendance_check_in(uuid) TO authenticated");
    expect(migration).toContain("REVOKE ALL ON FUNCTION attendance_check_in(uuid) FROM anon");
    expect(migration).not.toContain("pay_setting_deductions_name_unique");
  });

  it("removes Supabase anon grants from every attendance function, covers: AC-5 and AC-7", () => {
    const migration = readFileSync(attendanceGrantMigrationPath, "utf8");

    expect(migration).toContain("REVOKE ALL ON FUNCTION attendance_check_in(uuid) FROM anon");
    expect(migration).toContain("REVOKE ALL ON FUNCTION attendance_clock_out(uuid) FROM anon");
    expect(migration).toContain("REVOKE ALL ON FUNCTION attendance_day_context(uuid, date) FROM anon");
  });

  it("derives organization local day boundaries inside PostgreSQL, covers: AC-4", () => {
    const migration = readFileSync(attendanceMigrationPath, "utf8");

    expect(migration).toContain("attendance_day_context");
    expect(migration).toContain("pg_timezone_names");
    expect(migration).toContain("AT TIME ZONE resolved_timezone");
    expect(migration).toContain("FUTURE_REVIEW_DATE");
  });

  it("protects overtime evidence, organization boundaries, and append only history, covers: overtime AC-6, AC-7, AC-10, and AC-11", () => {
    const migration = readFileSync(overtimeMigrationPath, "utf8");

    expect(migration).toContain("ALTER TABLE overtime_policies ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE timecards ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("validate_overtime_relationships");
    expect(migration).toContain("timecards_snapshot_immutable");
    expect(migration).toContain("protect_timecard_child_snapshot");
    expect(migration).toContain("timecard_events_append_only");
    expect(migration).toContain("attendance_corrections_append_only");
    expect(migration).toContain("authorized_people_can_read_timecards");
    expect(migration).toContain("authorized_people_can_read_timecard_events");
  });
});
