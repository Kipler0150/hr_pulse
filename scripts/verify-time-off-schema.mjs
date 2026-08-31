import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const rows = await sql.unsafe("select to_regclass('public.leave_request_events') as events, exists(select 1 from information_schema.columns where table_name='leave_requests' and column_name='organization_id') as has_org, exists(select 1 from pg_proc where proname='submit_leave_request') as has_submit, exists(select 1 from pg_proc where proname='approve_leave_request') as has_approve");
const policies = await sql.unsafe("select policyname from pg_policies where schemaname = 'public' and tablename = 'leave_requests'");
const constraints = await sql.unsafe("select conname from pg_constraint where conname in ('leave_requests_employee_organization_fk', 'leave_request_events_request_organization_fk')");
const triggers = await sql.unsafe("select tgname from pg_trigger join pg_class on pg_class.oid = tgrelid where relname in ('leave_requests', 'leave_request_events') and tgname in ('leave_requests_mutation_guard', 'leave_request_events_append_only_guard', 'leave_requests_history_agreement', 'leave_request_events_history_agreement')");
if (policies.some(({ policyname }) => policyname === 'organization_members_can_read_leave')) throw new Error('Legacy permissive leave policy is still active');
if (constraints.length !== 2) throw new Error('Organization matched time off foreign keys are incomplete');
if (triggers.length !== 4) throw new Error('Time off integrity triggers are incomplete');
console.log({ rows, policies, constraints, triggers });
await sql.end();
