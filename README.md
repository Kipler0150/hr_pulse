# HR Pulse

HR Pulse is an internal HR workspace for payroll, attendance, timecards, time off, and employee self service. It is designed for organizations that need dependable basic payroll operations and clear work time records.

The current product is an internal beta. Payroll, attendance, and all employee data are intended for synthetic verification until the release hardening work is complete. Several surfaces are controlled by explicit environment flags and are disabled in production by default.

## What is included

| Area | Current capability | Main roles |
| --- | --- | --- |
| Access | Email sign in, password recovery, organization selection, active profile checks, and role based access | All users |
| Payroll | Organization setup, employee records, pay settings, deductions, closed period preview, queued processing, payouts, PDF payslips, status polling, and private downloads | Administrators |
| Attendance | Trusted check in and clock out actions, daily records, leave markers, and review screens | Employees, managers, administrators |
| Timecards | Overtime policy, timecard preparation, submission, review, return, approval, evidence snapshots, and payroll earning snapshots | Employees, managers, administrators |
| Time off | Employee requests, manager or administrator decisions, cancellation, workflow history, retry safe mutations, filters, and cursor pagination | Employees, managers, administrators |
| Self service | Profile editing, approved timecard history, payslip history, masked values, and secure downloads | Linked employees |
| Operations | Organization scoped audit history, adoption milestones, queue health, failure summaries, and safe operational telemetry | Administrators |
| Privacy | Public privacy notices, consent, analytics controls, deletion requests, legal holds, and scheduled retention | Employees, administrators |

## Architecture

HR Pulse is a single layered Next.js application.

* Next.js 16.3.2 App Router and React 19 provide screens, server components, server actions, and route handlers.
* Supabase provides PostgreSQL, authentication, and private object storage.
* Drizzle ORM and ordered SQL migrations manage the database schema, constraints, functions, and Row Level Security policies.
* Inngest runs durable payroll processing and daily privacy retention jobs.
* Tailwind CSS and shadcn/ui provide the interface foundation.
* Sentry provides error monitoring with sensitive values excluded from operational records.
* Vitest covers unit and integration behavior. Playwright covers browser journeys and accessibility checks.

Application code lives under `src/`. Routes and screens use the App Router under `src/app/`. Domain logic is separated into `src/auth`, `src/db`, `src/attendance`, `src/overtime`, `src/payroll`, `src/time-off`, `src/self-service`, `src/product-operations`, and `src/privacy`.

## Requirements

* Node.js 20.9 or newer
* npm
* Docker and the Supabase CLI for local database backed development and browser fixtures

## Local setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the Supabase URL, public key, service role key, database URL, and private payslip bucket name.

3. For local services, start Supabase and inspect its generated URLs and keys.

   ```bash
   npx --no-install supabase start
   npx --no-install supabase status
   ```

   The checked in local configuration uses API port `55421`, database port `55432`, Studio port `55423`, and local email UI port `55424`.

4. Apply the ordered Drizzle migrations.

   ```bash
   npm run db:migrate
   ```

5. Start the application.

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

The application uses server helpers for Supabase access. Do not create ad hoc Supabase clients in feature code. Keep credentials in `.env.local` or the deployment secret store. Environment files are ignored by Git.

If PowerShell says `supabase` is not recognized, run the commands through the local project install as shown above. The project does not require a global Supabase CLI installation.

## Environment flags

Flags use the exact string `true` unless noted otherwise. The overtime flag also accepts `1`, `yes`, and `on`.

| Variable | Purpose | Local default | Production behavior |
| --- | --- | --- | --- |
| `PAYROLL_ENABLED` | Payroll release control | Enabled unless set to `false` | Must be `true` |
| `ATTENDANCE_ENABLED` | Attendance release control | Enabled unless set to `false` | Must be `true` |
| `HR_PULSE_OVERTIME_TIMECARDS_ENABLED` | Overtime and timecards | Disabled | Must be explicitly enabled |
| `HR_PULSE_TIME_OFF_ENABLED` | Time off requests and review | Enabled unless set to `false` | Must be explicitly enabled |
| `HR_PULSE_SELF_SERVICE_ENABLED` | Employee self service | Disabled until enabled | Also requires real employee data flag |
| `HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED` | Production self service data gate | Not required locally | Must be `true` with self service enabled |
| `HR_PULSE_PRODUCT_OPERATIONS_ENABLED` | Operations screens and writes | Disabled | Must be explicitly enabled |
| `HR_PULSE_PRIVACY_ENABLED` | Authenticated privacy controls | Disabled | Must be explicitly enabled |
| `SUPABASE_PAYSLIPS_BUCKET` | Private Storage bucket for payslip PDFs | `payslips` | Required and must remain private |

