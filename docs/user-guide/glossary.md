# HR Pulse glossary

## Active profile

A provisioned HR Pulse identity whose profile status is active. Signing in alone does not grant access when the profile is inactive.

## Active membership

An active link between a profile and an organization. A user can have different memberships and roles in different organizations.

## Administrator

The organization role commonly called admin. An administrator manages setup, memberships, payroll, privacy operations, and product operations. At least one active administrator must remain in an organization.

## Attendance interval

One work session from check in to clock out. HR Pulse prevents an employee from creating more than one open interval at a time.

## Closed payroll period

A payroll period whose end date has passed in the organization time zone and is eligible for preview. Future periods cannot be run as closed periods.

## Consent

An explicit choice that allows or refuses optional product analytics. Analytics is off until the user chooses to allow it.

## Cursor pagination

A way to move through a long list using a server issued next page token instead of a page number. HR Pulse signs cursors and binds them to the organization and current filters.

## Employee

The organization role for a person who records their own attendance, submits timecards, requests time off, and may use self service. An employee role is separate from the employee record that stores work information.

## Employee record

The organization record that stores work information such as employee number, legal name, hire date, pay settings, manager, and employment status. It can be linked to a profile for self service.

## Evidence snapshot

The attendance, policy, and pay information captured for a timecard or payroll calculation. A snapshot helps reviewers see which data was used and prevents silent changes after submission.

## Feature flag

An environment setting that turns a product area on or off. A hidden navigation link is not the security boundary. The server checks the flag and the user’s authorization again.

## Inngest

The background job service used by HR Pulse for durable payroll processing and scheduled privacy retention. A payroll request can continue after the browser request ends.

## Legal hold

A profile scoped privacy control that pauses eligible deletion until an administrator releases the hold. It does not change payroll or audit history.

## Manager

The organization role that reviews work for assigned direct reports. Managers can review attendance and act on timecards and time off within their allowed scope.

## Membership

The organization access record that connects a profile to an organization and assigns a role and access status.

## Organization

The workspace that owns employees, memberships, payroll settings, attendance, timecards, time off, and audit records. Every protected data path is scoped to one selected organization.

## Payslip

The generated PDF record for one employee payout. Payslips are stored in a private bucket and accessed through short lived signed links.

## Payroll run

One confirmed processing attempt for a closed payroll period. It moves through queued, processing, completed, or failed states.

## Pay setting

An effective dated employee pay record containing the gross amount, currency, frequency, deductions, and optional overtime settings.

## Private bucket

A non public Supabase Storage bucket. HR Pulse verifies that the payslip bucket is private before uploading or signing a download.

## Profile

The identity record connected to a signed in user. A profile contains access status and display information. It is not the same as an employee record.

## Row Level Security

PostgreSQL policies that restrict database rows according to the authenticated organization and identity. HR Pulse uses these policies together with application checks.

## Self service

The employee area for profile updates, approved timecard history, payslip history, and secure payslip downloads. It requires an active linked employee record.

## Synthetic data

Test or example data created for verification. The current beta requires synthetic employee and pay data and does not support external payroll transfers.

## Timecard

A reviewable record for one employee and payroll period. It combines attendance evidence with overtime policy and pay setting snapshots.

## Time off request

An employee request for whole organization calendar dates with a type, optional reason, status, and workflow history.

## Workflow history

The append only record of actions and decisions on a request or timecard. It helps users understand what happened without rewriting earlier events.
