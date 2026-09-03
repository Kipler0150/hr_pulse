# HR Pulse privacy notice

## Scope

This internal, jurisdiction-neutral notice explains how HR Pulse handles information used to run payroll, attendance, and employee self service. It is a product policy and does not make a compliance claim under a named law.

## Information used by the service

HR Pulse uses the minimum information needed for provisioned people operations: account and organization access details, attendance and timecard records, payroll records, payslips, audit history, and service reliability signals. Access is limited by organization membership, active identity, role, and database policy.

## Product analytics consent

Product analytics is off unless an authenticated employee explicitly turns it on in Privacy settings. With consent, HR Pulse may record a product event name, route category, timestamp, and bounded numeric or categorical properties with an organization-scoped pseudonymous subject key. Names, email addresses, payroll values, request bodies, free text, and technical traces are excluded.

Security monitoring, immutable audit history, and essential error reporting continue regardless of product analytics consent. Withdrawal takes effect for future analytics writes immediately.

## Retention

Product analytics and failure summaries use a 12-month UTC retention period. Superseded consent history and completed privacy requests use a 24-month retention period. The current consent choice remains until account deletion. A scheduled retention job uses bounded batches and records only aggregate execution evidence.

## Deletion requests and holds

An employee may submit one deletion request for their authenticated identity, review its status, and withdraw it while it is submitted or under review. An administrator may approve or reject the request and place a profile-scoped legal hold. A held profile is skipped by deletion execution. Employee accounts, audit history, payroll records, and payslips remain preserved by this feature.

## Safeguards and review

Privacy reads and changes require an active authenticated identity and organization membership. The policy version and effective date are shown above. This notice is reviewed in the repository and may be replaced by a newer version after product and legal review.
