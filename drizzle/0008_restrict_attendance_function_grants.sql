REVOKE ALL ON FUNCTION attendance_check_in(uuid) FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION attendance_clock_out(uuid) FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION attendance_day_context(uuid, date) FROM anon;
