# Local development

## What runs locally

Local development uses two groups of processes:

1. Docker containers managed by the Supabase CLI run PostgreSQL, Auth, the API gateway, Storage, Realtime, Studio, and the local email viewer.
2. Node.js runs the Next.js development server, tests, Drizzle tooling, and project scripts.

The Next.js application is not currently containerized. There is no project `Dockerfile` or Compose file. Docker is used by the local Supabase stack.

## Prerequisites

- Node.js 20.9 or newer
- npm
- Docker Desktop with the Docker engine running
- Enough local resources for the Supabase containers

The Supabase CLI is already a project development dependency. Use it through `npx --no-install` after `npm install`; a global installation is unnecessary.

## First setup on Windows PowerShell

From the repository root:

```powershell
npm install
Copy-Item .env.example .env.local
npx --no-install supabase start
npx --no-install supabase status
```

`supabase status` prints local URLs and keys. Copy the matching values into `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<service role key from supabase status>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres
SUPABASE_PAYSLIPS_BUCKET=payslips
```

Do not copy real hosted credentials into committed files. `.env.local` is ignored by Git.

Apply the application migrations and start Next.js:

```powershell
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`.

## Local service addresses

The checked-in `supabase/config.toml` assigns stable ports:

| Service | Address |
| --- | --- |
| Next.js | `http://localhost:3000` |
| Supabase API and Auth | `http://127.0.0.1:55421` |
| PostgreSQL | `127.0.0.1:55432` |
| Supabase Studio | `http://127.0.0.1:55423` |
| Local email viewer | `http://127.0.0.1:55424` |
| Supabase analytics | `127.0.0.1:55427` |

The email viewer is useful for password recovery. Local emails are captured rather than delivered to real inboxes.

## Environment groups

### Required application connections

| Variable | Used by |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cookie-based authenticated clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Administrative fixture/setup code only |
| `DATABASE_URL` | Drizzle and direct PostgreSQL access |
| `DRIZZLE_DATABASE_URL` | Optional database override for Drizzle commands |
| `SUPABASE_PAYSLIPS_BUCKET` | Private payslip object storage |

The service-role key bypasses normal RLS and must never be exposed to browser code. Its `SUPABASE_` name is intentional; it is not prefixed with `NEXT_PUBLIC_`.

### Feature flags

| Variable | Local behavior |
| --- | --- |
| `PAYROLL_ENABLED` | Enabled unless explicitly `false` |
| `ATTENDANCE_ENABLED` | Enabled unless explicitly `false` |
| `HR_PULSE_OVERTIME_TIMECARDS_ENABLED` | Disabled until enabled |
| `HR_PULSE_TIME_OFF_ENABLED` | Enabled unless explicitly `false` |
| `HR_PULSE_SELF_SERVICE_ENABLED` | Disabled until enabled |
| `HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED` | Required with self service in production |
| `HR_PULSE_PRODUCT_OPERATIONS_ENABLED` | Disabled until enabled |
| `HR_PULSE_PRIVACY_ENABLED` | Disabled until enabled |

Flags are also checked in server code. Removing a navigation link is not considered a release control.

### Secrets and integrations

| Variable | Purpose |
| --- | --- |
| `HR_PULSE_SELF_SERVICE_CURSOR_SECRET` | HMAC signing for self-service cursors |
| `HR_PULSE_PRODUCT_OPERATIONS_CURSOR_SECRET` | Signing/validation for operations cursors |
| `HR_PULSE_PRIVACY_ANALYTICS_SECRET` | Pseudonymous privacy analytics identifiers |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Hosted Inngest authentication |
| `INNGEST_DEV` | Local Inngest development behavior |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Server and browser error monitoring |
| `NEXT_PUBLIC_SITE_URL` | Password recovery redirect origin |

Development fallbacks exist for some secrets. Production code intentionally fails closed when a required secret is missing.

## Daily commands

```powershell
# Start or inspect local services
npx --no-install supabase start
npx --no-install supabase status

# Stop local services without deleting their volumes
npx --no-install supabase stop

# Run the application
npm run dev

# Quality checks
npm run lint
npm run test
npm run build
npm run test:e2e

# Schema work
npm run db:generate
npm run db:migrate
```

Use `supabase db reset` only against the disposable local stack. It recreates the local database and reapplies migrations and seed data.

## Migration workflow

1. Change `src/db/schema.js` for the Drizzle representation.
2. Generate a migration with `npm run db:generate` when the change is representable by Drizzle.
3. Add or carefully edit the new migration for PostgreSQL-specific constraints, functions, triggers, grants, or RLS policies.
4. Apply it with `npm run db:migrate`.
5. Run schema verification and migration replay checks relevant to the domain.
6. Never edit an old migration merely to make a new environment pass. Add a corrective migration so existing environments can advance safely.

## Troubleshooting

### `supabase` is not recognized

Use the local npm executable:

```powershell
npx --no-install supabase start
```

If npm reports that the executable is missing, run `npm install` from the repository root first.

### Supabase cannot connect to Docker

Open Docker Desktop and wait until the engine reports that it is running. Then verify:

```powershell
docker version
docker ps
```

Restart `npx --no-install supabase start` after Docker is ready.

### A configured port is already in use

Inspect running containers with `docker ps`. Another Supabase project may already own the same ports. Stop the other local project or change this project's ports in `supabase/config.toml` and update `.env.local` consistently.

### `DATABASE_URL is required`

Drizzle reads `.env.local` through `drizzle.config.js`, while application code reads environment variables through Next.js. Confirm `DATABASE_URL` exists and restart the development server after changing it.

### Sign-in succeeds but the app shows pending access

Supabase Auth identity alone is not enough. The user also needs an active row in `profiles`, an active `memberships` row for an active organization, and sometimes a linked active `employees` row. See the authentication chapter.

### The favicon or static asset looks stale

Browsers cache icons aggressively. The icon metadata includes a version query, but an open tab may still keep an older image. Hard refresh or reopen the browser after changing the SVG.

### Browser tests fail at sign-in

Protected Playwright journeys require valid fixture environment variables and a provisioned sample account. Stale `SAMP_EMAIL` or `SAMP_PASS` values cause the suite to fail at the auth boundary. Public journeys can run without those credentials; many protected journeys skip when their fixture controls are absent.

## Safe local-data rule

Use synthetic employee names, emails, compensation, attendance, and payslips. Local scripts and browser tests may reset, mutate, or clean fixture organizations. Never point verification scripts at a production database.
