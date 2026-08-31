DO $$
DECLARE definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.submit_leave_request(uuid, date, date, public.leave_type, text, uuid)'::pg_catalog.regprocedure) INTO definition;
  definition := pg_catalog.replace(definition, 'SELECT * INTO employee FROM public.employees employee WHERE employee.organization_id = target_organization_id AND employee.profile_id = actor AND employee.status = ''active'' FOR UPDATE;', 'SELECT * INTO employee FROM public.employees employee_row WHERE employee_row.organization_id = target_organization_id AND employee_row.profile_id = actor AND employee_row.status = ''active'' FOR UPDATE;');
  IF definition IS NULL THEN RAISE EXCEPTION 'TIME_OFF_SUBMIT_FUNCTION_MISSING'; END IF;
  EXECUTE definition;
END $$;