Production also requires secrets for signed cursors and privacy analytics when the related surfaces are enabled: `HR_PULSE_SELF_SERVICE_CURSOR_SECRET`, `HR_PULSE_PRODUCT_OPERATIONS_CURSOR_SECRET`, and `HR_PULSE_PRIVACY_ANALYTICS_SECRET`. Each secret must contain at least 32 bytes. `NEXT_PUBLIC_SITE_URL` controls the password recovery redirect and defaults to `http://localhost:3000`.

`DRIZZLE_DATABASE_URL` can override `DATABASE_URL` for Drizzle commands. `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` configure the hosted Inngest endpoint. `SENTRY_DSN` enables Sentry monitoring. These values are optional for a basic local development session.

## Commands

```bash
# Install dependencies
npm install

# Start development
npm run dev

# Build for production
npm run build

# Start the production build
npm run start

# Lint
npm run lint

# Unit and integration tests
npm run test

# Browser journeys
npm run test:e2e

# Generate and apply database migrations
npm run db:generate
npm run db:migrate
```

## Verification scripts

The scripts below inspect the live database or exercise release behavior. Run them only against local or disposable fixture data.

```bash
# Seed payroll verification data. Requires DATABASE_URL and SAMP_EMAIL.
npm run verify:payroll:seed

# Verify attendance schema and permissions.
dotenv -e .env.local -- npm run verify:attendance:schema

# Verify time off schema hardening.
dotenv -e .env.local -- node scripts/verify-time-off-schema.mjs

# Verify privacy tables, policies, and migration head.
dotenv -e .env.local -- node scripts/verify-privacy-schema.mjs

# Seed self service fixtures, then run its release checks.
dotenv -e .env.local -- node scripts/seed-self-service-verification.mjs
npm run verify:self-service:release

# Verify self service migration replay behavior.
dotenv -e .env.local -- node scripts/verify-self-service-migration-replay.mjs
```

The browser suite runs with one worker. Database backed journeys create disposable organizations and identities and clean up only their fixture organization. Set the required fixture variables described in `tests/e2e/AGENTS.md` before running the protected payroll, attendance, overtime, time off, operations, or self service journeys. Public journeys can run without those fixtures. Authenticated journeys also require a valid provisioned sample account when `SAMP_EMAIL` and `SAMP_PASS` are set. If those values are stale, sign in journeys fail at the authentication boundary. If they are absent, those journeys skip.

## Routes

The main application routes are:

* `/sign-in`, `/forgot-password`, and `/reset-password` for access and recovery
* `/dashboard`, `/choose-organization`, and `/pending-access` for workspace access
* `/payroll`, `/payroll/setup`, `/payroll/employees`, `/payroll/preview`, and `/payroll/runs/[id]` for payroll operations
* `/attendance` and `/attendance/review` for work intervals and review
* `/timecards`, `/timecards/review`, `/timecards/admin`, and `/timecards/[id]` for overtime workflows
* `/time-off`, `/time-off/review`, and `/time-off/[id]` for leave workflows
* `/self-service`, `/self-service/profile`, `/self-service/time`, and `/self-service/payslips` for employee access
* `/operations` and `/operations/audit` for administrator operations
* `/settings/privacy` and `/admin/privacy` for privacy controls
* `/privacy` and `/terms` for public notices

API route handlers are available for employee records, payroll runs, payroll status, payslip downloads, authentication callbacks, and Inngest events under `src/app/api` and `src/app/auth`.

## Security boundaries

Every protected data path checks the authenticated identity, active profile, selected organization, membership status, role, and employee ownership where relevant. PostgreSQL Row Level Security and organization keyed constraints provide database defense in depth. Payslip objects are private and downloads use short lived signed URLs.

Audit records and telemetry exclude names, contact details, payroll amounts, request bodies, document contents, paths, signed links, and stack traces. Use synthetic data for verification. Real employee data and production payroll require the release controls and hardening evidence described in the numbered specifications under `docs/specs/`.

## Project guidance

Read the root [AGENTS.md](AGENTS.md) before changing the code. Area specific guidance is available beside the authentication, database, attendance, overtime, payroll, time off, self service, product operations, privacy, operations, and end to end test code. Product decisions and acceptance criteria are recorded under `docs/specs/` and the current delivery scope is in `docs/scope/scope.md`.

For user facing help, start with the [role based user guide](docs/user-guide/README.md). It includes separate instructions for employees, managers, and administrators, plus a shared [glossary](docs/user-guide/glossary.md).

For an implementation level walkthrough, start with the [developer handbook](docs/developer-guide/README.md). It explains the architecture, local environment, request lifecycle, security model, domain workflows, testing strategy, and the process used to build new vertical slices.

## License

See [LICENSE](LICENSE).
