# Testing and debugging

HR Pulse uses different test layers because no single test style can prove everything economically.

## Test layers

| Layer | Tool | Best for | Cannot prove alone |
| --- | --- | --- | --- |
| Pure unit | Vitest | Calculators, validation, formatting, cursor rules, lifecycle rules | Database constraints, RLS, real rendering |
| Module/action | Vitest with mocks/fakes | Orchestration, safe errors, revalidation, service calls | Actual SQL and provider behavior |
| Database integration | Vitest or verification scripts with local PostgreSQL | Transactions, locks, replay, migrations, constraints | Browser usability |
| Component | Testing Library + jsdom | Interactive state, accessible names, conditional feedback | Real routing/database |
| Browser journey | Playwright | Full routing, forms, responsive behavior, authorization, accessibility | Every edge case cheaply |
| Build/lint | Next.js/ESLint | Production compilation, framework contracts, static quality | Runtime business correctness |

The goal is not the largest possible test count. Put each claim at the lowest layer that can prove it reliably.

## Test locations

Unit and module tests live beside their source:

```text
src/payroll/calculator.js
src/payroll/calculator.test.js

src/app/actions/attendance.js
src/app/actions/attendance.test.js
```

Browser journeys live in `tests/e2e/`. Database verification helpers live in `scripts/`. Domain-specific guidance lives in nearby `AGENTS.md` files.

## Core commands

```powershell
# All unit, module, and integration-enabled-by-default tests under src
npm run test

# One file
npx vitest run src/payroll/calculator.test.js

# Tests matching a name
npx vitest run src/time-off/domain.test.js -t "rejects overlap"

# Lint
npm run lint

# Production compilation and route generation
npm run build

# All Playwright journeys
npm run test:e2e

# One browser file
npx playwright test tests/e2e/attendance.spec.js

# One browser test title
npx playwright test tests/e2e/attendance.spec.js -g "records a trusted interval"
```

The Playwright configuration starts its own development server, uses Chromium, runs one worker, and defaults to `http://localhost:3000`. Override the URL with `PLAYWRIGHT_BASE_URL` when intentionally testing another local instance.

## Unit-test style

Pure domain tests should use explicit input and output. Payroll calculation tests, for example, provide gross minor units and deduction lines, then assert exact gross, deductions, and net values. Boundary cases matter more than framework setup:

- zero values;
- smallest valid value;
- rounding boundary;
- maximum safe integer behavior;
- deductions equal to or greater than gross;
- invalid enum/date/timezone;
- terminal workflow state.

Keep pure functions independent of clocks, network, and global state where practical. Inject time or database dependencies when deterministic behavior matters.

## Action and service tests

Action tests mock access/service boundaries to prove orchestration:

- the correct context is required;
- form values are parsed and validated;
- the intended service/RPC is called;
- paths are revalidated only after success;
- stable error codes become safe UI states;
- forbidden or malformed input stops before mutation.

Avoid mocking the function under test's own logic. Mock external boundaries—database, Supabase client, queue, storage, Next cache/navigation—so the test still exercises the action's decisions.

When a catch block may receive `redirect()`, test that Next redirect errors are rethrown rather than displayed as ordinary failures.

## Component tests

Interactive component tests use Testing Library and a jsdom environment declaration when needed. Prefer queries that reflect user perception:

- `getByRole` with accessible name;
- `getByLabelText` for controls;
- visible status/alert text;
- keyboard or user-event interaction.

Avoid assertions against Tailwind class strings unless the class itself is the behavior under test. Test whether the user can operate and understand the component.

## Database integration tests

Use the real local PostgreSQL stack for behavior mocks cannot prove:

- unique and partial indexes;
- RLS visibility and direct-write denial;
- transactional RPCs;
- row locks and concurrent transitions;
- migration replay;
- trigger-enforced immutability;
- generated constraints and grants.

Some integration tests are opt-in with environment variables such as `HR_PULSE_OVERTIME_INTEGRATION=true` plus `DATABASE_URL`. This prevents ordinary unit runs from unexpectedly mutating a developer database.

Integration fixtures must use a disposable organization and clean only records belonging to that fixture.

## Browser-test design

Playwright journeys prove the real application contract. A complete protected workflow normally covers:

1. fixture creation in a disposable organization;
2. real sign-in;
3. user-visible happy path;
4. relevant role/organization denial;
5. persisted database/audit result;
6. responsive widths;
7. serious automated accessibility findings;
8. safe cleanup of that fixture.

