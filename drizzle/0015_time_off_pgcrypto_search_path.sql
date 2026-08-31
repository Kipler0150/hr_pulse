ALTER FUNCTION submit_leave_request(uuid, date, date, leave_type, text, uuid) SET search_path = public, extensions;--> statement-breakpoint
ALTER FUNCTION transition_leave_request(uuid, uuid, integer, text, text, text, uuid) SET search_path = public, extensions;
