CREATE TYPE "public"."earning_type" AS ENUM('overtime');--> statement-breakpoint
CREATE TYPE "public"."timecard_event_action" AS ENUM('prepared', 'submitted', 'returned', 'resubmitted', 'approved', 'configuration_returned');--> statement-breakpoint
CREATE TYPE "public"."timecard_status" AS ENUM('draft', 'submitted', 'returned', 'approved');--> statement-breakpoint
CREATE TABLE "attendance_interval_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"attendance_interval_id" uuid NOT NULL,
	"actor_profile_id" uuid NOT NULL,
	"corrected_clock_in" timestamp with time zone NOT NULL,
	"corrected_clock_out" timestamp with time zone NOT NULL,
	"reason" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_corrections_clock_order_check" CHECK ("attendance_interval_corrections"."corrected_clock_out" > "attendance_interval_corrections"."corrected_clock_in"),
	CONSTRAINT "attendance_corrections_reason_length_check" CHECK (char_length("attendance_interval_corrections"."reason") BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "mutation_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_profile_id" uuid NOT NULL,
	"operation" varchar(100) NOT NULL,
	"request_id" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"result_entity_type" varchar(100) NOT NULL,
	"result_entity_id" uuid NOT NULL,
	"result_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mutation_receipts_result_version_positive" CHECK ("mutation_receipts"."result_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "overtime_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"effective_from" date NOT NULL,
	"daily_threshold_minutes" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overtime_policies_version_positive" CHECK ("overtime_policies"."version" > 0),
	CONSTRAINT "overtime_policies_threshold_range" CHECK ("overtime_policies"."daily_threshold_minutes" BETWEEN 1 AND 1440)
);
--> statement-breakpoint
CREATE TABLE "payout_earning_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"timecard_id" uuid NOT NULL,
	"earning_type" "earning_type" NOT NULL,
	"payable_minutes" integer NOT NULL,
	"base_gross_amount_minor" bigint NOT NULL,
	"standard_period_minutes" integer,
	"multiplier_basis_points" integer,
	"currency" varchar(3) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "payout_earning_lines_values_nonnegative" CHECK ("payout_earning_lines"."payable_minutes" >= 0 AND "payout_earning_lines"."base_gross_amount_minor" > 0 AND "payout_earning_lines"."amount_minor" >= 0 AND "payout_earning_lines"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "timecard_day_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timecard_day_id" uuid NOT NULL,
	"attendance_interval_id" uuid NOT NULL,
	"attendance_interval_correction_id" uuid,
	"clock_in_snapshot" timestamp with time zone NOT NULL,
	"clock_out_snapshot" timestamp with time zone NOT NULL,
	"allocated_seconds" integer NOT NULL,
	CONSTRAINT "timecard_day_sources_duration_positive" CHECK ("timecard_day_sources"."allocated_seconds" > 0),
	CONSTRAINT "timecard_day_sources_clock_order_check" CHECK ("timecard_day_sources"."clock_out_snapshot" > "timecard_day_sources"."clock_in_snapshot")
);
--> statement-breakpoint
CREATE TABLE "timecard_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timecard_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"worked_seconds" integer DEFAULT 0 NOT NULL,
	"regular_seconds" integer DEFAULT 0 NOT NULL,
	"overtime_seconds" integer DEFAULT 0 NOT NULL,
	"payable_overtime_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_amount_minor" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) NOT NULL,
	CONSTRAINT "timecard_days_duration_nonnegative" CHECK ("timecard_days"."worked_seconds" >= 0 AND "timecard_days"."regular_seconds" >= 0 AND "timecard_days"."overtime_seconds" >= 0 AND "timecard_days"."payable_overtime_minutes" >= 0),
	CONSTRAINT "timecard_days_duration_reconcile" CHECK ("timecard_days"."worked_seconds" = "timecard_days"."regular_seconds" + "timecard_days"."overtime_seconds"),
	CONSTRAINT "timecard_days_amount_nonnegative" CHECK ("timecard_days"."overtime_amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "timecard_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"timecard_id" uuid NOT NULL,
	"action" timecard_event_action NOT NULL,
	"actor_profile_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prior_status" timecard_status,
	"resulting_status" timecard_status NOT NULL,
	"note" varchar(500),
	"reason_code" varchar(100),
	CONSTRAINT "timecard_events_note_length_check" CHECK ("timecard_events"."note" IS NULL OR char_length("timecard_events"."note") BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "timecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"payroll_schedule_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" timecard_status DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"timezone" varchar(100) NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"overtime_policy_id" uuid NOT NULL,
	"pay_setting_id" uuid NOT NULL,
	"policy_version" integer NOT NULL,
	"daily_threshold_minutes" integer NOT NULL,
	"policy_enabled" boolean NOT NULL,
	"overtime_eligible" boolean NOT NULL,
	"standard_period_minutes" integer,
	"overtime_multiplier_basis_points" integer,
	"base_gross_amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"worked_seconds" integer DEFAULT 0 NOT NULL,
	"regular_seconds" integer DEFAULT 0 NOT NULL,
	"overtime_seconds" integer DEFAULT 0 NOT NULL,
	"payable_overtime_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_amount_minor" bigint DEFAULT 0 NOT NULL,
	"zero_hours_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timecards_period_order_check" CHECK ("timecards"."period_end" >= "timecards"."period_start"),
	CONSTRAINT "timecards_version_positive" CHECK ("timecards"."version" > 0),
	CONSTRAINT "timecards_threshold_range" CHECK ("timecards"."daily_threshold_minutes" BETWEEN 1 AND 1440),
	CONSTRAINT "timecards_duration_nonnegative" CHECK ("timecards"."worked_seconds" >= 0 AND "timecards"."regular_seconds" >= 0 AND "timecards"."overtime_seconds" >= 0 AND "timecards"."payable_overtime_minutes" >= 0),
	CONSTRAINT "timecards_duration_reconcile" CHECK ("timecards"."worked_seconds" = "timecards"."regular_seconds" + "timecards"."overtime_seconds"),
	CONSTRAINT "timecards_amount_nonnegative" CHECK ("timecards"."base_gross_amount_minor" > 0 AND "timecards"."overtime_amount_minor" >= 0),
	CONSTRAINT "timecards_overtime_inputs_check" CHECK (("timecards"."policy_enabled" = false OR "timecards"."overtime_eligible" = false) OR ("timecards"."standard_period_minutes" > 0 AND "timecards"."overtime_multiplier_basis_points" BETWEEN 10000 AND 50000)),
	CONSTRAINT "timecards_approval_state_check" CHECK (("timecards"."status" = 'approved' AND "timecards"."approved_at" IS NOT NULL AND "timecards"."submitted_at" IS NOT NULL) OR ("timecards"."status" <> 'approved' AND "timecards"."approved_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "pay_settings" ADD COLUMN "overtime_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_settings" ADD COLUMN "standard_period_minutes" integer;--> statement-breakpoint
ALTER TABLE "pay_settings" ADD COLUMN "overtime_multiplier_basis_points" integer;--> statement-breakpoint
ALTER TABLE "attendance_interval_corrections" ADD CONSTRAINT "attendance_interval_corrections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_interval_corrections" ADD CONSTRAINT "attendance_interval_corrections_attendance_interval_id_attendance_intervals_id_fk" FOREIGN KEY ("attendance_interval_id") REFERENCES "public"."attendance_intervals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_interval_corrections" ADD CONSTRAINT "attendance_interval_corrections_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutation_receipts" ADD CONSTRAINT "mutation_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutation_receipts" ADD CONSTRAINT "mutation_receipts_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_policies" ADD CONSTRAINT "overtime_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_earning_lines" ADD CONSTRAINT "payout_earning_lines_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_earning_lines" ADD CONSTRAINT "payout_earning_lines_timecard_id_timecards_id_fk" FOREIGN KEY ("timecard_id") REFERENCES "public"."timecards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_day_sources" ADD CONSTRAINT "timecard_day_sources_timecard_day_id_timecard_days_id_fk" FOREIGN KEY ("timecard_day_id") REFERENCES "public"."timecard_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_day_sources" ADD CONSTRAINT "timecard_day_sources_attendance_interval_id_attendance_intervals_id_fk" FOREIGN KEY ("attendance_interval_id") REFERENCES "public"."attendance_intervals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_day_sources" ADD CONSTRAINT "timecard_day_sources_attendance_interval_correction_id_attendance_interval_corrections_id_fk" FOREIGN KEY ("attendance_interval_correction_id") REFERENCES "public"."attendance_interval_corrections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_days" ADD CONSTRAINT "timecard_days_timecard_id_timecards_id_fk" FOREIGN KEY ("timecard_id") REFERENCES "public"."timecards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_events" ADD CONSTRAINT "timecard_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_events" ADD CONSTRAINT "timecard_events_timecard_id_timecards_id_fk" FOREIGN KEY ("timecard_id") REFERENCES "public"."timecards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_events" ADD CONSTRAINT "timecard_events_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecards" ADD CONSTRAINT "timecards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecards" ADD CONSTRAINT "timecards_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecards" ADD CONSTRAINT "timecards_payroll_schedule_id_payroll_schedules_id_fk" FOREIGN KEY ("payroll_schedule_id") REFERENCES "public"."payroll_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecards" ADD CONSTRAINT "timecards_overtime_policy_id_overtime_policies_id_fk" FOREIGN KEY ("overtime_policy_id") REFERENCES "public"."overtime_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecards" ADD CONSTRAINT "timecards_pay_setting_id_pay_settings_id_fk" FOREIGN KEY ("pay_setting_id") REFERENCES "public"."pay_settings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_corrections_interval_created_idx" ON "attendance_interval_corrections" USING btree ("attendance_interval_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "attendance_corrections_organization_idx" ON "attendance_interval_corrections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mutation_receipts_operation_request_unique" ON "mutation_receipts" USING btree ("organization_id","operation","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "overtime_policies_organization_start_unique" ON "overtime_policies" USING btree ("organization_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "overtime_policies_organization_version_unique" ON "overtime_policies" USING btree ("organization_id","version");--> statement-breakpoint
CREATE INDEX "overtime_policies_organization_start_idx" ON "overtime_policies" USING btree ("organization_id","effective_from" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "payout_earning_lines_payout_type_unique" ON "payout_earning_lines" USING btree ("payout_id","earning_type");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_earning_lines_timecard_unique" ON "payout_earning_lines" USING btree ("timecard_id");--> statement-breakpoint
CREATE INDEX "payout_earning_lines_payout_order_idx" ON "payout_earning_lines" USING btree ("payout_id","display_order");--> statement-breakpoint
CREATE INDEX "timecard_day_sources_day_idx" ON "timecard_day_sources" USING btree ("timecard_day_id");--> statement-breakpoint
CREATE INDEX "timecard_day_sources_interval_idx" ON "timecard_day_sources" USING btree ("attendance_interval_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timecard_days_card_date_unique" ON "timecard_days" USING btree ("timecard_id","local_date");--> statement-breakpoint
CREATE INDEX "timecard_days_card_date_idx" ON "timecard_days" USING btree ("timecard_id","local_date");--> statement-breakpoint
CREATE INDEX "timecard_events_card_order_idx" ON "timecard_events" USING btree ("timecard_id","occurred_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "timecards_employee_period_unique" ON "timecards" USING btree ("organization_id","employee_id","payroll_schedule_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "timecards_id_organization_unique" ON "timecards" USING btree ("id","organization_id");--> statement-breakpoint
CREATE INDEX "timecards_employee_period_idx" ON "timecards" USING btree ("employee_id","period_end" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "timecards_organization_status_period_idx" ON "timecards" USING btree ("organization_id","status","period_end" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "pay_settings" ADD CONSTRAINT "pay_settings_overtime_inputs_check" CHECK (("pay_settings"."overtime_eligible" = false AND "pay_settings"."standard_period_minutes" IS NULL AND "pay_settings"."overtime_multiplier_basis_points" IS NULL) OR ("pay_settings"."overtime_eligible" = true AND "pay_settings"."standard_period_minutes" > 0 AND "pay_settings"."overtime_multiplier_basis_points" BETWEEN 10000 AND 50000));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_overtime_relationships() RETURNS trigger AS $$
DECLARE
	resolved_organization_id uuid;
	resolved_employee_id uuid;
	resolved_currency text;
BEGIN
	IF TG_TABLE_NAME = 'timecards' THEN
		SELECT employee.organization_id INTO resolved_organization_id FROM employees employee WHERE employee.id = NEW.employee_id;
		IF resolved_organization_id IS DISTINCT FROM NEW.organization_id
			OR NOT EXISTS (SELECT 1 FROM payroll_schedules schedule WHERE schedule.id = NEW.payroll_schedule_id AND schedule.organization_id = NEW.organization_id)
			OR NOT EXISTS (SELECT 1 FROM overtime_policies policy WHERE policy.id = NEW.overtime_policy_id AND policy.organization_id = NEW.organization_id)
			OR NOT EXISTS (SELECT 1 FROM pay_settings setting WHERE setting.id = NEW.pay_setting_id AND setting.employee_id = NEW.employee_id AND setting.currency = NEW.currency) THEN
			RAISE EXCEPTION 'timecard relationships must share organization, employee, and currency';
		END IF;
	ELSIF TG_TABLE_NAME = 'attendance_interval_corrections' THEN
		SELECT employee.organization_id INTO resolved_organization_id
		FROM attendance_intervals interval JOIN employees employee ON employee.id = interval.employee_id
		WHERE interval.id = NEW.attendance_interval_id AND interval.status::text = 'completed';
		IF resolved_organization_id IS DISTINCT FROM NEW.organization_id THEN
			RAISE EXCEPTION 'attendance correction must reference a completed interval in its organization';
		END IF;
	ELSIF TG_TABLE_NAME = 'timecard_events' THEN
		IF NOT EXISTS (SELECT 1 FROM timecards card WHERE card.id = NEW.timecard_id AND card.organization_id = NEW.organization_id) THEN
			RAISE EXCEPTION 'timecard event must share its timecard organization';
		END IF;
	ELSIF TG_TABLE_NAME = 'timecard_day_sources' THEN
		IF NEW.attendance_interval_correction_id IS NOT NULL AND NOT EXISTS (
			SELECT 1 FROM attendance_interval_corrections correction
			WHERE correction.id = NEW.attendance_interval_correction_id AND correction.attendance_interval_id = NEW.attendance_interval_id
		) THEN
			RAISE EXCEPTION 'timecard source correction must belong to its interval';
		END IF;
	ELSIF TG_TABLE_NAME = 'payout_earning_lines' THEN
		SELECT payout.employee_id, payout.currency INTO resolved_employee_id, resolved_currency FROM payouts payout WHERE payout.id = NEW.payout_id;
		IF NOT EXISTS (
			SELECT 1 FROM timecards card
			WHERE card.id = NEW.timecard_id AND card.employee_id = resolved_employee_id AND card.currency = resolved_currency AND card.currency = NEW.currency AND card.status::text = 'approved'
		) THEN
			RAISE EXCEPTION 'overtime earning must use an approved timecard for the payout employee and currency';
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;--> statement-breakpoint
CREATE TRIGGER validate_timecard_relationships BEFORE INSERT OR UPDATE ON timecards FOR EACH ROW EXECUTE FUNCTION validate_overtime_relationships();--> statement-breakpoint
CREATE TRIGGER validate_correction_relationships BEFORE INSERT OR UPDATE ON attendance_interval_corrections FOR EACH ROW EXECUTE FUNCTION validate_overtime_relationships();--> statement-breakpoint
CREATE TRIGGER validate_timecard_event_relationships BEFORE INSERT OR UPDATE ON timecard_events FOR EACH ROW EXECUTE FUNCTION validate_overtime_relationships();--> statement-breakpoint
CREATE TRIGGER validate_timecard_source_relationships BEFORE INSERT OR UPDATE ON timecard_day_sources FOR EACH ROW EXECUTE FUNCTION validate_overtime_relationships();--> statement-breakpoint
CREATE TRIGGER validate_payout_earning_relationships BEFORE INSERT OR UPDATE ON payout_earning_lines FOR EACH ROW EXECUTE FUNCTION validate_overtime_relationships();--> statement-breakpoint

CREATE OR REPLACE FUNCTION protect_overtime_append_only() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION '% is append only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER overtime_policies_append_only BEFORE UPDATE OR DELETE ON overtime_policies FOR EACH ROW EXECUTE FUNCTION protect_overtime_append_only();--> statement-breakpoint
CREATE TRIGGER attendance_corrections_append_only BEFORE UPDATE OR DELETE ON attendance_interval_corrections FOR EACH ROW EXECUTE FUNCTION protect_overtime_append_only();--> statement-breakpoint
CREATE TRIGGER timecard_events_append_only BEFORE UPDATE OR DELETE ON timecard_events FOR EACH ROW EXECUTE FUNCTION protect_overtime_append_only();--> statement-breakpoint
CREATE TRIGGER mutation_receipts_append_only BEFORE UPDATE OR DELETE ON mutation_receipts FOR EACH ROW EXECUTE FUNCTION protect_overtime_append_only();--> statement-breakpoint
CREATE TRIGGER payout_earning_lines_append_only BEFORE UPDATE OR DELETE ON payout_earning_lines FOR EACH ROW EXECUTE FUNCTION protect_overtime_append_only();--> statement-breakpoint

CREATE OR REPLACE FUNCTION protect_timecard_snapshot() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'timecards cannot be deleted';
	END IF;
	IF OLD.status::text = 'approved' THEN
		RAISE EXCEPTION 'approved timecards are immutable';
	END IF;
	IF OLD.status::text = 'submitted' AND (
		NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
		OR NEW.payroll_schedule_id IS DISTINCT FROM OLD.payroll_schedule_id OR NEW.period_start IS DISTINCT FROM OLD.period_start
		OR NEW.period_end IS DISTINCT FROM OLD.period_end OR NEW.timezone IS DISTINCT FROM OLD.timezone
		OR NEW.overtime_policy_id IS DISTINCT FROM OLD.overtime_policy_id OR NEW.pay_setting_id IS DISTINCT FROM OLD.pay_setting_id
		OR NEW.policy_version IS DISTINCT FROM OLD.policy_version OR NEW.daily_threshold_minutes IS DISTINCT FROM OLD.daily_threshold_minutes
		OR NEW.policy_enabled IS DISTINCT FROM OLD.policy_enabled OR NEW.overtime_eligible IS DISTINCT FROM OLD.overtime_eligible
		OR NEW.standard_period_minutes IS DISTINCT FROM OLD.standard_period_minutes OR NEW.overtime_multiplier_basis_points IS DISTINCT FROM OLD.overtime_multiplier_basis_points
		OR NEW.base_gross_amount_minor IS DISTINCT FROM OLD.base_gross_amount_minor OR NEW.currency IS DISTINCT FROM OLD.currency
		OR NEW.worked_seconds IS DISTINCT FROM OLD.worked_seconds OR NEW.regular_seconds IS DISTINCT FROM OLD.regular_seconds
		OR NEW.overtime_seconds IS DISTINCT FROM OLD.overtime_seconds OR NEW.payable_overtime_minutes IS DISTINCT FROM OLD.payable_overtime_minutes
		OR NEW.overtime_amount_minor IS DISTINCT FROM OLD.overtime_amount_minor OR NEW.zero_hours_confirmed IS DISTINCT FROM OLD.zero_hours_confirmed
	) THEN
		RAISE EXCEPTION 'submitted timecard snapshots are immutable';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER timecards_snapshot_immutable BEFORE UPDATE OR DELETE ON timecards FOR EACH ROW EXECUTE FUNCTION protect_timecard_snapshot();--> statement-breakpoint

CREATE OR REPLACE FUNCTION protect_timecard_child_snapshot() RETURNS trigger AS $$
DECLARE
	parent_timecard_id uuid;
	parent_status text;
BEGIN
	IF TG_TABLE_NAME = 'timecard_days' THEN
		parent_timecard_id := COALESCE(OLD.timecard_id, NEW.timecard_id);
	ELSE
		SELECT day.timecard_id INTO parent_timecard_id FROM timecard_days day WHERE day.id = COALESCE(OLD.timecard_day_id, NEW.timecard_day_id);
	END IF;
	SELECT card.status::text INTO parent_status FROM timecards card WHERE card.id = parent_timecard_id;
	IF parent_status IN ('submitted', 'approved') THEN
		RAISE EXCEPTION 'submitted and approved timecard evidence is immutable';
	END IF;
	RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER timecard_days_snapshot_immutable BEFORE UPDATE OR DELETE ON timecard_days FOR EACH ROW EXECUTE FUNCTION protect_timecard_child_snapshot();--> statement-breakpoint
CREATE TRIGGER timecard_sources_snapshot_immutable BEFORE UPDATE OR DELETE ON timecard_day_sources FOR EACH ROW EXECUTE FUNCTION protect_timecard_child_snapshot();--> statement-breakpoint

ALTER TABLE overtime_policies ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE attendance_interval_corrections ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE timecards ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE timecard_days ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE timecard_day_sources ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE timecard_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE payout_earning_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE mutation_receipts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE OR REPLACE FUNCTION active_timecard_member(target_organization_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
	SELECT EXISTS (
		SELECT 1 FROM profiles profile
		JOIN memberships membership ON membership.profile_id = profile.id
		JOIN organizations organization ON organization.id = membership.organization_id
		WHERE profile.auth_user_id = auth.uid() AND profile.status::text = 'active'
			AND membership.organization_id = target_organization_id AND membership.status::text = 'active'
			AND organization.status::text = 'active'
	);
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION active_timecard_member(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION active_timecard_member(uuid) TO authenticated;--> statement-breakpoint

CREATE POLICY "members_can_read_overtime_policies" ON overtime_policies FOR SELECT USING (active_timecard_member(organization_id));--> statement-breakpoint
CREATE POLICY "authorized_people_can_read_timecards" ON timecards FOR SELECT USING (
	active_timecard_member(organization_id) AND EXISTS (
		SELECT 1 FROM profiles profile
		JOIN memberships membership ON membership.profile_id = profile.id AND membership.organization_id = timecards.organization_id
		LEFT JOIN employees actor_employee ON actor_employee.profile_id = profile.id AND actor_employee.organization_id = timecards.organization_id
		JOIN employees card_employee ON card_employee.id = timecards.employee_id
		WHERE profile.auth_user_id = auth.uid() AND membership.status::text = 'active'
			AND (card_employee.profile_id = profile.id OR card_employee.manager_id = actor_employee.id OR membership.role::text = 'administrator')
	)
);--> statement-breakpoint
CREATE POLICY "authorized_people_can_read_timecard_days" ON timecard_days FOR SELECT USING (timecard_id IN (SELECT id FROM timecards));--> statement-breakpoint
CREATE POLICY "authorized_people_can_read_timecard_sources" ON timecard_day_sources FOR SELECT USING (timecard_day_id IN (SELECT id FROM timecard_days));--> statement-breakpoint
CREATE POLICY "authorized_people_can_read_timecard_events" ON timecard_events FOR SELECT USING (timecard_id IN (SELECT id FROM timecards));--> statement-breakpoint
CREATE POLICY "authorized_people_can_read_corrections" ON attendance_interval_corrections FOR SELECT USING (
	active_timecard_member(organization_id) AND EXISTS (
		SELECT 1 FROM attendance_intervals interval
		JOIN employees corrected_employee ON corrected_employee.id = interval.employee_id
		JOIN profiles profile ON profile.auth_user_id = auth.uid()
		JOIN memberships membership ON membership.profile_id = profile.id AND membership.organization_id = attendance_interval_corrections.organization_id
		LEFT JOIN employees actor_employee ON actor_employee.profile_id = profile.id AND actor_employee.organization_id = attendance_interval_corrections.organization_id
		WHERE interval.id = attendance_interval_corrections.attendance_interval_id AND membership.status::text = 'active'
			AND (corrected_employee.profile_id = profile.id OR corrected_employee.manager_id = actor_employee.id OR membership.role::text = 'administrator')
	)
);--> statement-breakpoint
CREATE POLICY "authorized_people_can_read_overtime_earnings" ON payout_earning_lines FOR SELECT USING (
	payout_id IN (
		SELECT payout.id FROM payouts payout
		JOIN payroll_runs run ON run.id = payout.payroll_run_id
		JOIN employees employee ON employee.id = payout.employee_id
		JOIN profiles profile ON profile.auth_user_id = auth.uid()
		JOIN memberships membership ON membership.profile_id = profile.id AND membership.organization_id = run.organization_id
		WHERE membership.status::text = 'active' AND (membership.role::text = 'administrator' OR employee.profile_id = profile.id)
	)
);--> statement-breakpoint
CREATE POLICY "actors_can_read_mutation_receipts" ON mutation_receipts FOR SELECT USING (
	active_timecard_member(organization_id) AND actor_profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
);
