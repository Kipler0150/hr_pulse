import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });
const databaseUrl = process.env.DRIZZLE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 1 });

const result = await sql`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('privacy_consents', 'privacy_requests', 'privacy_holds', 'privacy_deletion_executions')
  order by table_name
`;

const names = result.map((row) => row.table_name);
const expected = ["privacy_consents", "privacy_deletion_executions", "privacy_holds", "privacy_requests"];
if (JSON.stringify(names) !== JSON.stringify(expected)) {
  throw new Error(`Privacy schema mismatch: ${names.join(", ")}`);
}

const columns = await sql`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('privacy_requests', 'privacy_holds')
    and column_name = 'last_action_idempotency_key'
  order by table_name
`;
if (columns.length !== 2) throw new Error("Privacy action idempotency columns are missing");

const security = await sql`
  select c.relname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('privacy_consents', 'privacy_requests', 'privacy_holds', 'privacy_deletion_executions')
  order by c.relname
`;
if (security.length !== 4 || security.some((row) => !row.relrowsecurity)) throw new Error("Privacy RLS is not enabled on every table");

const policies = await sql`
  select tablename, policyname
  from pg_policies
  where schemaname = 'public'
    and tablename in ('privacy_consents', 'privacy_requests', 'privacy_holds', 'privacy_deletion_executions')
  order by tablename, policyname
`;
if (policies.length !== 4) throw new Error("Privacy read policies are incomplete");

const migration = await sql`
  select created_at
  from drizzle.__drizzle_migrations
  order by created_at desc
  limit 1
`;
if (migration[0]?.created_at !== "1788449000000") throw new Error("Privacy migrations are not the active database head");

console.log(`Privacy schema verified: ${names.join(", ")}`);
await sql.end();
