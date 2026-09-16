# Building a feature

HR Pulse was developed as a sequence of tracer bullets: thin but complete paths through UI, authorization, domain logic, persistence, security, and tests. Once one real path worked, the slice expanded to edge cases, roles, recovery, and operational hardening.

## The project workflow

The repository records this lifecycle in `docs/scope/scope.md`:

```text
scope → architecture/spec → development → tests → verification → review → documentation → sync
```

The project skills named `/scope`, `/architect`, `/develop`, `/test`, `/check`, `/document`, and `/sync` support that lifecycle, but the engineering ideas are tool-independent.

### Scope

Define the user, problem, outcome, and explicit exclusions. A useful scope statement is testable:

> An employee can record one trusted check-in and check-out, and an authorized reviewer can see the resulting organization-local workday.

This is better than “build attendance,” which hides decisions about identity, timezones, incomplete intervals, concurrency, reviewer scope, and errors.

### Architecture and specification

Resolve decisions that affect data or multiple layers before coding:

- Who may perform the action?
- Which organization owns the record?
- What states and transitions exist?
- Which values are dates, timestamps, money, or versions?
- What happens on retry, race, stale input, and partial failure?
- Which values are sensitive?
- Is the feature enabled by default locally and in production?
- What evidence proves each acceptance criterion?

The accepted answer belongs in a numbered spec under `docs/specs/`.

### Tracer bullet

Build the smallest complete happy path through every required layer. For attendance, that meant:

1. route and page;
2. active employee context;
3. action form and server action;
4. authenticated transactional database function;
5. interval and audit write;
6. refreshed UI;
7. focused tests.

It did not initially require every report and correction workflow. The value came from proving that the chosen architecture could carry a real request safely from browser to database and back.

### Harden the slice

After the path works, add:

- validation boundaries;
- manager/administrator/outsider cases;
- inactive and unlinked identities;
- concurrency and retry behavior;
- loading, empty, blocked, stale, error, and success states;
- responsive and keyboard behavior;
- audit, telemetry, and safe failures;
- release flags and production shutdown behavior;
- migration replay and browser evidence.

## Step-by-step implementation template

### 1. Read project context

Read:

- root `AGENTS.md`;
- the nearest nested `AGENTS.md`;
- relevant spec and scope section;
- `design.md` for UI work;
- current domain code and tests.

Search for an existing analogous workflow. Reuse its shape and vocabulary where the domain semantics match.

### 2. Define the contract

Write down:

| Concern | Questions |
| --- | --- |
| Actor | Employee, manager, administrator, system? |
| Scope | Which organization and employee? |
| Input | Formats, limits, enums, optional fields? |
| State | Current and next statuses? Terminal states? |
| Output | Page data, action state, JSON, redirect, file? |
| Retry | Duplicate, replay, conflict, stale version? |
| Concurrency | Which rows or logical resource can race? |
| Privacy | What must stay out of logs and broad lists? |
| Release | Which flag and production requirements? |
| Evidence | Unit, database, browser, accessibility? |

This becomes the implementation checklist and test plan.

### 3. Model the data

Add only data needed by the vertical slice, but include ownership and integrity from the beginning.

For a new organization-scoped record, normally consider:

- UUID primary key;
- `organization_id` foreign key;
- profile/employee actor or owner foreign keys;
- status enum;
- version or idempotency fields;
- UTC timestamps and local dates with correct meaning;
- uniqueness and check constraints;
- organization-leading indexes;
- RLS policies and grants;
- audit/event history if transitions matter.

Update `src/db/schema.js` and create a new ordered migration. Add database functions/triggers when the transition must be atomic or direct table writes should be prohibited.

### 4. Build domain logic before page detail

Prefer pure functions for calculations and state-independent validation. Put orchestration and persistence in domain services or database functions.

A domain error should carry a stable code. A serializer maps that code to safe message, guidance, and retryability. This keeps provider/SQL details out of UI components.

### 5. Add the access context

Resolve:

- current authenticated user;
- active profile;
- selected active organization;
- active membership and role;
- linked employee and target relationship;
- feature flag.

Use one domain context object through the operation. Do not repeatedly trust IDs from form fields.

### 6. Add the mutation boundary

A server action should usually:

1. parse `FormData`;
2. validate shape and limits;
3. require domain context;
4. call one domain service/RPC;
5. revalidate affected paths;
6. record safe metrics where required;
7. return a small safe result;
8. rethrow redirects.

Keep calculations and SQL out of the action when they have domain meaning.

### 7. Add the read model and page

Build an authorized query that returns exactly what the page needs. Include the full final-state contract in the query rather than filtering sensitive rows in the client.

The server page renders the initial state. Add client components only for interaction. Compose existing cards, fields, alerts, status badges, tables, responsive records, and sensitive-value controls.

### 8. Add all meaningful states

Before calling a page complete, decide what users see for:

- loading;
- no records;
- feature disabled;
- no access or missing employee link;
- invalid/stale input;
- partial read failure;
- retryable mutation failure;
- terminal failure;
- success and replayed success.

Error text should tell the user what is safe to do next without exposing internal detail.

### 9. Test outward

Write or update:

1. pure domain tests;
2. action/service orchestration tests;
3. database constraint/RLS/concurrency tests;
4. component interaction tests;
5. one complete browser tracer bullet;
6. denial and responsive/accessibility browser evidence.

Run focused checks first, then domain and repository checks.

### 10. Review cross-domain effects

Search all usages of changed tables, statuses, and exported functions. Ask whether the change affects payroll fingerprints, timecard immutability, self-service visibility, operations catalogs, privacy retention, fixtures, or feature flags.

### 11. Update durable knowledge

Update README/developer/user documentation where behavior or setup changed. Reconcile scope and specs. Keep nearby AGENTS guidance accurate through the project's sync workflow.

## Example: how attendance was built

The attendance slice illustrates the sequence:

| Stage | Implementation |
| --- | --- |
| Contract | Employee check-in/out; reviewer local-day view; one open interval |
| Data | `attendance_intervals`, source/status enums, open-interval uniqueness |
| Access | Active linked employee; direct manager or administrator review |
| Atomic mutation | Authenticated PostgreSQL RPC functions |
| UI | Server-rendered page plus small client action form |
| Errors | Stable already-checked-in/not-checked-in/disabled/unavailable outcomes |
| Evidence | Action tests, query tests, RLS matrix, concurrency race, Playwright journey |
| Operations | Audit events and safe attendance metrics |
| Release | `ATTENDANCE_ENABLED` with production fail-closed behavior |

Notice that the feature is not “a form that inserts a row.” Its design includes the state machine, organization-local time, race behavior, role scope, observability, and recovery.

## When to use each Next.js mechanism

| Need | Use |
| --- | --- |
| Render protected initial data | Server component page |
| Share navigation and broad guards | Layout |
| Submit an internal form | Server action |
| Browser polling or JSON contract | Route handler |
| Provider callback | Route handler |
| Secure file authorization | Route handler plus signed storage URL |
| Long-running/retryable work | Persisted intent plus Inngest function |
| Browser state/effects/events | Small client component |

## Common mistakes to avoid

- Trusting a hidden form field for organization or employee ownership.
- Treating an authenticated user as an active member.
- Filtering cross-organization results after loading them.
- Using floating-point numbers for money.
- Treating a local date as midnight UTC.
- Adding a client component merely to fetch initial data.
- Putting business calculations directly in a page or server action.
- Showing a provider/database error message to users.
- Updating terminal financial records in place.
- Retrying a mutation without idempotency semantics.
- Logging a convenient full object that contains sensitive values.
- Adding navigation before the route has complete access and failure behavior.
- Changing `schema.js` without a migration, or migration SQL without aligning the schema.
- Testing only the happy role and assuming RLS works.
- Using offset pagination for a changing operational list.

## Definition of done

A feature is complete when:

- its accepted requirements and exclusions are clear;
- the vertical path works through UI, server, domain, and database;
- organization and role boundaries are enforced twice where appropriate;
- constraints and concurrency preserve invariants;
- retries and stale input have defined outcomes;
- sensitive data stays out of broad outputs and telemetry;
- loading, empty, error, disabled, and success states are usable;
- responsive and accessibility behavior is verified;
- focused, domain, build, and relevant browser checks pass;
- migrations replay safely;
- user and developer documentation match the result.
