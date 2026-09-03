ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_check";--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_check" CHECK ("audit_events"."action" IN ('organization.created', 'organization.updated', 'membership.created', 'membership.role_changed', 'membership.deactivated', 'employee.created', 'employee.updated', 'employee.deactivated', 'attendance.checked_in', 'attendance.clocked_out', 'timecard.prepared', 'timecard.submitted', 'timecard.returned', 'timecard.approved', 'timecard.configuration_returned', 'time_off.submitted', 'time_off.cancelled', 'time_off.approved', 'time_off.declined', 'payroll.preview_created', 'payroll.confirmed', 'payroll.queued', 'payroll.processing', 'payroll.completed', 'payroll.failed', 'payroll.retry_requested', 'self_service.profile_updated', 'auth.sign_in_succeeded', 'auth.sign_in_failed', 'auth.sign_out', 'access.organization_selected', 'access.authorization_denied', 'release_control.changed', 'organization.founded', 'membership.assigned', 'payroll_schedule.changed', 'pay_setting.created', 'payroll.recovered', 'overtime_policy.saved', 'attendance_interval.corrected', 'payroll.timecards_consumed', 'payroll.preview.blocked', 'timecard.resubmitted', 'privacy.consent_changed', 'privacy.deletion_requested', 'privacy.deletion_withdrawn', 'privacy.request_decided', 'privacy.hold_placed', 'privacy.hold_released', 'privacy.deletion_completed', 'privacy.deletion_failed'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.protect_product_event() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.privacy_retention_delete', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'product events are append only';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.protect_operation_failure() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.privacy_retention_delete', true) = 'on' THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'operation failures cannot be deleted'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.operation IS DISTINCT FROM OLD.operation
    OR NEW.safe_code IS DISTINCT FROM OLD.safe_code
    OR NEW.group_key IS DISTINCT FROM OLD.group_key
    OR NEW.first_seen_at IS DISTINCT FROM OLD.first_seen_at
    OR NEW.affected_entity_type IS DISTINCT FROM OLD.affected_entity_type
    OR NEW.affected_entity_id IS DISTINCT FROM OLD.affected_entity_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.occurrence_count < OLD.occurrence_count
    OR NEW.last_seen_at < OLD.last_seen_at THEN
    RAISE EXCEPTION 'operation failure grouping fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.user_privacy_profile_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT profile.id
  FROM public.profiles profile
  WHERE profile.auth_user_id = auth.uid()
    AND profile.status = 'active'
$$;
--> statement-breakpoint
ALTER TABLE public.privacy_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_deletion_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS privacy_consents_owner_read ON public.privacy_consents;
CREATE POLICY privacy_consents_owner_read ON public.privacy_consents FOR SELECT USING (
  profile_id IN (SELECT public.user_privacy_profile_ids())
  AND organization_id IN (SELECT public.user_organization_ids())
);
DROP POLICY IF EXISTS privacy_requests_owner_or_admin_read ON public.privacy_requests;
CREATE POLICY privacy_requests_owner_or_admin_read ON public.privacy_requests FOR SELECT USING (
  organization_id IN (SELECT public.user_organization_ids())
  AND (
    profile_id IN (SELECT public.user_privacy_profile_ids())
    OR organization_id IN (SELECT public.user_administrator_organization_ids())
  )
);
DROP POLICY IF EXISTS privacy_holds_admin_read ON public.privacy_holds;
CREATE POLICY privacy_holds_admin_read ON public.privacy_holds FOR SELECT USING (
  organization_id IN (SELECT public.user_administrator_organization_ids())
);
DROP POLICY IF EXISTS privacy_deletion_executions_admin_read ON public.privacy_deletion_executions;
CREATE POLICY privacy_deletion_executions_admin_read ON public.privacy_deletion_executions FOR SELECT USING (
  organization_id IN (SELECT public.user_administrator_organization_ids())
);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.privacy_consents, public.privacy_requests, public.privacy_holds, public.privacy_deletion_executions FROM anon, authenticated;
GRANT SELECT ON public.privacy_consents, public.privacy_requests, public.privacy_holds, public.privacy_deletion_executions TO authenticated;
