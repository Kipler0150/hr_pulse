DO $$
DECLARE
  function_definition text;
BEGIN
  SELECT pg_get_functiondef('public.transition_leave_request(uuid,uuid,integer,text,text,text,uuid)'::regprocedure) INTO function_definition;
  function_definition := replace(function_definition, 'action::leave_event_action', '(CASE action WHEN ''approve'' THEN ''approved'' WHEN ''decline'' THEN ''declined'' ELSE ''cancelled'' END)::leave_event_action');
  EXECUTE function_definition;
END $$;--> statement-breakpoint
ALTER FUNCTION transition_leave_request(uuid, uuid, integer, text, text, text, uuid) SET search_path = public, extensions;
