# Database and security

PostgreSQL is more than storage in HR Pulse. It is the final authority for organization isolation, relationships, uniqueness, workflow state, concurrency, and retry safety.

## Drizzle schema and SQL migrations

Two representations work together:

- `src/db/schema.js` defines tables, columns, enums, indexes, and constraints for typed Drizzle queries.
- `drizzle/*.sql` is the ordered deployment record and includes PostgreSQL-specific functions, triggers, grants, and Row Level Security policies.

The JavaScript schema helps application code construct correct queries. The migrations describe what an actual database enforces. When they differ, the live database behavior is determined by the migrations, so both must be kept aligned.

`drizzle.config.js` loads `.env.local`, points at `src/db/schema.js`, and writes migrations to `drizzle/`.

## Data model by cluster

### Identity and organization

| Table | Purpose |
| --- | --- |
| `organizations` | Tenant boundary, timezone, default currency, lifecycle |
| `profiles` | Local application identity mapped to Supabase Auth |
| `memberships` | Profile role and status within an organization |
| `employees` | HR person record, optional profile link, manager relationship |

### Pay configuration

| Table | Purpose |
| --- | --- |
| `payroll_schedules` | Frequency, anchor/effective dates, version |
| `pay_settings` | Effective-dated compensation inputs |
| `pay_setting_deductions` | Ordered flat deduction inputs |
| `overtime_policies` | Versioned overtime policy for an organization |
| `payroll_preview_tokens` | Short-lived confirmation contract bound to a source fingerprint |

### Attendance and timecards

| Table | Purpose |
| --- | --- |
| `attendance_intervals` | Trusted check-in and clock-out instants |
| `attendance_interval_corrections` | Correction history rather than destructive edits |
| `timecards` | Frozen period totals, policy, pay, and workflow state |
| `timecard_days` | Per-local-date calculation snapshot |
| `timecard_day_sources` | Exact attendance evidence allocated to each day |
| `timecard_events` | Append-only workflow history |

### Time off and retries

| Table | Purpose |
| --- | --- |
| `leave_requests` | Request dates, type, status, decision fields |
| `leave_request_events` | Immutable submit/approve/decline/cancel history |
| `mutation_receipts` | Replay-safe mutation outcomes and payload identity |

### Payroll output

| Table | Purpose |
| --- | --- |
| `payroll_runs` | Frozen organization/period totals and processing state |
| `payroll_run_attempts` | Worker attempts and outcomes |
| `payouts` | Immutable per-employee payment snapshot |
| `payout_deduction_lines` | Frozen deduction detail |
| `payout_earning_lines` | Frozen overtime earning detail |
| `payslips` | Generation state and private storage reference |

### Operations and privacy

| Table | Purpose |
| --- | --- |
| `audit_events` | Organization-scoped append-only change history |
| `product_events` | Consent-gated, pseudonymous adoption milestones |
| `operation_failures` | Deduplicated safe failure summaries |
| `privacy_consents` | Versioned consent history |
| `privacy_requests` | Deletion request workflow |
| `privacy_holds` | Profile-scoped legal hold state |
| `privacy_deletion_executions` | Idempotent retention/deletion execution record |

## Data type rules

### Money

Money is stored as an integer count of the currency's minor unit. For PHP and USD, `10000` means 100.00. Calculations never use binary floating point for monetary values.

Each monetary snapshot also carries an ISO 4217 currency code and, where required, a currency exponent/version. This prevents later configuration changes from changing the meaning of completed payroll.

### Dates and timestamps

- `timestamptz` stores real UTC instants such as check-in time and event creation time.
- `date` stores organization-local calendar concepts such as pay period or leave dates.
- IANA timezone names, such as `Asia/Manila`, provide conversion context.

Do not derive a local workday by slicing a UTC ISO timestamp. Convert with the organization's timezone and account for intervals crossing midnight.

### Identifiers

UUIDs are validated at request boundaries. A UUID's global uniqueness does not grant access; protected queries still include organization and owner constraints.

### JSON metadata

JSONB is used for bounded metadata such as audit context and frozen details. Avoid using JSON as a substitute for core relational columns that need joins, constraints, or indexes.

## Validation layers

The same rule may intentionally appear in several places:

| Layer | Catches |
| --- | --- |
| Form/client attributes | Immediate usability mistakes |
| Server action/route validation | Malformed or missing untrusted input |
| Domain functions | Business meaning and cross-field rules |
| Database constraints/functions | Races, direct access, and invariant violations |

