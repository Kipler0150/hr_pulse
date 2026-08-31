CREATE OR REPLACE FUNCTION transition_leave_request(target_organization_id uuid, target_request_id uuid, expected_version integer, action text, decision_note text DEFAULT NULL, fallback_reason text DEFAULT NULL, retry_request_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; request leave_requests%ROWTYPE; actor_role text; actor_employee_id uuid; next_status leave_status; now_at timestamptz := transaction_timestamp(); eligible_manager_exists boolean;
BEGIN
 actor := current_time_off_profile(target_organization_id); IF actor IS NULL THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
 SELECT request.* INTO request FROM leave_requests request WHERE request.id = target_request_id AND request.organization_id = target_organization_id FOR UPDATE;
 IF request.id IS NULL THEN RAISE EXCEPTION 'TIME_OFF_UNAVAILABLE'; END IF;
 SELECT membership.role::text, employee.id INTO actor_role, actor_employee_id FROM memberships membership LEFT JOIN employees employee ON employee.profile_id = membership.profile_id AND employee.organization_id = membership.organization_id AND employee.status = 'active' WHERE membership.organization_id = target_organization_id AND membership.profile_id = actor AND membership.status = 'active';
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
 UPDATE leave_requests SET status = next_status, version = version + 1, reviewer_profile_id = CASE WHEN action <> 'cancel' THEN actor ELSE reviewer_profile_id END, decision_at = CASE WHEN action <> 'cancel' THEN now_at ELSE decision_at END, cancelled_at = CASE WHEN action = 'cancel' THEN now_at ELSE cancelled_at END, updated_at = now_at WHERE id = request.id;
 INSERT INTO leave_request_events (organization_id, leave_request_id, request_version, action, actor_profile_id, actor_role, organization_timezone, was_late, prior_status, resulting_status, decision_note, fallback_reason) SELECT target_organization_id, request.id, expected_version + 1, action::leave_event_action, actor, actor_role, organization.timezone, ((now_at AT TIME ZONE organization.timezone)::date > request.start_date), request.status, next_status, NULLIF(btrim(decision_note), ''), NULLIF(btrim(fallback_reason), '') FROM organizations organization WHERE organization.id = target_organization_id;
 RETURN jsonb_build_object('id', request.id, 'status', next_status, 'version', expected_version + 1, 'eventTime', now_at);
END; $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION transition_leave_request(uuid, uuid, integer, text, text, text, uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION transition_leave_request(uuid, uuid, integer, text, text, text, uuid) TO authenticated;--> statement-breakpoint
