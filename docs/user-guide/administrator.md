# Administrator guide

The administrator role manages organization setup, access, payroll, review workflows, privacy operations, and product operations. Administrator actions affect other users, so confirm the selected organization before making a change.

## Set up an organization

The organization founder starts setup from **Set up organization**.

1. Enter the organization name, time zone, default currency, payroll frequency, and effective start date.
2. For a weekly schedule, provide the required anchor date when the form asks for one.
3. Submit the setup form.
4. Confirm that the new organization appears as an active administrator workspace.

The first founder must be an active provisioned profile that is not already attached to another organization as a founder. HR Pulse creates the first active administrator membership and payroll schedule during setup.

## Configure payroll access

Open **Payroll**, then choose **Manage setup**.

### Set the payroll schedule

Choose one of the supported frequencies:

* Weekly
* Every two weeks
* Twice monthly
* Monthly

Set the first period start date according to the schedule rules shown by the form. After a completed run, changes begin on a compatible future boundary. Confirmed runs retain their original schedule snapshot.

### Provision role access

Use **Assign role access** to connect a provisioned HR Pulse profile to the organization.

1. Enter the exact email address of the existing profile.
2. Choose **Administrator**, **Manager**, or **Employee**.
3. Choose **Active** or **Inactive**.
4. Choose **Save role access**.

At least one active administrator must remain in the organization. This screen changes organization membership and role access. It does not create a new authentication account.

## Add employees and pay settings

From **Payroll**, open **Employees**, then choose the employee action.

Enter the employee number, legal name, work email, hire date, and any available preferred name, phone, department, title, manager, or work location. Link the employee to a provisioned profile only when the exact identity and organization are correct.

Add an effective pay setting for the employee. The pay setting includes the gross amount, pay frequency, currency, and flat deductions. When overtime is enabled, add the overtime eligibility, standard period minutes, and multiplier required by the form.

Employee and pay setting edits use version checks. If HR Pulse says the record changed, refresh the page before saving again. Deactivating an employee prevents new work from entering later workflows while preserving historical records.

## Run payroll

Use the payroll workflow for the most recently closed period.

1. Open **Payroll** and confirm that the setup readiness checks are complete.
2. Choose **Preview next payroll**.
3. Review the period, eligible employees, gross pay, deductions, net pay, currency, and any readiness issues.
4. Resolve missing pay settings, currency mismatches, missing approved timecards, or other issues shown in the preview.
5. Confirm the preview when it is correct.
6. Open the payroll run and monitor its status.
7. Review the completed payouts and download generated payslips when needed.

Payroll processing runs in the background. A run can be **Queued**, **Processing**, **Completed**, or **Failed**. Keep the run page open or refresh it to see the committed status. Completed and failed states are terminal unless the page offers a documented retry action.

The current payroll beta calculates basic fixed pay and flat deductions. It does not send external money transfers or calculate regional tax rules. Use synthetic employee and pay data only.

## Review attendance

Open **Attendance review**, choose an organization date, and inspect check in, clock out, duration, status, open sessions, and long interval warnings. The page follows the organization time zone and shows up to 50 records at a time.

If an interval requires correction, use the administrator correction control in the timecard workflow. Enter the completed interval ID, the latest correction ID when one exists, corrected UTC timestamps, and a plain text reason. Corrections append evidence; they do not erase the original event.

## Manage overtime and timecards

When the overtime and timecards feature is enabled, administrators can manage the policy and correct attendance evidence.

1. Open **Timecards**.
2. Set an effective payroll period start that aligns with the organization schedule.
3. Set the daily threshold in minutes.
4. Enable or disable overtime calculation.
5. Save a new policy version.
6. Use **Administrator timecards** to inspect or correct organization cards when the workflow permits it.

Reviewers must approve the frozen timecard evidence before payroll uses it. If an administrator acts as a fallback reviewer, enter the override reason requested by the form. A stale policy, pay setting, or attendance snapshot returns the card for fresh review.

## Review time off

Open **Time off review** to see the organization request queue.

1. Filter by status, date range, or employee ID.
2. Open a request and review the dates, type, reason, employee status, and workflow events.
3. Choose **Approve** or **Decline**.
4. Add a decision note when declining.
5. Add the administrator override reason when the form requires one.
6. Confirm that the request status and attendance marker are correct.

Use the next page control for queues larger than 50 requests. Do not bypass the workflow with a direct database write.

## Use operations

When product operations is enabled, open **Operations** to review:

* Adoption milestones
* Payroll queue health
* Failure summaries
* Organization scoped audit history

Open an audit event for safe detail and recovery links. Operations is a visibility feature. It does not add mutation controls. It shows opaque identifiers, fixed labels, timestamps, correlation values, resulting versions, changed field names, and reason codes rather than private record contents.

## Manage privacy operations

When privacy controls are enabled, open **Privacy operations** to:

1. Review submitted deletion requests.
2. Choose **Start review** for a request that needs administrator review.
3. Choose **Approve** or **Reject** after reviewing the request status.
4. Place a profile hold when a documented legal or operational reason requires deletion to wait.
5. Release the hold when the reason no longer applies.

The privacy operations page is intentionally limited. It does not show request contents, names, or payroll data. Payroll, payslips, audit history, and account records remain outside the deletion boundary of this feature.

## Keep access safe

Before changing access or payroll:

* Verify the organization name in the top bar.
* Confirm that the profile email is the intended provisioned identity.
* Review the current record version.
* Use a clear reason when the workflow requests one.
* Never paste credentials, payment details, or unnecessary personal data into notes.

If another administrator changes the record first, HR Pulse may return a stale version message. Refresh and review the latest committed state before trying again.

