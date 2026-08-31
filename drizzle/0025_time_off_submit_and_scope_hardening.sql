CREATE OR REPLACE FUNCTION public.user_organization_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $$
  SELECT membership.organization_id
  FROM public.memberships membership
  JOIN public.profiles profile ON profile.id = membership.profile_id
  JOIN public.organizations organization ON organization.id = membership.organization_id
  WHERE profile.auth_user_id = auth.uid()
    AND profile.status = 'active'
    AND membership.status = 'active'
    AND organization.status = 'active'
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.current_time_off_profile(target_organization_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT profile.id
  FROM public.profiles profile
  JOIN public.memberships membership ON membership.profile_id = profile.id
  JOIN public.organizations organization ON organization.id = membership.organization_id
  WHERE profile.auth_user_id = auth.uid()
    AND profile.status = 'active'
    AND membership.organization_id = target_organization_id
    AND membership.status = 'active'
    AND organization.status = 'active'
  LIMIT 1
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.submit_leave_request(target_organization_id uuid, start_date date, end_date date, leave_type public.leave_type, reason text, retry_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  actor_role text;
  actor_label text;
  employee public.employees%ROWTYPE;
  request public.leave_requests%ROWTYPE;
  receipt public.mutation_receipts%ROWTYPE;
  organization_timezone text;
  reviewer_availability text;
  payload_hash text;
  snapshot jsonb;
  now_at timestamptz := pg_catalog.transaction_timestamp();
BEGIN
  actor := public.current_time_off_profile(target_organization_id);
  IF actor IS NULL THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
  SELECT organization.timezone INTO organization_timezone FROM public.organizations organization WHERE organization.id = target_organization_id AND organization.status = 'active' FOR SHARE;
  IF organization_timezone IS NULL THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
  SELECT membership.role::text INTO actor_role FROM public.memberships membership WHERE membership.organization_id = target_organization_id AND membership.profile_id = actor AND membership.status = 'active' FOR SHARE;
  SELECT profile.display_name INTO actor_label FROM public.profiles profile WHERE profile.id = actor FOR SHARE;
  SELECT * INTO employee FROM public.employees employee WHERE employee.organization_id = target_organization_id AND employee.profile_id = actor AND employee.status = 'active' FOR UPDATE;
  IF employee.id IS NULL THEN RAISE EXCEPTION 'TIME_OFF_FORBIDDEN'; END IF;
  IF employee.manager_id IS NOT NULL THEN
    PERFORM 1 FROM public.employees manager_employee WHERE manager_employee.id = employee.manager_id AND manager_employee.organization_id = target_organization_id FOR UPDATE;
    PERFORM 1 FROM public.profiles manager_profile WHERE manager_profile.id = (SELECT profile_id FROM public.employees WHERE id = employee.manager_id) FOR SHARE;
    PERFORM 1 FROM public.memberships manager_membership WHERE manager_membership.organization_id = target_organization_id AND manager_membership.profile_id = (SELECT profile_id FROM public.employees WHERE id = employee.manager_id) FOR SHARE;
  END IF;
  payload_hash := encode(extensions.digest(jsonb_build_object('startDate', start_date, 'endDate', end_date, 'leaveType', leave_type::text, 'reason', COALESCE(NULLIF(pg_catalog.btrim(reason), ''), ''))::text, 'sha256'), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_organization_id::text || ':time_off.submit:' || retry_request_id::text, 0));
  SELECT * INTO receipt FROM public.mutation_receipts WHERE organization_id = target_organization_id AND operation = 'time_off.submit' AND request_id = retry_request_id;
  IF receipt.id IS NOT NULL THEN
    IF receipt.actor_profile_id <> actor OR receipt.payload_hash <> payload_hash THEN RAISE EXCEPTION 'TIME_OFF_RETRY_CONFLICT'; END IF;
    RETURN jsonb_build_object('result', receipt.result_snapshot, 'retryOutcome', 'replayed');
  END IF;
  IF start_date < (now_at AT TIME ZONE organization_timezone)::date OR end_date < start_date OR end_date - start_date + 1 > 366 THEN RAISE EXCEPTION 'TIME_OFF_INVALID_DATE_RANGE'; END IF;
  IF start_date < employee.hire_date OR (employee.termination_date IS NOT NULL AND end_date >= employee.termination_date) THEN RAISE EXCEPTION 'TIME_OFF_OUTSIDE_EMPLOYMENT'; END IF;
  INSERT INTO public.leave_requests (organization_id, employee_id, start_date, end_date, leave_type, reason, status, submitted_at, version) VALUES (target_organization_id, employee.id, start_date, end_date, leave_type, NULLIF(pg_catalog.btrim(reason), ''), 'submitted', now_at, 1) RETURNING * INTO request;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.employees manager_employee JOIN public.profiles manager_profile ON manager_profile.id = manager_employee.profile_id JOIN public.memberships manager_membership ON manager_membership.profile_id = manager_profile.id AND manager_membership.organization_id = target_organization_id WHERE manager_employee.id = employee.manager_id AND manager_employee.organization_id = target_organization_id AND manager_employee.status = 'active' AND manager_profile.status = 'active' AND manager_membership.status = 'active' AND manager_membership.role IN ('manager', 'administrator')) THEN 'manager_available' WHEN EXISTS (SELECT 1 FROM public.memberships administrator_membership JOIN public.profiles administrator_profile ON administrator_profile.id = administrator_membership.profile_id WHERE administrator_membership.organization_id = target_organization_id AND administrator_membership.status = 'active' AND administrator_membership.role = 'administrator' AND administrator_profile.status = 'active' AND administrator_profile.id <> actor) THEN 'administrator_fallback' ELSE 'reviewer_needed' END INTO reviewer_availability;
  INSERT INTO public.leave_request_events (organization_id, leave_request_id, request_version, action, actor_profile_id, actor_role, organization_timezone, was_late, prior_status, resulting_status) VALUES (target_organization_id, request.id, 1, 'submitted', actor, actor_role, organization_timezone, false, NULL, 'submitted');
  snapshot := jsonb_build_object('schemaVersion', 1, 'requestId', request.id, 'status', request.status, 'version', request.version, 'eventTime', now_at, 'actorProfileId', actor, 'actorDisplayLabel', actor_label, 'actorRole', actor_role, 'wasLate', false, 'reviewerAvailability', reviewer_availability);
  INSERT INTO public.mutation_receipts (organization_id, actor_profile_id, operation, request_id, payload_hash, result_entity_type, result_entity_id, result_version, result_snapshot) VALUES (target_organization_id, actor, 'time_off.submit', retry_request_id, payload_hash, 'leave_request', request.id, request.version, snapshot);
  INSERT INTO public.audit_events (organization_id, actor_profile_id, action, entity_type, entity_id, metadata) VALUES (target_organization_id, actor, 'time_off.submitted', 'leave_request', request.id, jsonb_build_object('requestId', request.id, 'employeeId', request.employee_id, 'resultingStatus', request.status, 'version', request.version, 'eventTime', now_at));
  RETURN jsonb_build_object('result', snapshot, 'retryOutcome', 'created');
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'TIME_OFF_OVERLAP';
END; $$;--> statement-breakpoint

