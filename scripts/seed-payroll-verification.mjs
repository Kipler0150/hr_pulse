import { createHash } from "node:crypto";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const sampleEmail = process.env.SAMP_EMAIL;

if (!databaseUrl || !sampleEmail) {
  throw new Error("DATABASE_URL and SAMP_EMAIL are required to seed payroll verification data");
}

const sql = postgres(databaseUrl, { max: 1 });

function digest(value) {
  return createHash("sha256").update(`hr-pulse-payroll-verification:${value}`).digest("hex");
}

function stableUuid(value) {
  const hex = digest(value).slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const compact = hex.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function monthPeriod(offset) {
  const start = new Date(Date.UTC(2018, offset, 1));
  const end = new Date(Date.UTC(2018, offset + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

const organizationId = stableUuid("organization");
const scheduleId = stableUuid("schedule");
const managerProfileId = stableUuid("manager-profile");
const employeeProfileId = stableUuid("employee-profile");

async function insertRun(transaction, {
  id,
  periodStart,
  periodEnd,
  status,
  grossTotalMinor = 0,
  deductionsTotalMinor = 0,
  netTotalMinor = 0,
  queueStatus = "submitted",
  leaseOwner = null,
  leaseExpiresAt = null,
  lastProgressAt = new Date(),
  errorCode = null,
  errorGuidance = null,
  adminProfileId,
}) {
  await transaction`
    insert into payroll_runs (
      id, organization_id, payroll_schedule_id, period_start, period_end, status,
      organization_name, organization_timezone, pay_frequency, schedule_version,
      gross_total_minor, deductions_total_minor, net_total_minor,
      currency, currency_exponent, currency_map_version, calculation_version,
      payroll_reference, confirmed_by_profile_id, source_fingerprint, preview_token_hash,
      processing_generation, queue_status, lease_owner, lease_expires_at, last_progress_at,
      error_code, error_guidance
    ) values (
      ${id}, ${organizationId}, ${scheduleId}, ${periodStart}, ${periodEnd}, ${status},
      'HR Pulse Payroll Verification', 'Asia/Manila', 'monthly', 1,
      ${grossTotalMinor}, ${deductionsTotalMinor}, ${netTotalMinor},
      'PHP', 2, 'iso-4217-2026-01', 'fixed-pay-v1',
      ${`VERIFY-${id.replaceAll("-", "")}`}, ${adminProfileId}, ${digest(`fingerprint:${id}`)}, ${digest(`preview:${id}`)},
      1, ${queueStatus}, ${leaseOwner}, ${leaseExpiresAt}, ${lastProgressAt},
      ${errorCode}, ${errorGuidance}
    )
    on conflict (id) do nothing
  `;
}

try {
  const summary = await sql.begin(async (transaction) => {
    const [administrator] = await transaction`
      select id
      from profiles
      where lower(email) = lower(${sampleEmail}) and status = 'active'
      limit 1
    `;
    if (!administrator) throw new Error("The sample administrator profile is required for payroll verification fixtures");

    await transaction`
      insert into organizations (id, name, slug, status, timezone, default_currency, region_code)
      values (${organizationId}, 'HR Pulse Payroll Verification', 'hr-pulse-payroll-verification', 'active', 'Asia/Manila', 'PHP', 'PH')
      on conflict (slug) do update set
        name = excluded.name,
        status = 'active',
        timezone = excluded.timezone,
        default_currency = excluded.default_currency,
        region_code = excluded.region_code,
        updated_at = now()
    `;
    const [organization] = await transaction`
      select id from organizations where slug = 'hr-pulse-payroll-verification'
    `;
    if (organization.id !== organizationId) throw new Error("The verification organization slug is already owned by another record");

    await transaction`
      insert into payroll_schedules (id, organization_id, frequency, effective_start_date, version)
      values (${scheduleId}, ${organizationId}, 'monthly', '2018-01-01', 1)
      on conflict (organization_id) do nothing
    `;
    await transaction`
      insert into memberships (organization_id, profile_id, role, status)
      values (${organizationId}, ${administrator.id}, 'administrator', 'active')
      on conflict (organization_id, profile_id) do update set role = 'administrator', status = 'active', deactivated_at = null
    `;

    await transaction`
      insert into profiles (id, auth_user_id, email, display_name, status)
      values
        (${managerProfileId}, ${stableUuid("manager-auth")}, 'payroll-verification-manager@example.test', 'Payroll Verification Manager', 'active'),
        (${employeeProfileId}, ${stableUuid("employee-auth")}, 'payroll-verification-employee@example.test', 'Payroll Verification Employee', 'active')
      on conflict (auth_user_id) do update set status = 'active', updated_at = now()
    `;
    await transaction`
      insert into memberships (organization_id, profile_id, role, status)
      values
        (${organizationId}, ${managerProfileId}, 'manager', 'active'),
        (${organizationId}, ${employeeProfileId}, 'employee', 'active')
      on conflict (organization_id, profile_id) do update set role = excluded.role, status = 'active', deactivated_at = null
    `;

    await transaction`
      insert into employees (
        organization_id, employee_number, legal_name, preferred_name, email,
        hire_date, department, title, work_location, status
      )
      select
        ${organizationId},
        'VERIFY-' || lpad(series::text, 4, '0'),
        'Synthetic Payroll Employee ' || lpad(series::text, 4, '0'),
        'Synthetic ' || lpad(series::text, 4, '0'),
        'payroll-verification-' || lpad(series::text, 4, '0') || '@example.test',
        '2018-01-01', 'Verification', 'Synthetic employee', 'Synthetic location', 'active'
      from generate_series(1, 501) series
      on conflict (organization_id, employee_number) do update set
        status = 'active',
        hire_date = excluded.hire_date,
        updated_at = now()
    `;
    await transaction`
      update employees
      set profile_id = ${employeeProfileId}, updated_at = now()
      where organization_id = ${organizationId}
        and employee_number = 'VERIFY-0001'
        and (profile_id is null or profile_id = ${employeeProfileId})
    `;

    await transaction`
      insert into pay_settings (
        employee_id, effective_from, effective_to, pay_frequency,
        gross_amount_minor, currency, version
      )
      select employee.id, '2018-01-01', null, 'monthly', 100000, 'PHP', 1
      from employees employee
      where employee.organization_id = ${organizationId}
        and not exists (
          select 1 from pay_settings setting where setting.employee_id = employee.id
        )
    `;
    await transaction`
      insert into pay_setting_deductions (pay_setting_id, name, amount_minor, display_order)
      select setting.id, 'Synthetic fixed deduction', 10000, 0
      from pay_settings setting
      join employees employee on employee.id = setting.employee_id
      where employee.organization_id = ${organizationId}
        and not exists (
          select 1 from pay_setting_deductions deduction
          where deduction.pay_setting_id = setting.id and lower(deduction.name) = lower('Synthetic fixed deduction')
        )
    `;

    await transaction`
      update employees
      set status = 'inactive', updated_at = now()
      where organization_id = ${organizationId}
    `;

    for (let index = 0; index < 51; index += 1) {
      const period = monthPeriod(index);
      await insertRun(transaction, {
        id: stableUuid(`list-run:${index}`),
        periodStart: period.start,
        periodEnd: period.end,
        status: "completed",
        adminProfileId: administrator.id,
      });
    }

    const [completedEmployee] = await transaction`
      select employee.id, employee.employee_number, employee.legal_name, setting.id as pay_setting_id
      from employees employee
      join pay_settings setting on setting.employee_id = employee.id
      where employee.organization_id = ${organizationId}
        and employee.employee_number = 'VERIFY-0001'
    `;
    const completedRuns = await transaction`
      select id, period_end
      from payroll_runs
      where organization_id = ${organizationId} and status = 'completed'
    `;
    for (const completedRun of completedRuns) {
      const completedPayoutId = stableUuid(`completed-payout:${completedRun.id}`);
      const completedPayslipId = stableUuid(`completed-payslip:${completedRun.id}`);
      const [existingPayout] = await transaction`
        select id
        from payouts
        where payroll_run_id = ${completedRun.id} and employee_id = ${completedEmployee.id}
      `;
      let payoutId = existingPayout?.id;
      if (!payoutId) {
        const [createdPayout] = await transaction`
        insert into payouts (
          id, payroll_run_id, employee_id, pay_setting_id, employee_number, legal_name,
          gross_amount_minor, deductions_amount_minor, net_amount_minor,
          currency, currency_exponent, calculation_version, status, payroll_period_end
        ) values (
          ${completedPayoutId}, ${completedRun.id}, ${completedEmployee.id}, ${completedEmployee.pay_setting_id},
          ${completedEmployee.employee_number}, ${completedEmployee.legal_name},
          100000, 10000, 90000, 'PHP', 2, 'fixed-pay-v1', 'finalized', ${completedRun.period_end}
        )
        on conflict (payroll_run_id, employee_id) do nothing
        returning id
      `;
        payoutId = createdPayout.id;
      }
      await transaction`
        insert into payslips (
          id, payout_id, status, storage_path, generated_at, template_version,
          sha256, file_size_bytes, mime_type, immutable
        ) values (
          ${completedPayslipId}, ${payoutId}, 'generated', 'payroll-verification/completed.pdf',
          now(), 1, ${digest(`completed-payslip:${completedRun.id}`)}, 0, 'application/pdf', true
        )
        on conflict (payout_id) do nothing
      `;
    }

    const processingRunId = stableUuid("processing-run");
    await insertRun(transaction, {
      id: processingRunId,
      periodStart: "2023-01-01",
      periodEnd: "2023-01-31",
      status: "processing",
      grossTotalMinor: 5_500_000,
      deductionsTotalMinor: 550_000,
      netTotalMinor: 4_950_000,
      leaseOwner: "payroll-verification-worker",
      leaseExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      adminProfileId: administrator.id,
    });

    const payoutEmployees = await transaction`
      select employee.id, employee.employee_number, employee.legal_name, setting.id as pay_setting_id
      from employees employee
      join pay_settings setting on setting.employee_id = employee.id
      where employee.organization_id = ${organizationId}
      order by employee.employee_number
      limit 55
    `;
    for (const employee of payoutEmployees) {
      const payoutId = stableUuid(`processing-payout:${employee.employee_number}`);
      await transaction`
        insert into payouts (
          id, payroll_run_id, employee_id, pay_setting_id, employee_number, legal_name,
          gross_amount_minor, deductions_amount_minor, net_amount_minor,
          currency, currency_exponent, calculation_version, status, payroll_period_end
        ) values (
          ${payoutId}, ${processingRunId}, ${employee.id}, ${employee.pay_setting_id}, ${employee.employee_number}, ${employee.legal_name},
          100000, 10000, 90000, 'PHP', 2, 'fixed-pay-v1', 'processing', '2023-01-31'
        )
        on conflict (payroll_run_id, employee_id) do nothing
      `;
      await transaction`
        insert into payslips (id, payout_id, status)
        values (${stableUuid(`processing-payslip:${employee.employee_number}`)}, ${payoutId}, 'pending')
        on conflict (payout_id) do nothing
      `;
    }
    await transaction`
      insert into payroll_run_attempts (
        id, payroll_run_id, processing_generation, attempt_number,
        inngest_event_id, outcome
      ) values (
        ${stableUuid("processing-attempt")}, ${processingRunId}, 1, 1,
        'payroll-verification-processing-event', 'processing'
      )
      on conflict (payroll_run_id, processing_generation, attempt_number) do nothing
    `;

    await insertRun(transaction, {
      id: stableUuid("queued-run"),
      periodStart: "2023-02-01",
      periodEnd: "2023-02-28",
      status: "queued",
      queueStatus: "failed",
      errorCode: "QUEUE_DELIVERY_FAILED",
      errorGuidance: "Resubmit this synthetic verification run.",
      adminProfileId: administrator.id,
    });
    await insertRun(transaction, {
      id: stableUuid("delayed-run"),
      periodStart: "2023-03-01",
      periodEnd: "2023-03-31",
      status: "processing",
      leaseOwner: "expired-verification-worker",
      leaseExpiresAt: new Date(Date.now() - 5 * 60 * 1000),
      lastProgressAt: new Date(Date.now() - 31 * 60 * 1000),
      adminProfileId: administrator.id,
    });
    await insertRun(transaction, {
      id: stableUuid("failed-run"),
      periodStart: "2023-04-01",
      periodEnd: "2023-04-30",
      status: "failed",
      queueStatus: "submitted",
      errorCode: "PAYROLL_PROCESSING_FAILED",
      errorGuidance: "Retry this synthetic verification run.",
      adminProfileId: administrator.id,
    });

    const [counts] = await transaction`
      select
        (select count(*)::int from employees where organization_id = ${organizationId}) as employees,
        (select count(*)::int from payroll_runs where organization_id = ${organizationId}) as runs,
        (select count(*)::int from payouts where payroll_run_id = ${processingRunId}) as payouts
    `;
    return counts;
  });

  console.log(JSON.stringify({
    fixture: "hr-pulse-payroll-verification",
    employees: summary.employees,
    runs: summary.runs,
    payouts: summary.payouts,
    ready: summary.employees >= 501 && summary.runs >= 54 && summary.payouts >= 55,
  }));
} finally {
  await sql.end();
}
