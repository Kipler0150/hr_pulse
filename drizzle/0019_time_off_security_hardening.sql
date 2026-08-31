DROP POLICY IF EXISTS "organization_members_can_read_leave" ON leave_requests;--> statement-breakpoint

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_employee_organization_fk
  FOREIGN KEY (employee_id, organization_id) REFERENCES employees (id, organization_id);--> statement-breakpoint

ALTER TABLE leave_request_events
  ADD CONSTRAINT leave_request_events_request_organization_fk
  FOREIGN KEY (leave_request_id, organization_id) REFERENCES leave_requests (id, organization_id);--> statement-breakpoint

CREATE OR REPLACE FUNCTION guard_time_off_request_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TIME_OFF_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' AND current_setting('hr_pulse.time_off_mutation', true) <> 'on' THEN
    RAISE EXCEPTION 'TIME_OFF_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'declined', 'cancelled') THEN
    RAISE EXCEPTION 'TIME_OFF_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.version <> OLD.version + 1 OR OLD.status <> 'submitted' OR NEW.status NOT IN ('approved', 'declined', 'cancelled')) THEN
    RAISE EXCEPTION 'TIME_OFF_INVALID_STATE';
  END IF;
  RETURN NEW;
END; $$;--> statement-breakpoint

CREATE TRIGGER leave_requests_mutation_guard
BEFORE UPDATE OR DELETE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION guard_time_off_request_mutation();--> statement-breakpoint

CREATE OR REPLACE FUNCTION guard_time_off_event_append_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'TIME_OFF_IMMUTABLE';
END; $$;--> statement-breakpoint

CREATE TRIGGER leave_request_events_append_only_guard
BEFORE UPDATE OR DELETE ON leave_request_events
FOR EACH ROW EXECUTE FUNCTION guard_time_off_event_append_only();--> statement-breakpoint

CREATE OR REPLACE FUNCTION verify_time_off_request_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  request_row leave_requests%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'leave_requests' THEN
    SELECT * INTO request_row FROM leave_requests WHERE id = NEW.id;
  ELSE
    SELECT * INTO request_row FROM leave_requests WHERE id = NEW.leave_request_id;
  END IF;
  IF request_row.status = 'draft' THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM leave_request_events WHERE leave_request_id = request_row.id AND request_version = 1 AND action = 'submitted' AND prior_status IS NULL AND resulting_status = 'submitted') THEN
    RAISE EXCEPTION 'TIME_OFF_HISTORY_MISMATCH';
  END IF;
  IF request_row.status = 'submitted' AND (request_row.version <> 1 OR EXISTS (SELECT 1 FROM leave_request_events WHERE leave_request_id = request_row.id AND request_version > 1)) THEN
    RAISE EXCEPTION 'TIME_OFF_HISTORY_MISMATCH';
  END IF;
  IF request_row.status IN ('approved', 'declined', 'cancelled') AND (request_row.version <> 2 OR NOT EXISTS (SELECT 1 FROM leave_request_events WHERE leave_request_id = request_row.id AND request_version = 2 AND prior_status = 'submitted' AND resulting_status = request_row.status)) THEN
    RAISE EXCEPTION 'TIME_OFF_HISTORY_MISMATCH';
  END IF;
  RETURN NULL;
END; $$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER leave_requests_history_agreement
AFTER INSERT OR UPDATE ON leave_requests
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_time_off_request_history();--> statement-breakpoint

CREATE CONSTRAINT TRIGGER leave_request_events_history_agreement
AFTER INSERT ON leave_request_events
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_time_off_request_history();--> statement-breakpoint

