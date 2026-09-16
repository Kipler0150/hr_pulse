# Developer glossary

## Access context

The resolved user, profile, selected organization, membership, role, and optional linked employee used to authorize a request.

## Action state

A small serializable success/error object returned by a server action to a client component, commonly consumed through React `useActionState`.

## Active profile

A local `profiles` row whose status permits product access. A valid Supabase session without an active profile is insufficient.

## App Router

Next.js routing model where folders under `src/app` define layouts, pages, loading/error boundaries, and route handlers.

## Audit event

An append-only, organization-scoped record of an important access or workflow change using an allow-listed action and safe metadata.

## Authorization

The decision that an authenticated caller may perform a specific operation on a specific organization/record.

## Cursor pagination

Pagination that continues after the final ordered key of the current page, rather than skipping an offset. It is more stable when records are added while browsing.

## Defense in depth

Independent protection layers—application access checks, scoped queries, constraints, controlled functions, grants, and RLS—so one missed check does not expose data.

## Domain error

An expected business failure represented by a stable code and mapped to safe user guidance, distinct from an unexpected programming/provider exception.

## Domain service

Code that owns business workflow behavior and persistence orchestration without depending on a particular page component.

## Drizzle

The JavaScript ORM/query builder and schema representation used by HR Pulse for PostgreSQL access and migration generation.

## Effective-dated record

A setting that applies during a date range, such as pay settings. Effective ranges prevent current configuration from overwriting historical meaning.

## Employee link

The optional relationship from an HR employee record to a local profile. It enables owner-only employee portal behavior.

## Feature flag

An environment-controlled release switch checked by navigation and server/domain code. Flags fail closed in production according to each domain contract.

## Fingerprint

A cryptographic digest of canonical source data used to prove that payroll inputs have not changed between preview and confirmation.

## Frozen snapshot

Copied values and evidence preserved at a workflow milestone so later edits to source records do not rewrite history.

## HMAC-signed cursor

A pagination cursor carrying scoped state and a secret-derived signature. Editing its organization, employee, status, or expiry invalidates it.

## Idempotency

The property that retrying the same logical request does not create additional side effects. Exact replay may return the original result; conflicting reuse is rejected.

## Inngest

The durable background execution service used for payroll processing and scheduled privacy retention.

## IANA timezone

A named timezone such as `Asia/Manila` that contains daylight-saving and historical offset rules. It is used to map UTC instants to organization-local dates.

## Layered monolith

One deployable application whose internal UI, domain, persistence, and integration responsibilities remain separated into layers.

## Lease

A time-limited database claim indicating that a worker currently owns background processing. An expired lease enables controlled recovery.

## Linked employee

An active employee row whose `profile_id` points to the current user's active profile within the selected organization.

## Membership

The organization-specific role and status connecting a profile to an organization.

## Minor units

Integer representation of currency. For a two-decimal currency, 10,000 minor units represents 100.00.

## Mutation receipt

A stored record of a retry-safe operation, its request identity/payload identity, and outcome.

## Optimistic concurrency

A version check that rejects an update when another operation has changed the record since the caller read it.

## Organization scope

The tenant boundary. Protected records and queries carry or derive an organization ID even when other IDs are globally unique.

## Partial failure

A failure in one independent portion of a page or workflow that does not require hiding other valid results. Self-service home cards and attendance leave enrichment use this idea.

## Payout

The frozen per-employee financial result inside a payroll run, including gross, deductions, net, currency, and earning lines.

## PostgreSQL function / RPC

A database function invoked through Supabase's remote procedure call interface. HR Pulse uses authenticated functions for atomic and tightly granted transitions.

## Preview token

A short-lived secret returned after a valid payroll preview. Its stored hash binds confirmation to the actor, period, calculation version, and source fingerprint.

## Profile

The local HR Pulse identity mapped one-to-one to a Supabase Auth user ID.

## Pseudonymous identifier

A stable secret-derived identifier used for consented analytics without storing a direct profile identifier in the event.

## RLS

PostgreSQL Row Level Security. Policies decide which rows the current database identity may read or mutate.

## Record ownership

The relationship proving that a caller owns or is assigned to a target record, such as an employee accessing their linked employee row or a manager accessing a direct report.

## Revalidation

Next.js cache invalidation after mutation through `revalidatePath`, causing affected server-rendered routes to load current state.

## Role rank

The employee → manager → administrator ordering used for broad role checks. Domain rules may still impose narrower assignment requirements.

## Route group

An App Router folder in parentheses, such as `(protected)`, used for code/layout organization without adding that folder name to the URL.

## Route handler

A `route.js` module that implements an HTTP method such as GET or POST for callbacks, JSON APIs, status polling, downloads, or Inngest.

## Safe error code

A stable allow-listed identifier that communicates a known outcome without exposing raw provider, database, or sensitive record detail.

## Security definer

A PostgreSQL function mode that runs with the function owner's privileges. It requires narrow grants, an explicit safe search path, and authorization inside the function.

## Server action

A Next.js server function invoked by a form or client component for an internal mutation. It is still a security boundary and must validate and authorize every call.

## Server component

A React component rendered on the server. It can load protected data and does not send its implementation/dependencies to the browser bundle.

## Service-role key

A privileged Supabase credential that bypasses RLS. It is reserved for server-side administrative setup and controlled fixtures, never browser code.

## Signed URL

A short-lived URL granting access to one private Storage object after application authorization. It should be generated on demand and never persisted or logged.

## Source evidence

The exact records and values explaining a calculated result, such as attendance interval allocations stored with a timecard day.

## State machine

A defined set of statuses and allowed transitions. It prevents arbitrary lifecycle updates such as changing completed payroll back to a draft.

## Tenant

An organization whose data is isolated from every other organization.

## Tracer bullet

A thin but complete feature path through every required layer, used to prove architecture early before expanding edge cases and breadth.

## Transaction

A database unit in which all statements commit together or all roll back. Transactions protect multi-row workflow changes.

## UTC instant

An exact moment stored with timezone-aware timestamps. It differs from a local calendar date, which depends on organization timezone.

## Vertical slice

A user-visible workflow implemented through UI, access, domain logic, persistence, security, and tests rather than completing one technical layer for the whole product first.

## Versioned event

A background event whose payload includes a contract version, allowing workers to reject unknown shapes instead of processing them incorrectly.

## Worker generation

A number identifying the current logical processing attempt for a payroll run. Stale events from earlier generations cannot mutate the newer attempt.

## Write boundary

The layer authorized to change state, such as a server action plus domain service or a narrowly granted PostgreSQL function.
