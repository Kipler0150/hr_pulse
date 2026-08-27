CREATE TYPE "public"."membership_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."payroll_attempt_outcome" AS ENUM('processing', 'succeeded', 'retryable_failure', 'failed');--> statement-breakpoint
CREATE TYPE "public"."queue_delivery_status" AS ENUM('pending', 'submitted', 'failed');--> statement-breakpoint
CREATE TABLE "pay_setting_deductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pay_setting_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_setting_deductions_amount_positive" CHECK ("pay_setting_deductions"."amount_minor" > 0),
	CONSTRAINT "pay_setting_deductions_order_nonnegative" CHECK ("pay_setting_deductions"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payout_deduction_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"source_deduction_id" uuid,
	"name" varchar(120) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"display_order" integer NOT NULL,
	CONSTRAINT "payout_deduction_amount_positive" CHECK ("payout_deduction_lines"."amount_minor" > 0),
	CONSTRAINT "payout_deduction_order_nonnegative" CHECK ("payout_deduction_lines"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payroll_preview_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_profile_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"calculation_version" varchar(50) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_preview_period_order_check" CHECK ("payroll_preview_tokens"."period_end" >= "payroll_preview_tokens"."period_start")
);
--> statement-breakpoint
CREATE TABLE "payroll_run_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"processing_generation" integer NOT NULL,
	"attempt_number" integer NOT NULL,
	"inngest_event_id" varchar(200),
	"initiated_by_profile_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" "payroll_attempt_outcome" DEFAULT 'processing' NOT NULL,
	"error_code" varchar(100),
	"error_guidance" text,
	CONSTRAINT "payroll_attempt_number_positive" CHECK ("payroll_run_attempts"."attempt_number" > 0 AND "payroll_run_attempts"."processing_generation" > 0)
);
--> statement-breakpoint
CREATE TABLE "payroll_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"frequency" "pay_frequency" NOT NULL,
	"anchor_start_date" date,
	"effective_start_date" date NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_schedules_version_positive" CHECK ("payroll_schedules"."version" > 0),
	CONSTRAINT "payroll_schedules_anchor_check" CHECK (("payroll_schedules"."frequency" IN ('weekly', 'biweekly') AND "payroll_schedules"."anchor_start_date" IS NOT NULL) OR ("payroll_schedules"."frequency" IN ('semimonthly', 'monthly') AND "payroll_schedules"."anchor_start_date" IS NULL))
);
--> statement-breakpoint
INSERT INTO "payroll_schedules" ("organization_id", "frequency", "anchor_start_date", "effective_start_date")
SELECT organization.id,
	COALESCE((SELECT setting.pay_frequency FROM pay_settings setting JOIN employees employee ON employee.id = setting.employee_id WHERE employee.organization_id = organization.id ORDER BY setting.effective_from LIMIT 1), 'monthly'::pay_frequency),
	CASE WHEN COALESCE((SELECT setting.pay_frequency FROM pay_settings setting JOIN employees employee ON employee.id = setting.employee_id WHERE employee.organization_id = organization.id ORDER BY setting.effective_from LIMIT 1), 'monthly'::pay_frequency) IN ('weekly', 'biweekly')
		THEN COALESCE((SELECT MIN(setting.effective_from) FROM pay_settings setting JOIN employees employee ON employee.id = setting.employee_id WHERE employee.organization_id = organization.id), CURRENT_DATE)
		ELSE NULL END,
	COALESCE((SELECT MIN(run.period_start) FROM payroll_runs run WHERE run.organization_id = organization.id), date_trunc('month', CURRENT_DATE)::date)
FROM organizations organization
;--> statement-breakpoint
INSERT INTO "pay_setting_deductions" ("pay_setting_id", "name", "amount_minor", "display_order")
SELECT id, 'Legacy fixed deductions', flat_deductions_minor, 0
FROM pay_settings
WHERE flat_deductions_minor > 0;--> statement-breakpoint
DELETE FROM payroll_runs run
WHERE run.status = 'draft'
	AND NOT EXISTS (SELECT 1 FROM payouts payout WHERE payout.payroll_run_id = run.id)
	AND NOT EXISTS (SELECT 1 FROM memberships membership WHERE membership.organization_id = run.organization_id);--> statement-breakpoint
