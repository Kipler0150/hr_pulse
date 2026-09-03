ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check CHECK (action IN (
  'organization.created', 'organization.updated', 'membership.created', 'membership.role_changed', 'membership.deactivated',
  'employee.created', 'employee.updated', 'employee.deactivated', 'attendance.checked_in', 'attendance.clocked_out',
  'timecard.prepared', 'timecard.submitted', 'timecard.returned', 'timecard.approved', 'timecard.configuration_returned',
  'time_off.submitted', 'time_off.cancelled', 'time_off.approved', 'time_off.declined', 'payroll.preview_created',
  'payroll.confirmed', 'payroll.queued', 'payroll.processing', 'payroll.completed', 'payroll.failed', 'payroll.retry_requested',
  'self_service.profile_updated', 'auth.sign_in_succeeded', 'auth.sign_in_failed', 'auth.sign_out', 'access.organization_selected',
  'access.authorization_denied', 'release_control.changed', 'organization.founded', 'membership.assigned', 'payroll_schedule.changed',
  'pay_setting.created', 'payroll.recovered', 'overtime_policy.saved', 'attendance_interval.corrected', 'payroll.timecards_consumed',
  'payroll.preview.blocked', 'timecard.resubmitted'
));