CREATE OR REPLACE FUNCTION transition_leave_request(target_organization_id uuid, target_request_id uuid, expected_version integer, action text, decision_note text DEFAULT NULL, fallback_reason text DEFAULT NULL, retry_request_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  actor uuid;
  actor_role text;
  actor_label text;
  actor_employee_id uuid;
  request leave_requests%ROWTYPE;
  receipt mutation_receipts%ROWTYPE;
  next_status leave_status;
  now_at timestamptz := transaction_timestamp();
  eligible_manager_exists boolean;
  authorized boolean := false;
  was_late boolean;
  payload_hash text;
  snapshot jsonb;
  operation_name text := 'time_off.' || action;
BEGIN
  actor := current_time_off_profile(target_organization_id);
  IF actor IS NULL THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
  IF action NOT IN ('cancel', 'approve', 'decline') THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
  SELECT membership.role::text, profile.display_name, employee.id INTO actor_role, actor_label, actor_employee_id
  FROM memberships membership
  JOIN profiles profile ON profile.id = membership.profile_id
  LEFT JOIN employees employee ON employee.profile_id = membership.profile_id AND employee.organization_id = membership.organization_id AND employee.status = 'active'
  WHERE membership.organization_id = target_organization_id AND membership.profile_id = actor AND membership.status = 'active';
  SELECT leave_request_row.* INTO request FROM leave_requests AS leave_request_row WHERE leave_request_row.id = target_request_id AND leave_request_row.organization_id = target_organization_id FOR UPDATE;
  IF request.id IS NULL THEN RAISE EXCEPTION 'TIME_OFF_UNAVAILABLE'; END IF;
  IF action = 'cancel' THEN
    authorized := actor_employee_id IS NOT NULL AND request.employee_id = actor_employee_id;
  ELSE
    authorized := actor_role IN ('manager', 'administrator')
      AND (actor_employee_id IS NULL OR request.employee_id <> actor_employee_id)
      AND (actor_role = 'administrator' OR EXISTS (SELECT 1 FROM employees target WHERE target.id = request.employee_id AND target.manager_id = actor_employee_id AND target.organization_id = target_organization_id));
  END IF;
  IF NOT authorized THEN RAISE EXCEPTION 'TIME_OFF_UNAVAILABLE'; END IF;
  payload_hash := encode(digest(jsonb_build_object('requestId', target_request_id, 'expectedVersion', expected_version, 'action', action, 'decisionNote', COALESCE(NULLIF(btrim(decision_note), ''), ''), 'fallbackReason', COALESCE(NULLIF(btrim(fallback_reason), ''), ''))::text, 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(target_organization_id::text || ':' || operation_name || ':' || retry_request_id::text, 0));
  SELECT * INTO receipt FROM mutation_receipts WHERE organization_id = target_organization_id AND operation = operation_name AND request_id = retry_request_id;
  IF receipt.id IS NOT NULL THEN
    IF receipt.actor_profile_id <> actor OR receipt.payload_hash <> payload_hash THEN RAISE EXCEPTION 'TIME_OFF_RETRY_CONFLICT'; END IF;
    RETURN jsonb_build_object('result', receipt.result_snapshot, 'retryOutcome', 'replayed');
  END IF;
  IF request.version <> expected_version THEN RAISE EXCEPTION 'TIME_OFF_STALE_VERSION'; END IF;
  IF request.status <> 'submitted' THEN RAISE EXCEPTION 'TIME_OFF_INVALID_STATE'; END IF;
  IF action = 'cancel' THEN
    next_status := 'cancelled';
  ELSE
    SELECT EXISTS (SELECT 1 FROM employees manager_employee JOIN profiles manager_profile ON manager_profile.id = manager_employee.profile_id JOIN memberships manager_membership ON manager_membership.profile_id = manager_profile.id AND manager_membership.organization_id = target_organization_id WHERE manager_employee.id = (SELECT manager_id FROM employees WHERE id = request.employee_id) AND manager_employee.organization_id = target_organization_id AND manager_employee.status = 'active' AND manager_profile.status = 'active' AND manager_membership.status = 'active' AND manager_membership.role IN ('manager', 'administrator')) INTO eligible_manager_exists;
    IF actor_role = 'administrator' AND eligible_manager_exists AND NOT EXISTS (SELECT 1 FROM employees WHERE id = request.employee_id AND manager_id = actor_employee_id) AND COALESCE(char_length(btrim(fallback_reason)), 0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'TIME_OFF_FALLBACK_REASON_REQUIRED'; END IF;
    IF action = 'approve' AND NOT EXISTS (SELECT 1 FROM employees WHERE id = request.employee_id AND status = 'active' AND (termination_date IS NULL OR termination_date >= (now_at AT TIME ZONE (SELECT timezone FROM organizations WHERE id = target_organization_id))::date)) THEN RAISE EXCEPTION 'TIME_OFF_INACTIVE_EMPLOYEE'; END IF;
    IF action = 'decline' AND COALESCE(char_length(btrim(decision_note)), 0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'TIME_OFF_INVALID_NOTE'; END IF;
    IF action = 'approve' THEN next_status := 'approved'; ELSE next_status := 'declined'; END IF;
  END IF;
  was_late := (now_at AT TIME ZONE (SELECT timezone FROM organizations WHERE id = target_organization_id))::date > request.start_date;
  PERFORM set_config('hr_pulse.time_off_mutation', 'on', true);
  UPDATE leave_requests SET status = next_status, version = version + 1, reviewer_profile_id = CASE WHEN action <> 'cancel' THEN actor ELSE reviewer_profile_id END, decision_at = CASE WHEN action <> 'cancel' THEN now_at ELSE decision_at END, cancelled_at = CASE WHEN action = 'cancel' THEN now_at ELSE cancelled_at END, updated_at = now_at WHERE id = request.id;
  INSERT INTO leave_request_events (organization_id, leave_request_id, request_version, action, actor_profile_id, actor_role, organization_timezone, was_late, prior_status, resulting_status, decision_note, fallback_reason)
  SELECT target_organization_id, request.id, expected_version + 1, (CASE action WHEN 'approve' THEN 'approved' WHEN 'decline' THEN 'declined' ELSE 'cancelled' END)::leave_event_action, actor, actor_role, organization.timezone, was_late, request.status, next_status, NULLIF(btrim(decision_note), ''), NULLIF(btrim(fallback_reason), '') FROM organizations organization WHERE organization.id = target_organization_id;
  snapshot := jsonb_build_object('schemaVersion', 1, 'requestId', request.id, 'status', next_status, 'version', expected_version + 1, 'eventTime', now_at, 'actorProfileId', actor, 'actorDisplayLabel', actor_label, 'actorRole', actor_role, 'wasLate', was_late);
  INSERT INTO mutation_receipts (organization_id, actor_profile_id, operation, request_id, payload_hash, result_entity_type, result_entity_id, result_version, result_snapshot) VALUES (target_organization_id, actor, operation_name, retry_request_id, payload_hash, 'leave_request', request.id, expected_version + 1, snapshot);
  INSERT INTO audit_events (organization_id, actor_profile_id, action, entity_type, entity_id, metadata) VALUES (target_organization_id, actor, 'time_off.' || next_status::text, 'leave_request', request.id, jsonb_build_object('requestId', request.id, 'employeeId', request.employee_id, 'priorStatus', request.status, 'resultingStatus', next_status, 'version', expected_version + 1, 'eventTime', now_at, 'wasLate', was_late));
  RETURN jsonb_build_object('result', snapshot, 'retryOutcome', 'created');
END; $$;--> statement-breakpoint

ALTER FUNCTION transition_leave_request(uuid, uuid, integer, text, text, text, uuid) SET search_path = public, extensions;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_leave_request_detail(target_organization_id uuid, target_request_id uuid) RETURNS SETOF jsonb LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'request', to_jsonb(request),
    'events', COALESCE((SELECT jsonb_agg(to_jsonb(event) ORDER BY event.occurred_at, event.id) FROM leave_request_events event WHERE event.leave_request_id = request.id), '[]'::jsonb),
    'currentLate', request.status = 'submitted' AND (transaction_timestamp() AT TIME ZONE organization.timezone)::date > request.start_date,
    'reviewerAvailability', CASE
      WHEN EXISTS (SELECT 1 FROM employees manager_employee JOIN profiles manager_profile ON manager_profile.id = manager_employee.profile_id JOIN memberships manager_membership ON manager_membership.profile_id = manager_profile.id AND manager_membership.organization_id = request.organization_id WHERE manager_employee.id = employee.manager_id AND manager_employee.organization_id = request.organization_id AND manager_employee.status = 'active' AND manager_profile.status = 'active' AND manager_membership.status = 'active' AND manager_membership.role IN ('manager', 'administrator')) THEN 'manager_available'
      WHEN EXISTS (SELECT 1 FROM memberships administrator_membership JOIN profiles administrator_profile ON administrator_profile.id = administrator_membership.profile_id WHERE administrator_membership.organization_id = request.organization_id AND administrator_membership.status = 'active' AND administrator_membership.role = 'administrator' AND administrator_profile.status = 'active') THEN 'administrator_fallback'
      ELSE 'reviewer_needed'
    END
  )
  FROM leave_requests request
  JOIN organizations organization ON organization.id = request.organization_id
  JOIN employees employee ON employee.id = request.employee_id
  WHERE request.id = target_request_id AND request.organization_id = target_organization_id AND request.status <> 'draft';
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION guard_time_off_request_mutation() , guard_time_off_event_append_only(), verify_time_off_request_history() FROM PUBLIC, anon;--> statement-breakpoint
