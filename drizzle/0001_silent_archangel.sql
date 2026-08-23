CREATE UNIQUE INDEX IF NOT EXISTS "attendance_one_open_per_employee" ON "attendance_intervals" ("employee_id") WHERE "status" = 'open';--> statement-breakpoint

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "pay_settings" ADD CONSTRAINT "pay_settings_no_overlapping_effective_ranges"
	EXCLUDE USING gist (employee_id WITH =, daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_no_overlapping_periods"
	EXCLUDE USING gist (organization_id WITH =, daterange(period_start, period_end + 1, '[)') WITH &&)
	WHERE (status <> 'failed');--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_payout_employee_organization() RETURNS trigger AS $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM employees employee
		JOIN payroll_runs run ON run.id = NEW.payroll_run_id
		WHERE employee.id = NEW.employee_id AND employee.organization_id = run.organization_id
	) THEN
		RAISE EXCEPTION 'payout employee must belong to the payroll organization';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER payouts_employee_organization_guard
	BEFORE INSERT OR UPDATE ON payouts
	FOR EACH ROW EXECUTE FUNCTION ensure_payout_employee_organization();--> statement-breakpoint

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pay_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_intervals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payslips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE OR REPLACE FUNCTION user_organization_ids() RETURNS SETOF uuid
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$ SELECT organization_id FROM memberships WHERE profile_id = auth.uid() $$;--> statement-breakpoint
CREATE POLICY "organization_members_can_read_organizations" ON "organizations"
	FOR SELECT USING (id IN (SELECT user_organization_ids()));--> statement-breakpoint
CREATE POLICY "users_can_read_own_profile" ON "profiles"
	FOR SELECT USING (id IN (SELECT profile_id FROM memberships WHERE organization_id IN (SELECT user_organization_ids())));--> statement-breakpoint
CREATE POLICY "organization_members_can_read_memberships" ON "memberships"
	FOR SELECT USING (organization_id IN (SELECT user_organization_ids()));--> statement-breakpoint
CREATE POLICY "organization_members_can_read_employees" ON "employees"
	FOR SELECT USING (organization_id IN (SELECT user_organization_ids()));--> statement-breakpoint
CREATE POLICY "organization_members_can_read_pay_settings" ON "pay_settings"
	FOR SELECT USING (employee_id IN (SELECT id FROM employees WHERE organization_id IN (SELECT user_organization_ids())));--> statement-breakpoint
CREATE POLICY "organization_members_can_read_attendance" ON "attendance_intervals"
	FOR SELECT USING (employee_id IN (SELECT id FROM employees WHERE organization_id IN (SELECT user_organization_ids())));--> statement-breakpoint
CREATE POLICY "organization_members_can_read_leave" ON "leave_requests"
	FOR SELECT USING (employee_id IN (SELECT id FROM employees WHERE organization_id IN (SELECT user_organization_ids())));--> statement-breakpoint
CREATE POLICY "organization_members_can_read_payroll" ON "payroll_runs"
	FOR SELECT USING (organization_id IN (SELECT user_organization_ids()));--> statement-breakpoint
CREATE POLICY "organization_members_can_read_payouts" ON "payouts"
	FOR SELECT USING (payroll_run_id IN (SELECT id FROM payroll_runs WHERE organization_id IN (SELECT user_organization_ids())));--> statement-breakpoint
CREATE POLICY "organization_members_can_read_payslips" ON "payslips"
	FOR SELECT USING (payout_id IN (SELECT id FROM payouts WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE organization_id IN (SELECT user_organization_ids()))));--> statement-breakpoint
CREATE POLICY "organization_members_can_read_audit" ON "audit_events"
	FOR SELECT USING (organization_id IN (SELECT user_organization_ids()));--> statement-breakpoint
CREATE UNIQUE INDEX "employees_id_organization_unique" ON "employees" USING btree ("id","organization_id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_same_organization_fk" FOREIGN KEY ("manager_id","organization_id") REFERENCES "public"."employees"("id","organization_id") ON DELETE no action ON UPDATE no action;