import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const longName = "x".repeat(201);
try {
  await sql`begin`;
  await sql`set local session_replication_role = replica`;
  const [fixture] = await sql`
    select o.id as organization_id, e.id as employee_id, payout.id as payout_id, run.period_end
    from organizations o
    join employees e on e.organization_id = o.id
    join payouts payout on payout.employee_id = e.id
    join payroll_runs run on run.id = payout.payroll_run_id
    where o.slug = 'hr-pulse-self-service-verification'
    order by payout.created_at
    limit 1
  `;
  if (!fixture) throw new Error("The self service verification fixture is required");

  await sql`alter table public.employees drop constraint if exists employees_version_positive`;
  await sql`alter table public.employees drop constraint if exists employees_preferred_name_valid`;
  await sql`alter table public.employees drop constraint if exists employees_phone_e164_or_null`;
  await sql`alter table public.employees alter column preferred_name type text`;
  await sql`alter table public.employees alter column phone type text`;
  await sql`alter table public.employees alter column version drop not null`;
  await sql`alter table public.payouts alter column payroll_period_end drop not null`;
  await sql`
    update public.employees
    set preferred_name = ${longName}, phone = 'not a phone', version = null
    where id = ${fixture.employee_id}
  `;
  await sql`update public.payouts set payroll_period_end = null where id = ${fixture.payout_id}`;

  await sql`
    update public.employees
    set preferred_name = case
          when preferred_name is null or pg_catalog.btrim(preferred_name) = '' or char_length(pg_catalog.btrim(preferred_name)) > 200 then null
          else pg_catalog.btrim(preferred_name)
        end,
        phone = case
          when phone is null or pg_catalog.btrim(phone) = '' or pg_catalog.btrim(phone) !~ '^[+][0-9]{7,15}$' then null
          else pg_catalog.btrim(phone)
        end
    where id = ${fixture.employee_id}
  `;
  await sql`update public.employees set version = 1 where id = ${fixture.employee_id} and (version is null or version < 1)`;
  await sql`update public.payouts set payroll_period_end = run.period_end from public.payroll_runs run where payouts.id = ${fixture.payout_id} and run.id = payouts.payroll_run_id and payouts.payroll_period_end is null`;

  const [employee] = await sql`select preferred_name, phone, version from public.employees where id = ${fixture.employee_id}`;
  const [payout] = await sql`select payroll_period_end from public.payouts where id = ${fixture.payout_id}`;
  if (employee.preferred_name !== null || employee.phone !== null || employee.version !== 1) throw new Error(`Legacy employee replay failed: ${JSON.stringify(employee)}`);
  if (String(payout.payroll_period_end) !== String(fixture.period_end)) throw new Error(`Payout period backfill failed: ${JSON.stringify(payout)}`);

  await sql`rollback`;
  console.log(JSON.stringify({ normalized: true, version: employee.version, payoutPeriodBackfilled: true, rolledBack: true }));
} catch (error) {
  await sql`rollback`;
  throw error;
} finally {
  await sql.end();
}
