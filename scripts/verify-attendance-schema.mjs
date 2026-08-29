import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const indexes = await sql`
    select c.relname as index_name
    from pg_class c
    where c.relname in (
      'attendance_employee_clock_in_cursor_idx',
      'attendance_one_open_per_employee'
    )
    order by c.relname
  `;
  const functions = await sql`
    select proname
    from pg_proc
    where proname in (
      'attendance_check_in',
      'attendance_clock_out',
      'attendance_day_context'
    )
    order by proname
  `;
  const triggers = await sql`
    select tgname
    from pg_trigger
    where tgname in (
      'attendance_intervals_immutable',
      'audit_events_append_only'
    )
      and not tgisinternal
    order by tgname
  `;
  const constraints = await sql`
    select conname
    from pg_constraint
    where conname in (
      'attendance_clock_order_check',
      'attendance_state_consistency_check'
    )
    order by conname
  `;
  const policies = await sql`
    select policyname
    from pg_policies
    where tablename = 'attendance_intervals'
      and policyname in (
        'employees_can_read_own_attendance',
        'attendance_reviewers_can_read_organization_attendance'
      )
    order by policyname
  `;
  const [permissions] = await sql`
    select
      has_function_privilege('authenticated', 'attendance_check_in(uuid)', 'EXECUTE') as authenticated_check_in,
      has_function_privilege('authenticated', 'attendance_clock_out(uuid)', 'EXECUTE') as authenticated_clock_out,
      has_function_privilege('authenticated', 'attendance_day_context(uuid,date)', 'EXECUTE') as authenticated_day_context,
      has_function_privilege('anon', 'attendance_check_in(uuid)', 'EXECUTE') as anon_check_in,
      has_function_privilege('anon', 'attendance_clock_out(uuid)', 'EXECUTE') as anon_clock_out,
      has_function_privilege('anon', 'attendance_day_context(uuid,date)', 'EXECUTE') as anon_day_context
  `;

  const result = { constraints, functions, indexes, permissions, policies, triggers };
  console.log(JSON.stringify(result, null, 2));
  if (
    indexes.length !== 2
    || functions.length !== 3
    || triggers.length !== 2
    || constraints.length !== 2
    || policies.length !== 2
    || !permissions.authenticated_check_in
    || !permissions.authenticated_clock_out
    || !permissions.authenticated_day_context
    || permissions.anon_check_in
    || permissions.anon_clock_out
    || permissions.anon_day_context
  ) {
    throw new Error("Attendance schema verification failed");
  }
} finally {
  await sql.end();
}