DO $$
DECLARE definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.transition_leave_request(uuid, uuid, integer, text, text, text, uuid)'::pg_catalog.regprocedure) INTO definition;
  definition := pg_catalog.replace(definition, 'AND manager_membership.role IN (''manager'', ''administrator'')) INTO eligible_manager_exists;', 'AND manager_membership.role IN (''manager'', ''administrator'') AND manager_profile.id <> actor) INTO eligible_manager_exists;');
  EXECUTE definition;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.cancel_leave_request(target_organization_id uuid, target_request_id uuid, expected_version integer, retry_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT public.transition_leave_request(target_organization_id, target_request_id, expected_version, 'cancel', NULL, NULL, retry_request_id) $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.approve_leave_request(target_organization_id uuid, target_request_id uuid, expected_version integer, fallback_reason text, retry_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT public.transition_leave_request(target_organization_id, target_request_id, expected_version, 'approve', NULL, fallback_reason, retry_request_id) $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.decline_leave_request(target_organization_id uuid, target_request_id uuid, expected_version integer, decision_note text, fallback_reason text, retry_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT public.transition_leave_request(target_organization_id, target_request_id, expected_version, 'decline', decision_note, fallback_reason, retry_request_id) $$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.submit_leave_request(uuid, date, date, public.leave_type, text, uuid), public.cancel_leave_request(uuid, uuid, integer, uuid), public.approve_leave_request(uuid, uuid, integer, text, uuid), public.decline_leave_request(uuid, uuid, integer, text, text, uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.submit_leave_request(uuid, date, date, public.leave_type, text, uuid), public.cancel_leave_request(uuid, uuid, integer, uuid), public.approve_leave_request(uuid, uuid, integer, text, uuid), public.decline_leave_request(uuid, uuid, integer, text, text, uuid) TO authenticated;