The attendance journey is a strong example: it checks employee check-in/out, manager review, RLS isolation, direct-write denial, responsive layouts, accessibility, and concurrent RPC behavior.

Use direct SQL or service-role calls for fixture setup and database assertions only. Product behavior should be exercised through the browser when the claim concerns the UI.

## Fixture requirements

Public pages can run without protected fixtures. Protected journeys use combinations of:

- `DATABASE_URL`;
- Supabase URL, anon key, and service-role key;
- `SAMP_EMAIL` and `SAMP_PASS` for a provisioned sample account;
- domain-specific IDs and accounts for time off or other matrices;
- explicit feature flags;
- self-service seed scripts and enable flags.

Read `tests/e2e/AGENTS.md` and the top of the target spec file before running it. Many tests intentionally skip when their safe local fixture contract is missing.

## Cleanup safety

Browser setup may create Auth users, profiles, memberships, employees, and workflow rows. Cleanup must:

- hold exact fixture organization/profile/user IDs;
- delete only those records;
- respect foreign-key order or use a scoped transaction;
- delete Auth users after database records when appropriate;
- never use an unbounded delete;
- close database connections.

Do not point fixture tests at shared or production data.

## Accessibility and responsive evidence

Automated browser checks commonly assert:

- no horizontal overflow at 360, 768, and 1280 pixels;
- no serious axe findings;
- visible headings, labels, buttons, and alerts;
- keyboard-operable navigation and forms;
- state remains understandable without relying on color.

Automated accessibility scans are a floor. Manually test focus order, focus visibility, error recovery, screen-reader phrasing, zoom, and whether dense records remain comprehensible on mobile.

## Verification scripts

The README lists domain scripts that inspect live local schema or replay migrations. These complement tests by checking deployment evidence such as:

- expected migration head;
- function grants and RLS policies;
- release configuration;
- migration replay from earlier states;
- seeded domain workflows.

Run them only against local or disposable databases.

## Recommended check order

For a focused code change:

1. run the closest test file while iterating;
2. run all tests in the affected domain;
3. run `npm run lint`;
4. run `npm run test`;
5. run `npm run build`;
6. run the relevant Playwright journey for a user-visible or authorization change;
7. run schema/replay checks for a database migration.

Do not repeatedly run the entire browser suite while a unit-level rule is still failing. Move outward as confidence grows.

## Debugging playbook

### A page redirects unexpectedly

Trace in this order:

1. Supabase session exists and `auth.getUser()` succeeds.
2. `profiles.auth_user_id` matches and profile is active.
3. membership is active and organization is active.
4. selected organization cookie points to an available membership.
5. domain feature flag is enabled.
6. role and employee link satisfy the domain layout/context.

### A mutation returns a generic failure

1. Find the action in `src/app/actions/`.
2. Identify the domain serializer and stable error catalog.
3. Reproduce at the domain service/RPC layer with synthetic IDs.
4. Inspect safe local server output and database state.
5. Check whether the request committed but the response was lost.
6. Verify idempotency/replay behavior before retrying manually.

### A database write fails

Inspect:

- PostgreSQL error code (`23505` unique, `23503` foreign key, etc.);
- RLS policy and current Supabase identity;
- active profile/membership/organization;
- grants on a table or function;
- organization consistency across foreign keys;
- current workflow status/version;
- migration head in the local database.

Translate expected constraint outcomes into domain errors. Do not expose raw SQL messages to users.

### A browser test fails at sign-in

Verify the account still exists in local Supabase Auth, its password is current, and corresponding profile/membership records remain active. A valid Auth account without application provisioning correctly lands on pending access.

### A background run appears stuck

Inspect run status, queue delivery status, generation, lease expiry, last progress, and attempt rows. Then inspect the Inngest event and safe failure summary. Recovery should use the provided service/action rather than manually editing statuses.

### A test passes alone but fails in the suite

Look for shared environment mutation, leaked timers/connections, non-reset mocks, reused idempotency keys, fixture collisions, or cleanup that reaches outside its organization.

## Test review questions

- Does the test prove behavior rather than repeat implementation?
- Is the highest-risk invariant tested at the database or real-browser layer?
- Are authorization tests covering outside-organization and inactive identities?
- Is concurrency or replay tested for retryable mutations?
- Are errors asserted through stable codes/messages rather than provider text?
- Does fixture cleanup have a narrow, explicit scope?
- Would the test still catch a meaningful regression after harmless refactoring?
