# Background jobs and operations

Some work should not run inside a browser request. Payroll PDF generation can take time and must retry; privacy retention runs on a schedule. HR Pulse uses Inngest for durable execution and persists workflow state in PostgreSQL.

## Inngest entry point

`src/app/api/inngest/route.js` uses `serve` from `inngest/next` and exports `GET`, `POST`, and `PUT`. It registers:

- `processPayroll` from `src/inngest/payroll.js`;
- `runPrivacyRetentionDaily` from `src/inngest/privacy.js`.

The client ID is `hr-pulse` in `src/inngest/client.js`.

In a hosted environment, signing and event keys authenticate the integration. Do not expose those keys to browser code.

## Payroll queue delivery

`submitPayrollRun` sends `payroll/run.requested` with:

- run ID;
- organization ID;
- generation number;
- event contract version.

The event ID is deterministic: `payroll-run/<runId>/generation/<generation>`. Repeating the same submission identifies the same logical attempt rather than inventing unrelated work.

After delivery, the database records queue status, submission time, and provider event ID. Delivery failure records a safe `QUEUE_DELIVERY_FAILED` code, creates a grouped operational failure, captures the unexpected exception in Sentry, and leaves an administrator recovery path.

## Payroll worker

The Inngest function has three important controls:

- three retries for transient execution failure;
- singleton execution per organization in skip mode;
- an `onFailure` handler that marks the matching run generation failed.

The worker also checks the event version. Unknown event shapes are ignored rather than guessed.

`processPayrollRun` persists its own concurrency controls:

1. lock organization and run rows;
2. verify organization, run status, and generation;
3. claim or refresh a lease;
4. record an attempt and progress;
5. move run/payout/payslip states through allowed transitions;
6. generate documents and upload them privately;
7. finalize totals/status or record a stable retry/failure result.

Why both Inngest controls and database controls? Queue configuration reduces duplicate execution, while database locks, generations, leases, and unique constraints protect correctness if duplicate events, retries, worker crashes, or manual recoveries still occur.

## Polling and recovery

The run page receives an initial server-rendered status. `RunPolling` checks the authorized status route while a run is queued or processing. It preserves the last known value through temporary network errors and backs off to a ten-second maximum interval.

The service derives:

- **delayed** from the last progress timestamp;
- **recovery eligible** from a delayed state plus an expired worker lease.

Administrator actions can resubmit failed queue delivery, retry a frozen failed generation, or recover an abandoned delayed run. Each path rechecks locks and state; the UI button alone does not authorize recovery.

## Payslip generation and storage

`src/payroll/pdf.js` creates a versioned PDF from frozen run, payout, deduction, and earning snapshots. It does not load current employee/pay settings to rebuild history.

`src/lib/storage.js` centralizes the private bucket name and server-side Storage client. Generated object paths are stored in `payslips`; the bucket remains private.

The download route:

1. resolves the caller and selected organization;
2. proves the caller may access that payslip;
3. requires completed/finalized/generated/immutable state;
4. creates a short-lived signed URL;
5. redirects or returns the safe download response.

Never store a signed URL. Store the private object path and generate a fresh signed URL after each authorization check.

## Privacy retention schedule

`runPrivacyRetentionDaily` runs at `0 2 * * *` and retries three times. The domain retention service owns the actual policy and database work.

Retention uses deterministic execution keys and `onConflictDoNothing` claims so a retry does not repeat destructive work unknowingly. Legal holds and protected financial/audit records are evaluated before deletion or de-identification.

Development and production schedules use the database as the durable record. Do not depend on an in-memory timer inside the Next.js process.

## Audit history

`writeAuditEvent` records who performed an important action, when it happened, what safe entity it affected, the result, and bounded metadata. System work may have no actor profile.

Audit events answer questions such as:

- Who approved this timecard?
- When was payroll confirmed?
- Was an access request denied?
- Which workflow transition occurred?

They do not store full before/after row snapshots. Sensitive details remain in their protected domain records.

## Product events

Product events measure adoption milestones such as completed setup, preview creation, payroll confirmation, or profile update. Writes are:

- gated by the operations feature and privacy consent rules;
- pseudonymous where identity is needed;
- deduplicated by occurrence identity;
- limited to an allow-listed event catalog;
- free of business payloads.

Product analytics should answer whether a workflow is used, not reproduce the workflow's employee data.

## Failure summaries

`operation_failures` groups repeated operational failures using safe dimensions. A record can include:

- organization;
- operation and workflow area;
- safe code;
- affected entity type/ID;
- workflow status;
- occurrence count and timestamps;
- whether recovery is available.

It excludes exception messages and stacks. Full unexpected exception diagnostics belong in Sentry under its own privacy configuration.

## Sentry

Sentry captures unexpected failures at server, edge, and browser boundaries. Domain errors that represent expected user states should normally be serialized into safe UI guidance rather than treated as crashes.

When capturing an exception, tags may identify safe organization/run IDs and stable error codes. Do not attach request bodies, names, contact information, payroll amounts, document content, storage paths, signed links, reasons/notes, or database query values.

## Operational design checklist

For new background work:

1. Persist durable intent before sending the event.
2. Version the event contract.
3. Use a deterministic logical event ID.
4. Define retryable versus terminal errors.
5. Add database idempotency and concurrency protection.
6. Persist attempts, progress, and a safe final status.
7. Provide a bounded recovery operation for abandoned work.
8. Ensure failure reporting cannot leak domain payloads.
9. Make the UI resilient to delayed and temporarily unreachable status reads.
10. Test duplicate delivery, worker retry, stale generation, lost response, and terminal completion.
