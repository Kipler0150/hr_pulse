CREATE OR REPLACE FUNCTION public.transition_leave_request(target_organization_id uuid, target_request_id uuid, expected_version integer, action text, decision_note text DEFAULT NULL, fallback_reason text DEFAULT NULL, retry_request_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  actor_role text;
  actor_label text;
  actor_employee_id uuid;
  target_employee public.employees%ROWTYPE;
  request public.leave_requests%ROWTYPE;
  receipt public.mutation_receipts%ROWTYPE;
  next_status public.leave_status;
  organization_timezone text;
  eligible_manager_exists boolean;
  authorized boolean := false;
  was_late boolean;
  payload_hash text;
  snapshot jsonb;
  operation_name text := 'time_off.' || action;
  now_at timestamptz := pg_catalog.transaction_timestamp();
BEGIN
  actor := public.current_time_off_profile(target_organization_id);
  IF actor IS NULL THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
  IF action NOT IN ('cancel', 'approve', 'decline') THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
  SELECT organization.timezone INTO organization_timezone FROM public.organizations organization WHERE organization.id = target_organization_id FOR SHARE;
  SELECT * INTO request FROM public.leave_requests request_row WHERE request_row.id = target_request_id AND request_row.organization_id = target_organization_id FOR UPDATE;
  IF request.id IS NULL THEN RAISE EXCEPTION 'TIME_OFF_UNAVAILABLE'; END IF;
  SELECT * INTO target_employee FROM public.employees employee WHERE employee.id = request.employee_id AND employee.organization_id = target_organization_id FOR UPDATE;
  PERFORM 1 FROM public.profiles profile WHERE profile.id = actor FOR SHARE;
  SELECT membership.role::text INTO actor_role FROM public.memberships membership WHERE membership.organization_id = target_organization_id AND membership.profile_id = actor AND membership.status = 'active' FOR SHARE;
  SELECT profile.display_name INTO actor_label FROM public.profiles profile WHERE profile.id = actor;
  SELECT employee.id INTO actor_employee_id FROM public.employees employee WHERE employee.profile_id = actor AND employee.organization_id = target_organization_id AND employee.status = 'active' FOR SHARE;
  IF target_employee.manager_id IS NOT NULL THEN
    PERFORM 1 FROM public.employees manager_employee WHERE manager_employee.id = target_employee.manager_id AND manager_employee.organization_id = target_organization_id FOR UPDATE;
    PERFORM 1 FROM public.profiles manager_profile WHERE manager_profile.id = (SELECT profile_id FROM public.employees WHERE id = target_employee.manager_id) FOR SHARE;
    PERFORM 1 FROM public.memberships manager_membership WHERE manager_membership.organization_id = target_organization_id AND manager_membership.profile_id = (SELECT profile_id FROM public.employees WHERE id = target_employee.manager_id) FOR SHARE;
  END IF;
  IF action = 'cancel' THEN
    authorized := actor_employee_id IS NOT NULL AND request.employee_id = actor_employee_id;
  ELSE
    authorized := actor_role IN ('manager', 'administrator') AND target_employee.profile_id IS DISTINCT FROM actor AND (actor_role = 'administrator' OR target_employee.manager_id = actor_employee_id);
  END IF;
  IF NOT authorized THEN RAISE EXCEPTION 'TIME_OFF_UNAVAILABLE'; END IF;
  payload_hash := encode(extensions.digest(jsonb_build_object('requestId', target_request_id, 'expectedVersion', expected_version, 'action', action, 'decisionNote', COALESCE(NULLIF(pg_catalog.btrim(decision_note), ''), ''), 'fallbackReason', COALESCE(NULLIF(pg_catalog.btrim(fallback_reason), ''), ''))::text, 'sha256'), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_organization_id::text || ':' || operation_name || ':' || retry_request_id::text, 0));
  SELECT * INTO receipt FROM public.mutation_receipts WHERE organization_id = target_organization_id AND operation = operation_name AND request_id = retry_request_id;
  IF receipt.id IS NOT NULL THEN
    IF receipt.actor_profile_id <> actor OR receipt.payload_hash <> payload_hash THEN RAISE EXCEPTION 'TIME_OFF_RETRY_CONFLICT'; END IF;
    RETURN jsonb_build_object('result', receipt.result_snapshot, 'retryOutcome', 'replayed');
  END IF;
  IF request.version <> expected_version THEN RAISE EXCEPTION 'TIME_OFF_STALE_VERSION'; END IF;
  IF request.status <> 'submitted' THEN RAISE EXCEPTION 'TIME_OFF_INVALID_STATE'; END IF;
  IF action = 'cancel' THEN next_status := 'cancelled';
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.employees manager_employee JOIN public.profiles manager_profile ON manager_profile.id = manager_employee.profile_id JOIN public.memberships manager_membership ON manager_membership.profile_id = manager_profile.id AND manager_membership.organization_id = target_organization_id WHERE manager_employee.id = target_employee.manager_id AND manager_employee.organization_id = target_organization_id AND manager_employee.status = 'active' AND manager_profile.status = 'active' AND manager_membership.status = 'active' AND manager_membership.role IN ('manager', 'administrator')) INTO eligible_manager_exists;
    IF actor_role = 'administrator' AND eligible_manager_exists AND target_employee.profile_id IS DISTINCT FROM actor AND COALESCE(pg_catalog.char_length(pg_catalog.btrim(fallback_reason)), 0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'TIME_OFF_FALLBACK_REASON_REQUIRED'; END IF;
    IF action = 'approve' AND (target_employee.status <> 'active' OR (target_employee.termination_date IS NOT NULL AND target_employee.termination_date < (now_at AT TIME ZONE organization_timezone)::date)) THEN RAISE EXCEPTION 'TIME_OFF_INACTIVE_EMPLOYEE'; END IF;
    IF action = 'decline' AND COALESCE(pg_catalog.char_length(pg_catalog.btrim(decision_note)), 0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'TIME_OFF_INVALID_NOTE'; END IF;
    IF action = 'approve' THEN next_status := 'approved'; ELSE next_status := 'declined'; END IF;
  END IF;
  was_late := (now_at AT TIME ZONE organization_timezone)::date > request.start_date;
  PERFORM pg_catalog.set_config('hr_pulse.time_off_mutation', 'on', true);
  UPDATE public.leave_requests SET status = next_status, version = version + 1, reviewer_profile_id = CASE WHEN action <> 'cancel' THEN actor ELSE reviewer_profile_id END, decision_at = CASE WHEN action <> 'cancel' THEN now_at ELSE decision_at END, cancelled_at = CASE WHEN action = 'cancel' THEN now_at ELSE cancelled_at END, updated_at = now_at WHERE id = request.id;
  INSERT INTO public.leave_request_events (organization_id, leave_request_id, request_version, action, actor_profile_id, actor_role, organization_timezone, was_late, prior_status, resulting_status, decision_note, fallback_reason) VALUES (target_organization_id, request.id, expected_version + 1, (CASE action WHEN 'approve' THEN 'approved' WHEN 'decline' THEN 'declined' ELSE 'cancelled' END)::public.leave_event_action, actor, actor_role, organization_timezone, was_late, request.status, next_status, NULLIF(pg_catalog.btrim(decision_note), ''), NULLIF(pg_catalog.btrim(fallback_reason), ''));
  snapshot := jsonb_build_object('schemaVersion', 1, 'requestId', request.id, 'status', next_status, 'version', expected_version + 1, 'eventTime', now_at, 'actorProfileId', actor, 'actorDisplayLabel', actor_label, 'actorRole', actor_role, 'wasLate', was_late);
  INSERT INTO public.mutation_receipts (organization_id, actor_profile_id, operation, request_id, payload_hash, result_entity_type, result_entity_id, result_version, result_snapshot) VALUES (target_organization_id, actor, operation_name, retry_request_id, payload_hash, 'leave_request', request.id, expected_version + 1, snapshot);
  INSERT INTO public.audit_events (organization_id, actor_profile_id, action, entity_type, entity_id, metadata) VALUES (target_organization_id, actor, 'time_off.' || next_status::text, 'leave_request', request.id, jsonb_build_object('requestId', request.id, 'employeeId', request.employee_id, 'priorStatus', request.status, 'resultingStatus', next_status, 'version', expected_version + 1, 'eventTime', now_at, 'wasLate', was_late));
  RETURN jsonb_build_object('result', snapshot, 'retryOutcome', 'created');
END; $$;

REVOKE ALL ON FUNCTION public.transition_leave_request(uuid, uuid, integer, text, text, text, uuid) FROM PUBLIC, anon;
--> statement-breakpoint
