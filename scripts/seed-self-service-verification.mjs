import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SELF_SERVICE_E2E_PASSWORD || "SelfService!2026";
const bucket = process.env.SUPABASE_PAYSLIPS_BUCKET || "payslips";
if (!databaseUrl || !supabaseUrl || !serviceRoleKey) throw new Error("Local DATABASE_URL, Supabase URL, and service role key are required");

const sql = postgres(databaseUrl, { max: 1 });
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const slug = "hr-pulse-self-service-verification";
const emails = {
  employee: "self-service-employee@example.test",
  manager: "self-service-manager@example.test",
  administrator: "self-service-administrator@example.test",
  otherOrganization: "self-service-other-organization@example.test",
};

function uuid(label) {
  const hex = createHash("sha256").update(`hr-pulse-self-service:${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4"; hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function hash(value) { return createHash("sha256").update(`self-service:${value}`).digest("hex"); }
function period(index) {
  const end = new Date(Date.UTC(2024, 11 - index, 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
async function ensureUser(email, label) {
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = existing.users.find((user) => user.email?.toLowerCase() === email);
  if (found) return found;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return data.user;
}

const users = {
  employee: await ensureUser(emails.employee, "employee"),
  manager: await ensureUser(emails.manager, "manager"),
  administrator: await ensureUser(emails.administrator, "administrator"),
  otherOrganization: await ensureUser(emails.otherOrganization, "other-organization"),
};
const ids = {
  organization: uuid("organization"),
  schedule: uuid("schedule"),
  policy: uuid("policy"),
  employeeProfile: uuid("employee-profile"),
  managerProfile: uuid("manager-profile"),
  administratorProfile: uuid("administrator-profile"),
  employee: uuid("employee"),
  manager: uuid("manager"),
  administrator: uuid("administrator"),
  setting: uuid("setting"),
  managerSetting: uuid("manager-setting"),
  organizationB: uuid("organization-b"),
  organizationBSchedule: uuid("organization-b-schedule"),
  organizationBPolicy: uuid("organization-b-policy"),
  organizationBSetting: uuid("organization-b-setting"),
  otherProfile: uuid("other-profile"),
  otherEmployee: uuid("other-employee"),
  managerRun: uuid("manager-run"),
  managerPayout: uuid("manager-payout"),
  managerPayslip: uuid("manager-payslip"),
  managerTimecard: uuid("manager-timecard"),
  foreignRun: uuid("foreign-run"),
  foreignPayout: uuid("foreign-payout"),
  foreignPayslip: uuid("foreign-payslip"),
  foreignTimecard: uuid("foreign-timecard"),
  missingPathRun: uuid("missing-path-run"),
  missingPathPayout: uuid("missing-path-payout"),
  missingPathPayslip: uuid("missing-path-payslip"),
  pendingRun: uuid("pending-run"),
  pendingPayout: uuid("pending-payout"),
  pendingPayslip: uuid("pending-payslip"),
  failedRun: uuid("failed-run"),
  failedPayout: uuid("failed-payout"),
  failedPayslip: uuid("failed-payslip"),
};

try {
  await sql.begin(async (tx) => {
    await tx`insert into organizations (id, name, slug, status, timezone, default_currency, region_code) values (${ids.organization}, 'HR Pulse Self Service Verification', ${slug}, 'active', 'Asia/Manila', 'PHP', 'PH') on conflict (slug) do update set status = 'active', updated_at = now()`;
    const [existingOrganization] = await tx`select id from organizations where slug = ${slug}`;
    ids.organization = existingOrganization.id;
    await tx`insert into profiles (id, auth_user_id, email, display_name, status) values
      (${ids.employeeProfile}, ${users.employee.id}, ${emails.employee}, 'Self Service Employee', 'active'),
      (${ids.managerProfile}, ${users.manager.id}, ${emails.manager}, 'Self Service Manager', 'active'),
      (${ids.administratorProfile}, ${users.administrator.id}, ${emails.administrator}, 'Self Service Administrator', 'active')
      on conflict (auth_user_id) do update set email = excluded.email, display_name = excluded.display_name, status = 'active', updated_at = now()`;
    const profileRows = await tx`select id, auth_user_id from profiles where auth_user_id in (${users.employee.id}, ${users.manager.id}, ${users.administrator.id})`;
    ids.employeeProfile = profileRows.find((row) => row.auth_user_id === users.employee.id).id;
    ids.managerProfile = profileRows.find((row) => row.auth_user_id === users.manager.id).id;
    ids.administratorProfile = profileRows.find((row) => row.auth_user_id === users.administrator.id).id;
    await tx`insert into memberships (organization_id, profile_id, role, status) values
      (${ids.organization}, ${ids.employeeProfile}, 'employee', 'active'),
      (${ids.organization}, ${ids.managerProfile}, 'manager', 'active'),
      (${ids.organization}, ${ids.administratorProfile}, 'administrator', 'active')
      on conflict (organization_id, profile_id) do update set role = excluded.role, status = 'active', deactivated_at = null, updated_at = now()`;
    await tx`insert into organizations (id, name, slug, status, timezone, default_currency, region_code) values (${ids.organizationB}, 'HR Pulse Other Organization', 'hr-pulse-self-service-other-organization', 'active', 'Asia/Manila', 'PHP', 'PH') on conflict (slug) do update set status = 'active', updated_at = now()`;
    await tx`insert into profiles (id, auth_user_id, email, display_name, status) values (${ids.otherProfile}, ${users.otherOrganization.id}, ${emails.otherOrganization}, 'Other Organization Employee', 'active') on conflict (auth_user_id) do update set email = excluded.email, display_name = excluded.display_name, status = 'active', updated_at = now()`;
    const [existingOrganizationB] = await tx`select id from organizations where slug = 'hr-pulse-self-service-other-organization'`;
    ids.organizationB = existingOrganizationB.id;
    const [existingOtherProfile] = await tx`select id from profiles where auth_user_id = ${users.otherOrganization.id}`;
    ids.otherProfile = existingOtherProfile.id;
    await tx`insert into memberships (organization_id, profile_id, role, status) values (${ids.organizationB}, ${ids.otherProfile}, 'employee', 'active') on conflict (organization_id, profile_id) do update set role = 'employee', status = 'active', deactivated_at = null, updated_at = now()`;
    await tx`insert into payroll_schedules (id, organization_id, frequency, effective_start_date, version) values (${ids.organizationBSchedule}, ${ids.organizationB}, 'monthly', '2023-01-01', 1) on conflict (organization_id) do update set frequency = excluded.frequency, effective_start_date = excluded.effective_start_date, updated_at = now()`;
    await tx`insert into payroll_schedules (id, organization_id, frequency, effective_start_date, version) values (${ids.schedule}, ${ids.organization}, 'monthly', '2023-01-01', 1) on conflict (organization_id) do update set frequency = excluded.frequency, effective_start_date = excluded.effective_start_date, updated_at = now()`;
    await tx`insert into overtime_policies (id, organization_id, version, effective_from, daily_threshold_minutes, enabled) values (${ids.policy}, ${ids.organization}, 1, '2023-01-01', 480, true) on conflict (organization_id, effective_from) do nothing`;
    await tx`insert into employees (id, organization_id, profile_id, employee_number, legal_name, preferred_name, email, phone, hire_date, department, title, work_location, status, version) values
      (${ids.employee}, ${ids.organization}, ${ids.employeeProfile}, 'SELF-0001', 'Synthetic Self Service Employee', 'Sam Employee', ${emails.employee}, '+639171234567', '2023-01-01', 'People Operations', 'Employee', 'Local Office', 'active', 1),
      (${ids.manager}, ${ids.organization}, ${ids.managerProfile}, 'SELF-0002', 'Synthetic Self Service Manager', null, ${emails.manager}, '+639171234568', '2023-01-01', 'People Operations', 'Manager', 'Local Office', 'active', 1),
      (${ids.administrator}, ${ids.organization}, ${ids.administratorProfile}, 'SELF-0003', 'Synthetic Self Service Administrator', null, ${emails.administrator}, '+639171234569', '2023-01-01', 'People Operations', 'Administrator', 'Local Office', 'active', 1)
      on conflict (id) do update set profile_id = excluded.profile_id, status = 'active', updated_at = now()`;
    await tx`update employees set manager_id = ${ids.manager} where id = ${ids.employee}`;
    await tx`insert into pay_settings (id, employee_id, effective_from, pay_frequency, gross_amount_minor, currency, overtime_eligible, standard_period_minutes, overtime_multiplier_basis_points, version) values (${ids.setting}, ${ids.employee}, '2023-01-01', 'monthly', 100000, 'PHP', true, 9600, 15000, 1) on conflict (id) do update set gross_amount_minor = excluded.gross_amount_minor, updated_at = now()`;
    await tx`insert into pay_settings (id, employee_id, effective_from, pay_frequency, gross_amount_minor, currency, overtime_eligible, standard_period_minutes, overtime_multiplier_basis_points, version) values (${ids.managerSetting}, ${ids.manager}, '2023-01-01', 'monthly', 120000, 'PHP', true, 9600, 15000, 1) on conflict (id) do update set gross_amount_minor = excluded.gross_amount_minor, updated_at = now()`;
    await tx`insert into employees (id, organization_id, profile_id, employee_number, legal_name, preferred_name, email, hire_date, department, title, work_location, status, version) values (${ids.otherEmployee}, ${ids.organizationB}, ${ids.otherProfile}, 'SELF-0101', 'Other Organization Employee', null, ${emails.otherOrganization}, '2023-01-01', 'People Operations', 'Employee', 'Other Office', 'active', 1) on conflict (id) do update set profile_id = excluded.profile_id, status = 'active', updated_at = now()`;
    await tx`insert into overtime_policies (id, organization_id, version, effective_from, daily_threshold_minutes, enabled) values (${ids.organizationBPolicy}, ${ids.organizationB}, 1, '2023-01-01', 480, true) on conflict (organization_id, effective_from) do nothing`;
    await tx`insert into pay_settings (id, employee_id, effective_from, pay_frequency, gross_amount_minor, currency, overtime_eligible, standard_period_minutes, overtime_multiplier_basis_points, version) values (${ids.organizationBSetting}, ${ids.otherEmployee}, '2023-01-01', 'monthly', 100000, 'PHP', true, 9600, 15000, 1) on conflict (id) do update set gross_amount_minor = excluded.gross_amount_minor, updated_at = now()`;
    const deductionId = uuid("deduction");
    await tx`insert into pay_setting_deductions (id, pay_setting_id, name, amount_minor, display_order) values (${deductionId}, ${ids.setting}, 'Synthetic health deduction', 10000, 0) on conflict do nothing`;

    for (let index = 0; index < 14; index += 1) {
      const current = period(index + 1);
      const runId = uuid(`run:${index}`); const payoutId = uuid(`payout:${index}`); const payslipId = uuid(`payslip:${index}`); const cardId = uuid(`timecard:${index}`); const dayId = uuid(`day:${index}`); const intervalId = uuid(`interval:${index}`); const runHash = hash(`run:${index}`);
      const documentBytes = Buffer.from(`Synthetic payslip ${payslipId}\n`); const documentChecksum = createHash("sha256").update(documentBytes).digest("hex");
      await tx`insert into payroll_runs (id, organization_id, payroll_schedule_id, period_start, period_end, status, organization_name, organization_timezone, pay_frequency, schedule_version, gross_total_minor, deductions_total_minor, net_total_minor, currency, currency_exponent, currency_map_version, calculation_version, payroll_reference, confirmed_by_profile_id, source_fingerprint, preview_token_hash, processing_generation, queue_status, completed_at) values (${runId}, ${ids.organization}, ${ids.schedule}, ${current.start}, ${current.end}, 'completed', 'HR Pulse Self Service Verification', 'Asia/Manila', 'monthly', 1, 100000, 10000, 90000, 'PHP', 2, 'iso-4217-2026-01', 'fixed-pay-v1', ${`SELF-${index + 1}`}, ${ids.administratorProfile}, ${runHash}, ${hash(`preview:${index}`)}, 1, 'submitted', now()) on conflict (id) do nothing`;
      await tx`insert into payouts (id, payroll_run_id, employee_id, pay_setting_id, employee_number, legal_name, gross_amount_minor, deductions_amount_minor, net_amount_minor, currency, currency_exponent, calculation_version, status, payroll_period_end) values (${payoutId}, ${runId}, ${ids.employee}, ${ids.setting}, 'SELF-0001', 'Synthetic Self Service Employee', 100000, 10000, 90000, 'PHP', 2, 'fixed-pay-v1', 'finalized', ${current.end}) on conflict (id) do nothing`;
      await tx`insert into payslips (id, payout_id, status, storage_path, generated_at, template_version, sha256, file_size_bytes, mime_type, immutable) values (${payslipId}, ${payoutId}, 'generated', ${`self-service/${payslipId}.pdf`}, now(), 1, ${documentChecksum}, ${documentBytes.length}, 'application/pdf', true) on conflict (id) do nothing`;
      await tx`insert into timecards (id, organization_id, employee_id, payroll_schedule_id, period_start, period_end, status, version, timezone, submitted_at, approved_at, overtime_policy_id, pay_setting_id, policy_version, daily_threshold_minutes, policy_enabled, overtime_eligible, standard_period_minutes, overtime_multiplier_basis_points, base_gross_amount_minor, currency, worked_seconds, regular_seconds, overtime_seconds, payable_overtime_minutes, overtime_amount_minor, zero_hours_confirmed) values (${cardId}, ${ids.organization}, ${ids.employee}, ${ids.schedule}, ${current.start}, ${current.end}, 'approved', 1, 'Asia/Manila', now(), now(), ${ids.policy}, ${ids.setting}, 1, 480, true, true, 9600, 15000, 100000, 'PHP', 28800, 28800, 0, 0, 0, false) on conflict (id) do nothing`;
      await tx`insert into payout_deduction_lines (id, payout_id, source_deduction_id, name, amount_minor, display_order) values (${uuid(`payout-deduction:${index}`)}, ${payoutId}, ${deductionId}, 'Synthetic health deduction', 10000, 0) on conflict do nothing`;
      await tx`insert into payout_earning_lines (id, payout_id, timecard_id, earning_type, payable_minutes, base_gross_amount_minor, standard_period_minutes, multiplier_basis_points, currency, amount_minor, display_order) values (${uuid(`payout-earning:${index}`)}, ${payoutId}, ${cardId}, 'overtime', 0, 100000, 9600, 15000, 'PHP', 0, 0) on conflict do nothing`;
      await tx`insert into attendance_intervals (id, employee_id, clock_in, clock_out, source, status) values (${intervalId}, ${ids.employee}, ${`${current.start}T09:00:00+08:00`}, ${`${current.start}T17:00:00+08:00`}, 'employee', 'completed') on conflict (id) do nothing`;
      await tx`insert into timecard_days (id, timecard_id, local_date, worked_seconds, regular_seconds, overtime_seconds, payable_overtime_minutes, overtime_amount_minor, currency) values (${dayId}, ${cardId}, ${current.start}, 28800, 28800, 0, 0, 0, 'PHP') on conflict (id) do nothing`;
      await tx`insert into timecard_day_sources (id, timecard_day_id, attendance_interval_id, clock_in_snapshot, clock_out_snapshot, allocated_seconds) values (${uuid(`source:${index}`)}, ${dayId}, ${intervalId}, ${`${current.start}T09:00:00+08:00`}, ${`${current.start}T17:00:00+08:00`}, 28800) on conflict (id) do nothing`;
    }
    const current = period(15); const cardId = uuid("nonapproved-card");
    await tx`insert into timecards (id, organization_id, employee_id, payroll_schedule_id, period_start, period_end, status, version, timezone, overtime_policy_id, pay_setting_id, policy_version, daily_threshold_minutes, policy_enabled, overtime_eligible, standard_period_minutes, overtime_multiplier_basis_points, base_gross_amount_minor, currency, worked_seconds, regular_seconds, overtime_seconds, payable_overtime_minutes, overtime_amount_minor, zero_hours_confirmed) values (${cardId}, ${ids.organization}, ${ids.employee}, ${ids.schedule}, ${current.start}, ${current.end}, 'submitted', 1, 'Asia/Manila', ${ids.policy}, ${ids.setting}, 1, 480, true, true, 9600, 15000, 100000, 'PHP', 28800, 28800, 0, 0, 0, false) on conflict (id) do nothing`;
    const managerCurrent = period(16);
    const managerBytes = Buffer.from(`Synthetic manager payslip ${ids.managerPayslip}\n`);
    await tx`insert into payroll_runs (id, organization_id, payroll_schedule_id, period_start, period_end, status, organization_name, organization_timezone, pay_frequency, schedule_version, gross_total_minor, deductions_total_minor, net_total_minor, currency, currency_exponent, currency_map_version, calculation_version, payroll_reference, confirmed_by_profile_id, source_fingerprint, preview_token_hash, processing_generation, queue_status, completed_at) values (${ids.managerRun}, ${ids.organization}, ${ids.schedule}, ${managerCurrent.start}, ${managerCurrent.end}, 'completed', 'HR Pulse Self Service Verification', 'Asia/Manila', 'monthly', 1, 120000, 0, 120000, 'PHP', 2, 'iso-4217-2026-01', 'fixed-pay-v1', 'SELF-MANAGER-1', ${ids.administratorProfile}, ${hash('manager-run')}, ${hash('manager-preview')}, 1, 'submitted', now()) on conflict (id) do nothing`;
    await tx`insert into payouts (id, payroll_run_id, employee_id, pay_setting_id, employee_number, legal_name, gross_amount_minor, deductions_amount_minor, net_amount_minor, currency, currency_exponent, calculation_version, status, payroll_period_end) values (${ids.managerPayout}, ${ids.managerRun}, ${ids.manager}, ${ids.managerSetting}, 'SELF-0002', 'Synthetic Self Service Manager', 120000, 0, 120000, 'PHP', 2, 'fixed-pay-v1', 'finalized', ${managerCurrent.end}) on conflict (id) do nothing`;
    await tx`insert into payslips (id, payout_id, status, storage_path, generated_at, template_version, sha256, file_size_bytes, mime_type, immutable) values (${ids.managerPayslip}, ${ids.managerPayout}, 'generated', ${`self-service/${ids.managerPayslip}.pdf`}, now(), 1, ${createHash('sha256').update(managerBytes).digest('hex')}, ${managerBytes.length}, 'application/pdf', true) on conflict (id) do nothing`;
    await tx`insert into timecards (id, organization_id, employee_id, payroll_schedule_id, period_start, period_end, status, version, timezone, submitted_at, approved_at, overtime_policy_id, pay_setting_id, policy_version, daily_threshold_minutes, policy_enabled, overtime_eligible, standard_period_minutes, overtime_multiplier_basis_points, base_gross_amount_minor, currency, worked_seconds, regular_seconds, overtime_seconds, payable_overtime_minutes, overtime_amount_minor, zero_hours_confirmed) values (${ids.managerTimecard}, ${ids.organization}, ${ids.manager}, ${ids.schedule}, ${managerCurrent.start}, ${managerCurrent.end}, 'approved', 1, 'Asia/Manila', now(), now(), ${ids.policy}, ${ids.managerSetting}, 1, 480, true, true, 9600, 15000, 120000, 'PHP', 28800, 28800, 0, 0, 0, false) on conflict (id) do nothing`;

    const foreignCurrent = period(19);
    const foreignBytes = Buffer.from(`Synthetic foreign organization payslip ${ids.foreignPayslip}\n`);
    await tx`insert into payroll_runs (id, organization_id, payroll_schedule_id, period_start, period_end, status, organization_name, organization_timezone, pay_frequency, schedule_version, gross_total_minor, deductions_total_minor, net_total_minor, currency, currency_exponent, currency_map_version, calculation_version, payroll_reference, confirmed_by_profile_id, source_fingerprint, preview_token_hash, processing_generation, queue_status, completed_at) values (${ids.foreignRun}, ${ids.organizationB}, ${ids.organizationBSchedule}, ${foreignCurrent.start}, ${foreignCurrent.end}, 'completed', 'HR Pulse Other Organization', 'Asia/Manila', 'monthly', 1, 100000, 0, 100000, 'PHP', 2, 'iso-4217-2026-01', 'fixed-pay-v1', 'FOREIGN-1', ${ids.otherProfile}, ${hash('foreign-run')}, ${hash('foreign-preview')}, 1, 'submitted', now()) on conflict (id) do nothing`;
    await tx`insert into payouts (id, payroll_run_id, employee_id, pay_setting_id, employee_number, legal_name, gross_amount_minor, deductions_amount_minor, net_amount_minor, currency, currency_exponent, calculation_version, status, payroll_period_end) values (${ids.foreignPayout}, ${ids.foreignRun}, ${ids.otherEmployee}, ${ids.organizationBSetting}, 'SELF-0101', 'Other Organization Employee', 100000, 0, 100000, 'PHP', 2, 'fixed-pay-v1', 'finalized', ${foreignCurrent.end}) on conflict (id) do nothing`;
    await tx`insert into payslips (id, payout_id, status, storage_path, generated_at, template_version, sha256, file_size_bytes, mime_type, immutable) values (${ids.foreignPayslip}, ${ids.foreignPayout}, 'generated', ${`self-service/${ids.foreignPayslip}.pdf`}, now(), 1, ${createHash('sha256').update(foreignBytes).digest('hex')}, ${foreignBytes.length}, 'application/pdf', true) on conflict (id) do nothing`;
    await tx`insert into timecards (id, organization_id, employee_id, payroll_schedule_id, period_start, period_end, status, version, timezone, submitted_at, approved_at, overtime_policy_id, pay_setting_id, policy_version, daily_threshold_minutes, policy_enabled, overtime_eligible, standard_period_minutes, overtime_multiplier_basis_points, base_gross_amount_minor, currency, worked_seconds, regular_seconds, overtime_seconds, payable_overtime_minutes, overtime_amount_minor, zero_hours_confirmed) values (${ids.foreignTimecard}, ${ids.organizationB}, ${ids.otherEmployee}, ${ids.organizationBSchedule}, ${foreignCurrent.start}, ${foreignCurrent.end}, 'approved', 1, 'Asia/Manila', now(), now(), ${ids.organizationBPolicy}, ${ids.organizationBSetting}, 1, 480, true, true, 9600, 15000, 100000, 'PHP', 28800, 28800, 0, 0, 0, false) on conflict (id) do nothing`;

    const missingPathCurrent = period(20);
    await tx`insert into payroll_runs (id, organization_id, payroll_schedule_id, period_start, period_end, status, organization_name, organization_timezone, pay_frequency, schedule_version, gross_total_minor, deductions_total_minor, net_total_minor, currency, currency_exponent, currency_map_version, calculation_version, payroll_reference, confirmed_by_profile_id, source_fingerprint, preview_token_hash, processing_generation, queue_status, completed_at) values (${ids.missingPathRun}, ${ids.organization}, ${ids.schedule}, ${missingPathCurrent.start}, ${missingPathCurrent.end}, 'completed', 'HR Pulse Self Service Verification', 'Asia/Manila', 'monthly', 1, 100000, 0, 100000, 'PHP', 2, 'iso-4217-2026-01', 'fixed-pay-v1', 'MISSING-PATH-1', ${ids.administratorProfile}, ${hash('missing-path-run')}, ${hash('missing-path-preview')}, 1, 'submitted', now()) on conflict (id) do nothing`;
    await tx`insert into payouts (id, payroll_run_id, employee_id, pay_setting_id, employee_number, legal_name, gross_amount_minor, deductions_amount_minor, net_amount_minor, currency, currency_exponent, calculation_version, status, payroll_period_end) values (${ids.missingPathPayout}, ${ids.missingPathRun}, ${ids.employee}, ${ids.setting}, 'SELF-0001', 'Synthetic Self Service Employee', 100000, 0, 100000, 'PHP', 2, 'fixed-pay-v1', 'finalized', ${missingPathCurrent.end}) on conflict (id) do nothing`;
    await tx`insert into payslips (id, payout_id, status, storage_path, generated_at, template_version, sha256, file_size_bytes, mime_type, immutable) values (${ids.missingPathPayslip}, ${ids.missingPathPayout}, 'generated', ${`self-service/missing-${ids.missingPathPayslip}.pdf`}, now(), 1, ${'a'.repeat(64)}, 1, 'application/pdf', true) on conflict (id) do nothing`;
    const pendingCurrent = period(17);
    await tx`insert into payroll_runs (id, organization_id, payroll_schedule_id, period_start, period_end, status, organization_name, organization_timezone, pay_frequency, schedule_version, gross_total_minor, deductions_total_minor, net_total_minor, currency, currency_exponent, currency_map_version, calculation_version, payroll_reference, confirmed_by_profile_id, source_fingerprint, preview_token_hash, processing_generation, queue_status) values (${ids.pendingRun}, ${ids.organization}, ${ids.schedule}, ${pendingCurrent.start}, ${pendingCurrent.end}, 'completed', 'HR Pulse Self Service Verification', 'Asia/Manila', 'monthly', 1, 100000, 10000, 90000, 'PHP', 2, 'iso-4217-2026-01', 'fixed-pay-v1', 'SELF-PENDING-1', ${ids.administratorProfile}, ${hash('pending-run')}, ${hash('pending-preview')}, 1, 'submitted') on conflict (id) do nothing`;
    await tx`insert into payouts (id, payroll_run_id, employee_id, pay_setting_id, employee_number, legal_name, gross_amount_minor, deductions_amount_minor, net_amount_minor, currency, currency_exponent, calculation_version, status, payroll_period_end) values (${ids.pendingPayout}, ${ids.pendingRun}, ${ids.employee}, ${ids.setting}, 'SELF-0001', 'Synthetic Self Service Employee', 100000, 10000, 90000, 'PHP', 2, 'fixed-pay-v1', 'finalized', ${pendingCurrent.end}) on conflict (id) do nothing`;
    await tx`insert into payslips (id, payout_id, status, storage_path, generated_at, template_version, sha256, file_size_bytes, mime_type, immutable) values (${ids.pendingPayslip}, ${ids.pendingPayout}, 'pending', null, null, null, null, null, null, false) on conflict (id) do nothing`;
    const failedCurrent = period(18);
    await tx`insert into payroll_runs (id, organization_id, payroll_schedule_id, period_start, period_end, status, organization_name, organization_timezone, pay_frequency, schedule_version, gross_total_minor, deductions_total_minor, net_total_minor, currency, currency_exponent, currency_map_version, calculation_version, payroll_reference, confirmed_by_profile_id, source_fingerprint, preview_token_hash, processing_generation, queue_status, error_code, error_guidance) values (${ids.failedRun}, ${ids.organization}, ${ids.schedule}, ${failedCurrent.start}, ${failedCurrent.end}, 'failed', 'HR Pulse Self Service Verification', 'Asia/Manila', 'monthly', 1, 100000, 10000, 90000, 'PHP', 2, 'iso-4217-2026-01', 'fixed-pay-v1', 'SELF-FAILED-1', ${ids.administratorProfile}, ${hash('failed-run')}, ${hash('failed-preview')}, 1, 'failed', 'SYNTHETIC_FAILURE', 'Synthetic failure for verification') on conflict (id) do nothing`;
    await tx`insert into payouts (id, payroll_run_id, employee_id, pay_setting_id, employee_number, legal_name, gross_amount_minor, deductions_amount_minor, net_amount_minor, currency, currency_exponent, calculation_version, status, payroll_period_end) values (${ids.failedPayout}, ${ids.failedRun}, ${ids.employee}, ${ids.setting}, 'SELF-0001', 'Synthetic Self Service Employee', 100000, 10000, 90000, 'PHP', 2, 'fixed-pay-v1', 'failed', ${failedCurrent.end}) on conflict (id) do nothing`;
    await tx`insert into payslips (id, payout_id, status, storage_path, generated_at, template_version, sha256, file_size_bytes, mime_type, immutable) values (${ids.failedPayslip}, ${ids.failedPayout}, 'failed', null, null, null, null, null, null, false) on conflict (id) do nothing`;
  });

  const { error: bucketError } = await admin.storage.createBucket(bucket, { public: false });
  if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) throw bucketError;
  for (let index = 0; index < 14; index += 1) {
    const payslipId = uuid(`payslip:${index}`); const bytes = Buffer.from(`Synthetic payslip ${payslipId}\n`); const path = `self-service/${payslipId}.pdf`;
    const { error } = await admin.storage.from(bucket).upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (error) throw error;
  }
  const managerPath = `self-service/${ids.managerPayslip}.pdf`;
  const managerBytes = Buffer.from(`Synthetic manager payslip ${ids.managerPayslip}\n`);
  const { error: managerUploadError } = await admin.storage.from(bucket).upload(managerPath, managerBytes, { contentType: "application/pdf", upsert: true });
  if (managerUploadError) throw managerUploadError;
  const foreignPath = `self-service/${ids.foreignPayslip}.pdf`;
  const foreignBytes = Buffer.from(`Synthetic foreign organization payslip ${ids.foreignPayslip}\n`);
  const { error: foreignUploadError } = await admin.storage.from(bucket).upload(foreignPath, foreignBytes, { contentType: "application/pdf", upsert: true });
  if (foreignUploadError) throw foreignUploadError;
  console.log(JSON.stringify({ organizationId: ids.organization, organizationSlug: slug, employee: { email: emails.employee, password }, manager: { email: emails.manager, password }, administrator: { email: emails.administrator, password }, employeeId: ids.employee, ready: true }));
} finally { await sql.end(); }
