CREATE INDEX "attendance_employee_clock_in_cursor_idx" ON "attendance_intervals" USING btree ("employee_id","clock_in" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_one_open_per_employee" ON "attendance_intervals" USING btree ("employee_id") WHERE "attendance_intervals"."status" = 'open';--> statement-breakpoint
ALTER TABLE "attendance_intervals" ADD CONSTRAINT "attendance_state_consistency_check" CHECK (("attendance_intervals"."status" = 'open' AND "attendance_intervals"."clock_out" IS NULL) OR ("attendance_intervals"."status" = 'completed' AND "attendance_intervals"."clock_out" IS NOT NULL));--> statement-breakpoint

CREATE OR REPLACE FUNCTION protect_attendance_interval() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'attendance intervals cannot be deleted';
	END IF;
	IF OLD.status::text = 'completed' THEN
		RAISE EXCEPTION 'completed attendance intervals are immutable';
	END IF;
	IF NEW.id <> OLD.id
		OR NEW.employee_id <> OLD.employee_id
		OR NEW.clock_in <> OLD.clock_in
		OR NEW.source <> OLD.source
		OR NEW.created_at <> OLD.created_at
		OR NEW.status::text <> 'completed'
		OR NEW.clock_out IS NULL
		OR NEW.clock_out <= OLD.clock_in THEN
		RAISE EXCEPTION 'only an open attendance interval may be completed';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER attendance_intervals_immutable
	BEFORE UPDATE OR DELETE ON attendance_intervals
	FOR EACH ROW EXECUTE FUNCTION protect_attendance_interval();--> statement-breakpoint

CREATE OR REPLACE FUNCTION protect_audit_event() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'audit events are append only';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
	BEFORE UPDATE OR DELETE ON audit_events
	FOR EACH ROW EXECUTE FUNCTION protect_audit_event();--> statement-breakpoint

DROP POLICY IF EXISTS "organization_members_can_read_attendance" ON "attendance_intervals";--> statement-breakpoint
CREATE POLICY "employees_can_read_own_attendance" ON "attendance_intervals"
	FOR SELECT USING (
		EXISTS (
			SELECT 1
			FROM employees employee
			JOIN profiles profile ON profile.id = employee.profile_id
			JOIN memberships membership
				ON membership.profile_id = profile.id
				AND membership.organization_id = employee.organization_id
			JOIN organizations organization ON organization.id = membership.organization_id
			WHERE employee.id = attendance_intervals.employee_id
				AND profile.auth_user_id = auth.uid()
				AND profile.status::text = 'active'
				AND employee.status::text = 'active'
				AND membership.status::text = 'active'
				AND membership.role::text = 'employee'
				AND organization.status::text = 'active'
		)
	);--> statement-breakpoint
CREATE POLICY "attendance_reviewers_can_read_organization_attendance" ON "attendance_intervals"
	FOR SELECT USING (
		EXISTS (
			SELECT 1
			FROM employees employee
			JOIN memberships membership ON membership.organization_id = employee.organization_id
			JOIN profiles profile ON profile.id = membership.profile_id
			JOIN organizations organization ON organization.id = membership.organization_id
			WHERE employee.id = attendance_intervals.employee_id
				AND profile.auth_user_id = auth.uid()
				AND profile.status::text = 'active'
				AND membership.status::text = 'active'
				AND membership.role::text IN ('manager', 'administrator')
				AND organization.status::text = 'active'
		)
	);--> statement-breakpoint

CREATE OR REPLACE FUNCTION attendance_check_in(target_organization_id uuid)
RETURNS TABLE (attendance_id uuid, attendance_status attendance_status, clock_in_at timestamptz, clock_out_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
	actor_profile_id uuid;
	attendance_employee_id uuid;
	created_interval attendance_intervals%ROWTYPE;
	violated_constraint text;
BEGIN
	SELECT profile.id INTO actor_profile_id
	FROM profiles profile
	JOIN memberships membership ON membership.profile_id = profile.id
	JOIN organizations organization ON organization.id = membership.organization_id
	WHERE profile.auth_user_id = auth.uid()
		AND profile.status::text = 'active'
		AND membership.organization_id = target_organization_id
		AND membership.status::text = 'active'
		AND membership.role::text = 'employee'
		AND organization.status::text = 'active';
	IF actor_profile_id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTENDANCE_FORBIDDEN';
	END IF;

	SELECT employee.id INTO attendance_employee_id
	FROM employees employee
	WHERE employee.organization_id = target_organization_id
		AND employee.profile_id = actor_profile_id
		AND employee.status::text = 'active';
	IF attendance_employee_id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EMPLOYEE_NOT_ELIGIBLE';
	END IF;

	IF EXISTS (
		SELECT 1 FROM attendance_intervals interval
		WHERE interval.employee_id = attendance_employee_id AND interval.status::text = 'open'
	) THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ALREADY_CHECKED_IN';
	END IF;

	BEGIN
		INSERT INTO attendance_intervals (employee_id, clock_in, source, status, created_at, updated_at)
		VALUES (attendance_employee_id, transaction_timestamp(), 'employee', 'open', transaction_timestamp(), transaction_timestamp())
		RETURNING * INTO created_interval;
	EXCEPTION WHEN unique_violation THEN
		GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
		IF violated_constraint = 'attendance_one_open_per_employee' THEN
			RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ALREADY_CHECKED_IN';
		END IF;
		RAISE;
	END;

	INSERT INTO audit_events (organization_id, actor_profile_id, action, entity_type, entity_id, metadata)
	VALUES (
		target_organization_id,
		actor_profile_id,
		'attendance.checked_in',
		'attendance_interval',
		created_interval.id,
		jsonb_build_object('organization_id', target_organization_id, 'employee_id', attendance_employee_id, 'interval_id', created_interval.id, 'source', 'employee')
	);

	RETURN QUERY SELECT created_interval.id, created_interval.status, created_interval.clock_in, created_interval.clock_out;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION attendance_clock_out(target_organization_id uuid)
RETURNS TABLE (attendance_id uuid, attendance_status attendance_status, clock_in_at timestamptz, clock_out_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
	actor_profile_id uuid;
	attendance_employee_id uuid;
	completed_interval attendance_intervals%ROWTYPE;
BEGIN
	SELECT profile.id INTO actor_profile_id
	FROM profiles profile
	JOIN memberships membership ON membership.profile_id = profile.id
	JOIN organizations organization ON organization.id = membership.organization_id
	WHERE profile.auth_user_id = auth.uid()
		AND profile.status::text = 'active'
		AND membership.organization_id = target_organization_id
		AND membership.status::text = 'active'
		AND membership.role::text = 'employee'
		AND organization.status::text = 'active';
	IF actor_profile_id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTENDANCE_FORBIDDEN';
	END IF;

	SELECT employee.id INTO attendance_employee_id
	FROM employees employee
	WHERE employee.organization_id = target_organization_id
		AND employee.profile_id = actor_profile_id
		AND employee.status::text = 'active';
	IF attendance_employee_id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EMPLOYEE_NOT_ELIGIBLE';
	END IF;

	SELECT interval.* INTO completed_interval
	FROM attendance_intervals interval
	WHERE interval.employee_id = attendance_employee_id AND interval.status::text = 'open'
	FOR UPDATE;
	IF completed_interval.id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_CHECKED_IN';
	END IF;

	UPDATE attendance_intervals interval
	SET clock_out = transaction_timestamp(), status = 'completed', updated_at = transaction_timestamp()
	WHERE interval.id = completed_interval.id
	RETURNING interval.* INTO completed_interval;

	INSERT INTO audit_events (organization_id, actor_profile_id, action, entity_type, entity_id, metadata)
	VALUES (
		target_organization_id,
		actor_profile_id,
		'attendance.clocked_out',
		'attendance_interval',
		completed_interval.id,
		jsonb_build_object('organization_id', target_organization_id, 'employee_id', attendance_employee_id, 'interval_id', completed_interval.id, 'source', 'employee')
	);

	RETURN QUERY SELECT completed_interval.id, completed_interval.status, completed_interval.clock_in, completed_interval.clock_out;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION attendance_day_context(target_organization_id uuid, requested_date date DEFAULT NULL)
RETURNS TABLE (organization_timezone text, local_date date, utc_start timestamptz, utc_end timestamptz)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
	resolved_timezone text;
	resolved_date date;
BEGIN
	SELECT organization.timezone INTO resolved_timezone
	FROM organizations organization
	JOIN memberships membership ON membership.organization_id = organization.id
	JOIN profiles profile ON profile.id = membership.profile_id
	WHERE organization.id = target_organization_id
		AND organization.status::text = 'active'
		AND membership.status::text = 'active'
		AND profile.status::text = 'active'
		AND profile.auth_user_id = auth.uid();
	IF resolved_timezone IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTENDANCE_FORBIDDEN';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = resolved_timezone) THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTENDANCE_INVALID_TIMEZONE';
	END IF;

	resolved_date := COALESCE(requested_date, (transaction_timestamp() AT TIME ZONE resolved_timezone)::date);
	IF resolved_date > (transaction_timestamp() AT TIME ZONE resolved_timezone)::date THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FUTURE_REVIEW_DATE';
	END IF;

	RETURN QUERY SELECT
		resolved_timezone,
		resolved_date,
		resolved_date::timestamp AT TIME ZONE resolved_timezone,
		(resolved_date + 1)::timestamp AT TIME ZONE resolved_timezone;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION attendance_check_in(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION attendance_clock_out(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION attendance_day_context(uuid, date) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION attendance_check_in(uuid) FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION attendance_clock_out(uuid) FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION attendance_day_context(uuid, date) FROM anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION attendance_check_in(uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION attendance_clock_out(uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION attendance_day_context(uuid, date) TO authenticated;
