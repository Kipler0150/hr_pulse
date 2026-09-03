ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS result varchar(30) DEFAULT 'success';
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS actor_label_snapshot varchar(200);
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS actor_role_snapshot varchar(30);
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS correlation_id uuid;
UPDATE public.audit_events SET result = 'success' WHERE result IS NULL;
ALTER TABLE public.audit_events ALTER COLUMN result SET DEFAULT 'success';
ALTER TABLE public.audit_events ALTER COLUMN result SET NOT NULL;

ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_result_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_result_check CHECK (result IN ('success', 'expected_error', 'unexpected_error', 'denied'));
ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check CHECK (action IN (
  'organization.created', 'organization.updated', 'membership.created', 'membership.role_changed', 'membership.deactivated',
  'employee.created', 'employee.updated', 'employee.deactivated', 'attendance.checked_in', 'attendance.clocked_out',
  'timecard.prepared', 'timecard.submitted', 'timecard.returned', 'timecard.approved', 'timecard.configuration_returned',
  'time_off.submitted', 'time_off.cancelled', 'time_off.approved', 'time_off.declined', 'payroll.preview_created',
  'payroll.confirmed', 'payroll.queued', 'payroll.processing', 'payroll.completed', 'payroll.failed', 'payroll.retry_requested',
  'self_service.profile_updated', 'auth.sign_in_succeeded', 'auth.sign_in_failed', 'auth.sign_out', 'access.organization_selected',
  'access.authorization_denied', 'release_control.changed',
  'organization.founded', 'membership.assigned', 'payroll_schedule.changed', 'pay_setting.created', 'payroll.recovered',
  'overtime_policy.saved', 'attendance_interval.corrected', 'payroll.timecards_consumed', 'payroll.preview.blocked', 'timecard.resubmitted'
));

CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  event_name varchar(100) NOT NULL,
  schema_version integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  workflow_area varchar(30),
  result_category varchar(30),
  duration_ms integer,
  dedupe_key varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_events_schema_version_positive CHECK (schema_version > 0),
  CONSTRAINT product_events_duration_bounded CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 3600000),
  CONSTRAINT product_events_result_category_check CHECK (result_category IS NULL OR result_category IN ('success', 'expected_error', 'unexpected_error')),
  CONSTRAINT product_events_workflow_area_check CHECK (workflow_area IS NULL OR workflow_area IN ('auth', 'setup', 'attendance', 'time_off', 'timecards', 'payroll', 'self_service'))
);

CREATE TABLE IF NOT EXISTS public.operation_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  operation varchar(100) NOT NULL,
  safe_code varchar(100) NOT NULL,
  group_key varchar(64) NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  affected_entity_type varchar(100),
  affected_entity_id uuid,
  workflow_status varchar(50),
  recovery_available boolean NOT NULL DEFAULT false,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operation_failures_count_nonnegative CHECK (occurrence_count >= 1),
  CONSTRAINT operation_failures_time_order CHECK (last_seen_at >= first_seen_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_events_organization_dedupe_unique ON public.product_events (organization_id, dedupe_key);
CREATE INDEX IF NOT EXISTS product_events_organization_occurred_idx ON public.product_events (organization_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS product_events_organization_event_occurred_idx ON public.product_events (organization_id, event_name, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS operation_failures_organization_group_unique ON public.operation_failures (organization_id, group_key);
CREATE INDEX IF NOT EXISTS operation_failures_organization_last_seen_idx ON public.operation_failures (organization_id, last_seen_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_events_organization_action_created_idx ON public.audit_events (organization_id, action, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.protect_product_event() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'product events are append only';
END;
$$;
DROP TRIGGER IF EXISTS product_events_append_only ON public.product_events;
CREATE TRIGGER product_events_append_only BEFORE UPDATE OR DELETE ON public.product_events FOR EACH ROW EXECUTE FUNCTION public.protect_product_event();

CREATE OR REPLACE FUNCTION public.protect_operation_failure() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
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
DROP TRIGGER IF EXISTS operation_failures_controlled_updates ON public.operation_failures;
CREATE TRIGGER operation_failures_controlled_updates BEFORE UPDATE OR DELETE ON public.operation_failures FOR EACH ROW EXECUTE FUNCTION public.protect_operation_failure();

CREATE OR REPLACE FUNCTION public.user_administrator_organization_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT membership.organization_id
  FROM public.memberships membership
  JOIN public.profiles profile ON profile.id = membership.profile_id
  JOIN public.organizations organization ON organization.id = membership.organization_id
  WHERE profile.auth_user_id = auth.uid()
    AND profile.status = 'active'
    AND membership.status = 'active'
    AND membership.role = 'administrator'
    AND organization.status = 'active'
$$;

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_members_can_read_audit ON public.audit_events;
DROP POLICY IF EXISTS administrators_can_read_audit ON public.audit_events;
CREATE POLICY administrators_can_read_audit ON public.audit_events FOR SELECT USING (organization_id IN (SELECT public.user_administrator_organization_ids()));
CREATE POLICY administrators_can_read_product_events ON public.product_events FOR SELECT USING (organization_id IN (SELECT public.user_administrator_organization_ids()));
CREATE POLICY administrators_can_read_operation_failures ON public.operation_failures FOR SELECT USING (organization_id IN (SELECT public.user_administrator_organization_ids()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_events, public.product_events, public.operation_failures FROM anon, authenticated;
GRANT SELECT ON public.audit_events, public.product_events, public.operation_failures TO authenticated;
