CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint

CREATE OR REPLACE FUNCTION submit_leave_request(target_organization_id uuid, start_date date, end_date date, leave_type leave_type, reason text, retry_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  actor uuid;
  actor_role text;
  actor_label text;
  employee employees%ROWTYPE;
  request leave_requests%ROWTYPE;
  receipt mutation_receipts%ROWTYPE;
  now_at timestamptz := transaction_timestamp();
  payload_hash text;
  snapshot jsonb;
  reviewer_availability text;
BEGIN
  actor := current_time_off_profile(target_organization_id);
  IF actor IS NULL THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
  SELECT membership.role::text, profile.display_name INTO actor_role, actor_label
  FROM memberships membership JOIN profiles profile ON profile.id = membership.profile_id
  WHERE membership.organization_id = target_organization_id AND membership.profile_id = actor AND membership.status = 'active';
  payload_hash := encode(digest(jsonb_build_object('startDate', start_date, 'endDate', end_date, 'leaveType', leave_type::text, 'reason', COALESCE(NULLIF(btrim(reason), ''), ''))::text, 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(target_organization_id::text || ':time_off.submit:' || retry_request_id::text, 0));
  SELECT * INTO receipt FROM mutation_receipts WHERE organization_id = target_organization_id AND operation = 'time_off.submit' AND request_id = retry_request_id;
  IF receipt.id IS NOT NULL THEN
    IF receipt.actor_profile_id <> actor OR receipt.payload_hash <> payload_hash THEN RAISE EXCEPTION 'TIME_OFF_RETRY_CONFLICT'; END IF;
    RETURN jsonb_build_object('result', receipt.result_snapshot, 'retryOutcome', 'replayed');
  END IF;
  SELECT * INTO employee FROM employees WHERE organization_id = target_organization_id AND profile_id = actor FOR UPDATE;
  IF employee.id IS NULL OR employee.status <> 'active' THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
  IF start_date < (now_at AT TIME ZONE (SELECT timezone FROM organizations WHERE id = target_organization_id))::date OR end_date < start_date OR end_date - start_date + 1 > 366 THEN RAISE EXCEPTION 'TIME_OFF_INVALID_DATE_RANGE'; END IF;
  IF start_date < employee.hire_date OR (employee.termination_date IS NOT NULL AND end_date >= employee.termination_date) THEN RAISE EXCEPTION 'TIME_OFF_OUTSIDE_EMPLOYMENT'; END IF;
  INSERT INTO leave_requests (organization_id, employee_id, start_date, end_date, leave_type, reason, status, submitted_at, version)
  VALUES (target_organization_id, employee.id, start_date, end_date, leave_type, NULLIF(btrim(reason), ''), 'submitted', now_at, 1)
  RETURNING * INTO request;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM employees manager_employee JOIN profiles manager_profile ON manager_profile.id = manager_employee.profile_id JOIN memberships manager_membership ON manager_membership.profile_id = manager_profile.id AND manager_membership.organization_id = target_organization_id WHERE manager_employee.id = employee.manager_id AND manager_employee.organization_id = target_organization_id AND manager_employee.status = 'active' AND manager_profile.status = 'active' AND manager_membership.status = 'active' AND manager_membership.role IN ('manager', 'administrator')) THEN 'manager_available' WHEN EXISTS (SELECT 1 FROM employees administrator_employee JOIN profiles administrator_profile ON administrator_profile.id = administrator_employee.profile_id JOIN memberships administrator_membership ON administrator_membership.profile_id = administrator_profile.id AND administrator_membership.organization_id = target_organization_id WHERE administrator_employee.organization_id = target_organization_id AND administrator_employee.profile_id <> actor AND administrator_employee.status = 'active' AND administrator_profile.status = 'active' AND administrator_membership.status = 'active' AND administrator_membership.role = 'administrator') THEN 'administrator_fallback' ELSE 'reviewer_needed' END INTO reviewer_availability;
  INSERT INTO leave_request_events (organization_id, leave_request_id, request_version, action, actor_profile_id, actor_role, organization_timezone, was_late, prior_status, resulting_status)
  SELECT target_organization_id, request.id, 1, 'submitted', actor, actor_role, organization.timezone, false, NULL, 'submitted' FROM organizations organization WHERE organization.id = target_organization_id;
  snapshot := jsonb_build_object('schemaVersion', 1, 'requestId', request.id, 'status', request.status, 'version', request.version, 'eventTime', now_at, 'actorProfileId', actor, 'actorDisplayLabel', actor_label, 'actorRole', actor_role, 'wasLate', false, 'reviewerAvailability', reviewer_availability);
  INSERT INTO mutation_receipts (organization_id, actor_profile_id, operation, request_id, payload_hash, result_entity_type, result_entity_id, result_version, result_snapshot)
  VALUES (target_organization_id, actor, 'time_off.submit', retry_request_id, payload_hash, 'leave_request', request.id, request.version, snapshot);
  INSERT INTO audit_events (organization_id, actor_profile_id, action, entity_type, entity_id, metadata)
  VALUES (target_organization_id, actor, 'time_off.submitted', 'leave_request', request.id, jsonb_build_object('requestId', request.id, 'employeeId', request.employee_id, 'resultingStatus', request.status, 'version', request.version, 'eventTime', now_at));
  RETURN jsonb_build_object('result', snapshot, 'retryOutcome', 'created');
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'TIME_OFF_OVERLAP'; END; $$;--> statement-breakpoint

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
  was_late boolean;
  payload_hash text;
  snapshot jsonb;
  operation_name text := 'time_off.' || action;
BEGIN
  actor := current_time_off_profile(target_organization_id);
  IF actor IS NULL THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
  IF action NOT IN ('cancel', 'approve', 'decline') THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
  SELECT membership.role::text, profile.display_name, employee.id INTO actor_role, actor_label, actor_employee_id
  FROM memberships membership JOIN profiles profile ON profile.id = membership.profile_id
  LEFT JOIN employees employee ON employee.profile_id = membership.profile_id AND employee.organization_id = membership.organization_id AND employee.status = 'active'
  WHERE membership.organization_id = target_organization_id AND membership.profile_id = actor AND membership.status = 'active';
  payload_hash := encode(digest(jsonb_build_object('requestId', target_request_id, 'expectedVersion', expected_version, 'action', action, 'decisionNote', COALESCE(NULLIF(btrim(decision_note), ''), ''), 'fallbackReason', COALESCE(NULLIF(btrim(fallback_reason), ''), ''))::text, 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(target_organization_id::text || ':' || operation_name || ':' || retry_request_id::text, 0));
  SELECT * INTO receipt FROM mutation_receipts WHERE organization_id = target_organization_id AND operation = operation_name AND request_id = retry_request_id;
  IF receipt.id IS NOT NULL THEN
    IF receipt.actor_profile_id <> actor OR receipt.payload_hash <> payload_hash THEN RAISE EXCEPTION 'TIME_OFF_RETRY_CONFLICT'; END IF;
    RETURN jsonb_build_object('result', receipt.result_snapshot, 'retryOutcome', 'replayed');
  END IF;
  SELECT leave_request_row.* INTO request FROM leave_requests AS leave_request_row WHERE leave_request_row.id = target_request_id AND leave_request_row.organization_id = target_organization_id FOR UPDATE;
  IF request.id IS NULL THEN RAISE EXCEPTION 'TIME_OFF_UNAVAILABLE'; END IF;
  IF request.version <> expected_version THEN RAISE EXCEPTION 'TIME_OFF_STALE_VERSION'; END IF;
  IF request.status <> 'submitted' THEN RAISE EXCEPTION 'TIME_OFF_INVALID_STATE'; END IF;
  IF action = 'cancel' THEN
    IF request.employee_id <> actor_employee_id THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
    next_status := 'cancelled';
  ELSE
    IF actor_role NOT IN ('manager', 'administrator') OR actor_employee_id = request.employee_id THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
    SELECT EXISTS (SELECT 1 FROM employees manager_employee JOIN profiles manager_profile ON manager_profile.id = manager_employee.profile_id JOIN memberships manager_membership ON manager_membership.profile_id = manager_profile.id AND manager_membership.organization_id = target_organization_id WHERE manager_employee.id = (SELECT manager_id FROM employees WHERE id = request.employee_id) AND manager_employee.organization_id = target_organization_id AND manager_employee.status = 'active' AND manager_profile.status = 'active' AND manager_membership.status = 'active' AND manager_membership.role IN ('manager', 'administrator')) INTO eligible_manager_exists;
    IF actor_role = 'manager' AND NOT EXISTS (SELECT 1 FROM employees WHERE id = request.employee_id AND manager_id = actor_employee_id) THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
    IF actor_role = 'administrator' AND eligible_manager_exists AND NOT EXISTS (SELECT 1 FROM employees WHERE id = request.employee_id AND manager_id = actor_employee_id) AND COALESCE(char_length(btrim(fallback_reason)), 0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'TIME_OFF_FALLBACK_REASON_REQUIRED'; END IF;
    IF action = 'approve' AND NOT EXISTS (SELECT 1 FROM employees WHERE id = request.employee_id AND status = 'active' AND (termination_date IS NULL OR termination_date > (now_at AT TIME ZONE (SELECT timezone FROM organizations WHERE id = target_organization_id))::date)) THEN RAISE EXCEPTION 'TIME_OFF_INACTIVE_EMPLOYEE'; END IF;
    IF action = 'decline' AND COALESCE(char_length(btrim(decision_note)), 0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'TIME_OFF_INVALID_NOTE'; END IF;
    IF action = 'approve' THEN next_status := 'approved'; ELSE next_status := 'declined'; END IF;
  END IF;
  was_late := (now_at AT TIME ZONE (SELECT timezone FROM organizations WHERE id = target_organization_id))::date > request.start_date;
  UPDATE leave_requests SET status = next_status, version = version + 1, reviewer_profile_id = CASE WHEN action <> 'cancel' THEN actor ELSE reviewer_profile_id END, decision_at = CASE WHEN action <> 'cancel' THEN now_at ELSE decision_at END, cancelled_at = CASE WHEN action = 'cancel' THEN now_at ELSE cancelled_at END, updated_at = now_at WHERE id = request.id;
  INSERT INTO leave_request_events (organization_id, leave_request_id, request_version, action, actor_profile_id, actor_role, organization_timezone, was_late, prior_status, resulting_status, decision_note, fallback_reason)
  SELECT target_organization_id, request.id, expected_version + 1, (CASE action WHEN 'approve' THEN 'approved' WHEN 'decline' THEN 'declined' ELSE 'cancelled' END)::leave_event_action, actor, actor_role, organization.timezone, was_late, request.status, next_status, NULLIF(btrim(decision_note), ''), NULLIF(btrim(fallback_reason), '') FROM organizations organization WHERE organization.id = target_organization_id;
  snapshot := jsonb_build_object('schemaVersion', 1, 'requestId', request.id, 'status', next_status, 'version', expected_version + 1, 'eventTime', now_at, 'actorProfileId', actor, 'actorDisplayLabel', actor_label, 'actorRole', actor_role, 'wasLate', was_late);
  INSERT INTO mutation_receipts (organization_id, actor_profile_id, operation, request_id, payload_hash, result_entity_type, result_entity_id, result_version, result_snapshot)
  VALUES (target_organization_id, actor, operation_name, retry_request_id, payload_hash, 'leave_request', request.id, expected_version + 1, snapshot);
  INSERT INTO audit_events (organization_id, actor_profile_id, action, entity_type, entity_id, metadata)
  VALUES (target_organization_id, actor, 'time_off.' || next_status::text, 'leave_request', request.id, jsonb_build_object('requestId', request.id, 'employeeId', request.employee_id, 'priorStatus', request.status, 'resultingStatus', next_status, 'version', expected_version + 1, 'eventTime', now_at, 'wasLate', was_late));
  RETURN jsonb_build_object('result', snapshot, 'retryOutcome', 'created');
END; $$;--> statement-breakpoint

REVOKE ALL ON FUNCTION submit_leave_request(uuid, date, date, leave_type, text, uuid), transition_leave_request(uuid, uuid, integer, text, text, text, uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION submit_leave_request(uuid, date, date, leave_type, text, uuid), transition_leave_request(uuid, uuid, integer, text, text, text, uuid) TO authenticated;