`src/db/validation.js` centralizes reusable UUID, date, timestamp, timezone, currency, pay frequency, minor amount, date range, deduction, and basic cursor rules.

Client validation is never sufficient. Requests can bypass the browser UI.

## Row Level Security

RLS provides a second tenant and ownership boundary for tables exposed through Supabase. Policies typically rediscover the active local profile from `auth.uid()`, then require an active membership in the target organization. Employee-owned records additionally require the correct profile link; reviewer policies include manager or administrator scope.

Controlled writes often use `SECURITY DEFINER` functions with:

- an explicit safe `search_path`;
- narrow argument validation;
- identity and membership checks inside the function;
- revoked public table writes;
- grants only to the intended authenticated role;
- atomic writes of records, events, receipts, and audits.

Search migrations for the function name to understand the full security contract. Reading only the JavaScript caller is incomplete.

## Transactions and locks

Transactions group changes that must either all commit or all roll back. HR Pulse also uses row locks to serialize high-value or concurrency-sensitive transitions.

Examples:

- Payroll confirmation locks the organization before checking whether a period already has a run.
- Payroll workers lock the organization and run before claiming or finalizing a generation.
- Timecard transitions lock the card before validating its current status and version.
- Attendance database functions combine authorization, state validation, interval writes, and audit writes atomically.

`SELECT ... FOR UPDATE` is used when reading a row and then deciding how it may change. Unique and partial indexes remain necessary because locks alone do not express every invariant.

## Idempotency and replay

Networks fail in ambiguous ways: a commit can succeed even when the client never receives the response. Retrying must not duplicate payroll, leave decisions, consent changes, or queued events.

HR Pulse uses several techniques:

- unique request/idempotency keys;
- `mutation_receipts` with an operation and payload identity;
- deterministic Inngest event IDs derived from run ID and generation;
- preview token hashes consumed once;
- unique payroll period/run constraints;
- `onConflictDoNothing` execution records;
- version checks for profile/timecard updates.

A repeated request has three possible meanings:

1. same key and same operation/payload: return the recorded result;
2. same key with different intent: return an idempotency conflict;
3. new key: attempt a new valid transition.

## Lifecycle and immutability

Workflow state is explicit. Examples include:

- attendance: `open → completed`;
- timecard: `draft → submitted → approved` or `returned → submitted`;
- leave: `draft/submitted → approved | declined | cancelled` according to its contract;
- payroll run: `queued → processing → completed | failed`, with controlled retry generations;
- payout: `pending → processing → finalized | failed`;
- payslip: `pending → generated | failed`.

Completed financial snapshots are treated as immutable. Corrections create new evidence or explicit correction records instead of silently rewriting history.

`src/db/lifecycle.js` contains shared lifecycle helpers, while domain services and database triggers enforce the more detailed current rules.

## Effective-dated records

Pay settings and policies describe values that apply during a date range. A payroll or timecard selects the setting effective for its period. Overlapping active ranges would make the answer ambiguous, so the database and application prevent them.

Once a workflow becomes a payroll snapshot, relevant values are copied into the snapshot. Historical payroll should not change when an employee receives a later pay raise.

## Pagination

Lists use cursor pagination instead of large offsets. Stable ordering includes a business sort key plus a unique ID, for example `(created_at, id)` or `(period_end, id)`. The next cursor describes the final visible row.

Self-service cursors are signed, short-lived, and bound to organization, employee, list kind, and status. A user cannot edit a cursor to switch employees or list types.

When adding pagination:

1. choose a deterministic order;
2. include a unique tie-breaker;
3. query one extra row to detect another page;
4. bind protected cursor state to caller scope;
5. set a maximum cursor length;
6. test equal timestamps/sort keys and tampering.

## Schema-change checklist

1. Identify ownership: which organization/profile/employee owns the row?
2. Select precise types for money, date, timestamp, enum, and JSON fields.
3. Add foreign keys and organization-consistency rules.
4. Add uniqueness, range, and lifecycle constraints.
5. Add indexes that match actual filters and ordering.
6. Define RLS for each operation and revoke unintended direct writes.
7. Add a migration that advances existing databases safely.
8. Update `src/db/schema.js` and tests.
9. Test concurrent and replayed requests when state can race.
10. Verify migration replay from an empty local database.