ALTER TABLE "payouts" RENAME COLUMN "error_message" TO "error_guidance";--> statement-breakpoint
ALTER TABLE "payroll_runs" RENAME COLUMN "error_message" TO "error_guidance";--> statement-breakpoint
ALTER TABLE "payslips" RENAME COLUMN "error_message" TO "error_guidance";--> statement-breakpoint
ALTER TABLE "pay_settings" DROP CONSTRAINT "pay_settings_gross_nonnegative";--> statement-breakpoint
ALTER TABLE "pay_settings" DROP CONSTRAINT "pay_settings_deductions_nonnegative";--> statement-breakpoint
ALTER TABLE "payroll_runs" DROP CONSTRAINT "payroll_deductions_nonnegative";--> statement-breakpoint
ALTER TABLE "payroll_runs" DROP CONSTRAINT "payroll_net_nonnegative";--> statement-breakpoint
ALTER TABLE "payroll_runs" DROP CONSTRAINT "payroll_totals_nonnegative";--> statement-breakpoint
ALTER TABLE "payroll_runs" DROP CONSTRAINT "payroll_net_total_check";--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
UPDATE "payouts" SET "status" = 'finalized' WHERE "status" = 'paid';--> statement-breakpoint
DROP TYPE "public"."payout_status";--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'finalized', 'failed');--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."payout_status";--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "status" SET DATA TYPE "public"."payout_status" USING "status"::"public"."payout_status";--> statement-breakpoint
ALTER TABLE "payroll_runs" DROP CONSTRAINT IF EXISTS "payroll_runs_no_overlapping_periods";--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "status" SET DEFAULT 'queued'::text;--> statement-breakpoint
UPDATE "payroll_runs" SET "status" = 'queued' WHERE "status" = 'draft';--> statement-breakpoint
DROP TYPE "public"."payroll_status";--> statement-breakpoint
CREATE TYPE "public"."payroll_status" AS ENUM('queued', 'processing', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "status" SET DEFAULT 'queued'::"public"."payroll_status";--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "status" SET DATA TYPE "public"."payroll_status" USING "status"::"public"."payroll_status";--> statement-breakpoint
DROP INDEX "payroll_runs_organization_idempotency_unique";--> statement-breakpoint
UPDATE "payroll_runs" SET "gross_total_minor" = COALESCE("gross_total_minor", 0), "deductions_total_minor" = COALESCE("deductions_total_minor", 0), "net_total_minor" = COALESCE("net_total_minor", 0);--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "gross_total_minor" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "deductions_total_minor" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "net_total_minor" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "status" "membership_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "founding_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "pay_settings" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "pay_setting_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "employee_number" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "legal_name" varchar(200) NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "currency_exponent" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "calculation_version" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "payroll_schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "organization_name" varchar(200);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "organization_timezone" varchar(100);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "pay_frequency" "pay_frequency";--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "schedule_version" integer;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "currency_exponent" integer;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "currency_map_version" varchar(50);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "calculation_version" varchar(50);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "payroll_reference" varchar(100);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "confirmed_by_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "confirmed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "source_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "preview_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "processing_generation" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "queue_status" "queue_delivery_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "queue_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "queue_event_id" varchar(200);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "queue_error_code" varchar(100);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "lease_owner" varchar(200);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "last_progress_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "payroll_runs" run SET
	"payroll_schedule_id" = schedule.id,
	"organization_name" = organization.name,
	"organization_timezone" = organization.timezone,
	"pay_frequency" = schedule.frequency,
	"schedule_version" = schedule.version,
	"currency_exponent" = CASE WHEN run.currency IN ('JPY', 'KRW', 'VND') THEN 0 ELSE 2 END,
	"currency_map_version" = 'iso-4217-2026-01',
	"calculation_version" = 'legacy-fixed-pay-v1',
	"payroll_reference" = 'PAY' || to_char(run.period_end, 'YYYYMMDD') || replace(run.id::text, '-', ''),
	"confirmed_by_profile_id" = administrator.profile_id,
	"source_fingerprint" = md5(run.id::text || run.updated_at::text) || md5(run.organization_id::text || run.period_start::text),
	"preview_token_hash" = md5(run.idempotency_key) || md5(run.id::text || run.idempotency_key)
FROM organizations organization
JOIN payroll_schedules schedule ON schedule.organization_id = organization.id
JOIN LATERAL (
	SELECT membership.profile_id FROM memberships membership
	WHERE membership.organization_id = organization.id AND membership.role = 'administrator'
	ORDER BY membership.created_at LIMIT 1
) administrator ON true
WHERE run.organization_id = organization.id;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "payroll_schedule_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "organization_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "organization_timezone" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "pay_frequency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "schedule_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "currency_exponent" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "currency_map_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "calculation_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "payroll_reference" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "confirmed_by_profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "source_fingerprint" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ALTER COLUMN "preview_token_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "template_version" integer;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "sha256" varchar(64);--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "file_size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "immutable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_setting_deductions" ADD CONSTRAINT "pay_setting_deductions_pay_setting_id_pay_settings_id_fk" FOREIGN KEY ("pay_setting_id") REFERENCES "public"."pay_settings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_deduction_lines" ADD CONSTRAINT "payout_deduction_lines_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_deduction_lines" ADD CONSTRAINT "payout_deduction_lines_source_deduction_id_pay_setting_deductions_id_fk" FOREIGN KEY ("source_deduction_id") REFERENCES "public"."pay_setting_deductions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_preview_tokens" ADD CONSTRAINT "payroll_preview_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_preview_tokens" ADD CONSTRAINT "payroll_preview_tokens_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_attempts" ADD CONSTRAINT "payroll_run_attempts_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_attempts" ADD CONSTRAINT "payroll_run_attempts_initiated_by_profile_id_profiles_id_fk" FOREIGN KEY ("initiated_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_schedules" ADD CONSTRAINT "payroll_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pay_setting_deductions_setting_idx" ON "pay_setting_deductions" USING btree ("pay_setting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_setting_deductions_name_unique" ON "pay_setting_deductions" USING btree ("pay_setting_id", lower("name"));--> statement-breakpoint
CREATE INDEX "payout_deduction_lines_payout_order_idx" ON "payout_deduction_lines" USING btree ("payout_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_preview_tokens_hash_unique" ON "payroll_preview_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "payroll_preview_tokens_organization_expiry_idx" ON "payroll_preview_tokens" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_attempt_generation_number_unique" ON "payroll_run_attempts" USING btree ("payroll_run_id","processing_generation","attempt_number");--> statement-breakpoint
CREATE INDEX "payroll_attempt_run_started_idx" ON "payroll_run_attempts" USING btree ("payroll_run_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_schedules_organization_unique" ON "payroll_schedules" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_founding_profile_id_profiles_id_fk" FOREIGN KEY ("founding_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_pay_setting_id_pay_settings_id_fk" FOREIGN KEY ("pay_setting_id") REFERENCES "public"."pay_settings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_payroll_schedule_id_payroll_schedules_id_fk" FOREIGN KEY ("payroll_schedule_id") REFERENCES "public"."payroll_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_confirmed_by_profile_id_profiles_id_fk" FOREIGN KEY ("confirmed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_founding_profile_unique" ON "organizations" USING btree ("founding_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_organization_period_unique" ON "payroll_runs" USING btree ("organization_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_preview_token_unique" ON "payroll_runs" USING btree ("organization_id","preview_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_reference_unique" ON "payroll_runs" USING btree ("payroll_reference");--> statement-breakpoint
ALTER TABLE "pay_settings" DROP COLUMN "flat_deductions_minor";--> statement-breakpoint
ALTER TABLE "payroll_runs" DROP COLUMN "idempotency_key";--> statement-breakpoint
ALTER TABLE "pay_settings" ADD CONSTRAINT "pay_settings_version_positive" CHECK ("pay_settings"."version" > 0);--> statement-breakpoint
ALTER TABLE "pay_settings" ADD CONSTRAINT "pay_settings_gross_positive" CHECK ("pay_settings"."gross_amount_minor" > 0);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_processing_generation_positive" CHECK ("payroll_runs"."processing_generation" > 0);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_totals_nonnegative" CHECK ("payroll_runs"."gross_total_minor" >= 0 AND "payroll_runs"."deductions_total_minor" >= 0 AND "payroll_runs"."net_total_minor" >= 0);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_net_total_check" CHECK ("payroll_runs"."net_total_minor" = "payroll_runs"."gross_total_minor" - "payroll_runs"."deductions_total_minor");
--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_no_overlapping_periods"
	EXCLUDE USING gist (organization_id WITH =, daterange(period_start, period_end + 1, '[)') WITH &&);--> statement-breakpoint

CREATE OR REPLACE FUNCTION active_payroll_administrator(target_organization_id uuid) RETURNS boolean
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT EXISTS (
			SELECT 1 FROM memberships membership
			JOIN profiles profile ON profile.id = membership.profile_id
			JOIN organizations organization ON organization.id = membership.organization_id
			WHERE membership.organization_id = target_organization_id
				AND profile.auth_user_id = auth.uid()
				AND profile.status = 'active'
				AND organization.status = 'active'
				AND membership.status = 'active'
				AND membership.role = 'administrator'
		)
	$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION user_organization_ids() RETURNS SETOF uuid
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT membership.organization_id
		FROM memberships membership
		JOIN profiles profile ON profile.id = membership.profile_id
		JOIN organizations organization ON organization.id = membership.organization_id
		WHERE profile.auth_user_id = auth.uid()
			AND profile.status = 'active'
			AND organization.status = 'active'
			AND membership.status = 'active'
	$$;--> statement-breakpoint

ALTER TABLE "payroll_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pay_setting_deductions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll_preview_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll_run_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payout_deduction_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "organization_members_can_read_payroll" ON "payroll_runs";--> statement-breakpoint
DROP POLICY IF EXISTS "organization_members_can_read_payouts" ON "payouts";--> statement-breakpoint
DROP POLICY IF EXISTS "organization_members_can_read_payslips" ON "payslips";--> statement-breakpoint
CREATE POLICY "administrators_can_read_payroll" ON "payroll_runs" FOR SELECT USING (active_payroll_administrator(organization_id));--> statement-breakpoint
CREATE POLICY "administrators_can_read_payouts" ON "payouts" FOR SELECT USING (payroll_run_id IN (SELECT id FROM payroll_runs WHERE active_payroll_administrator(organization_id)));--> statement-breakpoint
CREATE POLICY "administrators_can_read_payslips" ON "payslips" FOR SELECT USING (payout_id IN (SELECT payout.id FROM payouts payout JOIN payroll_runs run ON run.id = payout.payroll_run_id WHERE active_payroll_administrator(run.organization_id)));--> statement-breakpoint
CREATE POLICY "administrators_can_read_schedules" ON "payroll_schedules" FOR SELECT USING (active_payroll_administrator(organization_id));--> statement-breakpoint
CREATE POLICY "administrators_can_read_deductions" ON "pay_setting_deductions" FOR SELECT USING (pay_setting_id IN (SELECT setting.id FROM pay_settings setting JOIN employees employee ON employee.id = setting.employee_id WHERE active_payroll_administrator(employee.organization_id)));--> statement-breakpoint
CREATE POLICY "administrators_can_read_preview_tokens" ON "payroll_preview_tokens" FOR SELECT USING (active_payroll_administrator(organization_id));--> statement-breakpoint
CREATE POLICY "administrators_can_read_attempts" ON "payroll_run_attempts" FOR SELECT USING (payroll_run_id IN (SELECT id FROM payroll_runs WHERE active_payroll_administrator(organization_id)));--> statement-breakpoint
CREATE POLICY "administrators_can_read_payout_deductions" ON "payout_deduction_lines" FOR SELECT USING (payout_id IN (SELECT payout.id FROM payouts payout JOIN payroll_runs run ON run.id = payout.payroll_run_id WHERE active_payroll_administrator(run.organization_id)));--> statement-breakpoint

CREATE OR REPLACE FUNCTION protect_last_active_administrator() RETURNS trigger AS $$
BEGIN
	IF OLD.role = 'administrator' AND OLD.status = 'active'
		AND (TG_OP = 'DELETE' OR NEW.role <> 'administrator' OR NEW.status <> 'active')
		AND NOT EXISTS (
			SELECT 1 FROM memberships membership
			WHERE membership.organization_id = OLD.organization_id
				AND membership.id <> OLD.id
				AND membership.role = 'administrator'
				AND membership.status = 'active'
		) THEN
		RAISE EXCEPTION 'organization must retain one active administrator';
	END IF;
	RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER memberships_last_administrator_guard
	BEFORE UPDATE OR DELETE ON memberships
	FOR EACH ROW EXECUTE FUNCTION protect_last_active_administrator();--> statement-breakpoint

CREATE OR REPLACE FUNCTION protect_terminal_payroll_records() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'payroll financial records cannot be deleted'; END IF;
	IF TG_TABLE_NAME = 'payroll_runs' AND OLD.status = 'completed' THEN RAISE EXCEPTION 'completed payroll runs are immutable'; END IF;
	IF TG_TABLE_NAME = 'payouts' AND OLD.status = 'finalized' THEN RAISE EXCEPTION 'finalized payouts are immutable'; END IF;
	IF TG_TABLE_NAME = 'payslips' AND OLD.status = 'generated' THEN RAISE EXCEPTION 'generated payslips are immutable'; END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER payroll_runs_terminal_immutable BEFORE UPDATE OR DELETE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION protect_terminal_payroll_records();--> statement-breakpoint
CREATE TRIGGER payouts_terminal_immutable BEFORE UPDATE OR DELETE ON payouts FOR EACH ROW EXECUTE FUNCTION protect_terminal_payroll_records();--> statement-breakpoint
CREATE TRIGGER payslips_terminal_immutable BEFORE UPDATE OR DELETE ON payslips FOR EACH ROW EXECUTE FUNCTION protect_terminal_payroll_records();
