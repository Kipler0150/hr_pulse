DO $$
DECLARE definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.transition_leave_request(uuid, uuid, integer, text, text, text, uuid)'::pg_catalog.regprocedure) INTO definition;
  definition := pg_catalog.replace(definition, 'SELECT * INTO request FROM public.leave_requests request_row WHERE request_row.id = target_request_id AND request_row.organization_id = target_organization_id FOR UPDATE;', 'PERFORM 1 FROM public.employees target_employee_lock WHERE target_employee_lock.id = (SELECT request_row.employee_id FROM public.leave_requests request_row WHERE request_row.id = target_request_id AND request_row.organization_id = target_organization_id) AND target_employee_lock.organization_id = target_organization_id FOR UPDATE; SELECT * INTO request FROM public.leave_requests request_row WHERE request_row.id = target_request_id AND request_row.organization_id = target_organization_id FOR UPDATE;');
  IF definition IS NULL THEN RAISE EXCEPTION 'TIME_OFF_TRANSITION_FUNCTION_MISSING'; END IF;
  EXECUTE definition;
END $$;--> statement-breakpoint

DO $$
DECLARE definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.verify_time_off_request_history()'::pg_catalog.regprocedure) INTO definition;
  definition := pg_catalog.replace(definition, 'IF request_row.id IS NULL OR request_row.status = ''draft'' THEN RETURN NULL; END IF;', 'IF request_row.id IS NULL OR request_row.status = ''draft'' THEN RETURN NULL; END IF; IF request_row.submitted_at IS NULL THEN RAISE EXCEPTION ''TIME_OFF_HISTORY_MISMATCH''; END IF; IF (SELECT count(*) FROM public.leave_request_events event WHERE event.leave_request_id = request_row.id AND event.request_version = 1 AND event.action = ''submitted'') <> 1 THEN RAISE EXCEPTION ''TIME_OFF_HISTORY_MISMATCH''; END IF; IF request_row.status <> ''submitted'' AND (SELECT count(*) FROM public.leave_request_events event WHERE event.leave_request_id = request_row.id AND event.request_version = 2) <> 1 THEN RAISE EXCEPTION ''TIME_OFF_HISTORY_MISMATCH''; END IF; IF EXISTS (SELECT 1 FROM public.leave_request_events event WHERE event.leave_request_id = request_row.id AND event.request_version NOT IN (1, 2)) THEN RAISE EXCEPTION ''TIME_OFF_HISTORY_MISMATCH''; END IF;');
  IF definition IS NULL THEN RAISE EXCEPTION 'TIME_OFF_HISTORY_FUNCTION_MISSING'; END IF;
  EXECUTE definition;
END $$;
