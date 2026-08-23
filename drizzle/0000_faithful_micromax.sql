CREATE TYPE "public"."attendance_source" AS ENUM('employee', 'manager', 'administrator', 'system');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('open', 'completed');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'inactive', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('draft', 'submitted', 'approved', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('paid', 'unpaid', 'sick', 'other');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('administrator', 'manager', 'employee');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."pay_frequency" AS ENUM('weekly', 'biweekly', 'semimonthly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payroll_status" AS ENUM('draft', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payslip_status" AS ENUM('pending', 'generated', 'failed');--> statement-breakpoint
CREATE TYPE "public"."profile_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "attendance_intervals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"clock_in" timestamp with time zone NOT NULL,
	"clock_out" timestamp with time zone,
	"source" "attendance_source" NOT NULL,
	"status" "attendance_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_profile_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"profile_id" uuid,
	"employee_number" varchar(100) NOT NULL,
	"legal_name" varchar(200) NOT NULL,
	"preferred_name" varchar(200),
	"email" varchar(320) NOT NULL,
	"phone" varchar(50),
	"hire_date" date NOT NULL,
	"department" varchar(200),
	"title" varchar(200),
	"manager_id" uuid,
	"work_location" varchar(200),
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"termination_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"leave_type" "leave_type" NOT NULL,
	"reason" text,
	"status" "leave_status" DEFAULT 'draft' NOT NULL,
	"reviewer_profile_id" uuid,
	"submitted_at" timestamp with time zone,
	"decision_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"status" "organization_status" DEFAULT 'active' NOT NULL,
	"timezone" varchar(100) NOT NULL,
	"default_currency" varchar(3) NOT NULL,
	"region_code" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"pay_frequency" "pay_frequency" NOT NULL,
	"gross_amount_minor" bigint NOT NULL,
	"flat_deductions_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"gross_amount_minor" bigint NOT NULL,
	"deductions_amount_minor" bigint NOT NULL,
	"net_amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"error_code" varchar(100),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "payroll_status" DEFAULT 'draft' NOT NULL,
	"gross_total_minor" bigint,
	"deductions_total_minor" bigint,
	"net_total_minor" bigint,
	"currency" varchar(3) NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"error_code" varchar(100),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"status" "payslip_status" DEFAULT 'pending' NOT NULL,
	"storage_path" text,
	"generated_at" timestamp with time zone,
	"error_code" varchar(100),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"status" "profile_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_intervals" ADD CONSTRAINT "attendance_intervals_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewer_profile_id_profiles_id_fk" FOREIGN KEY ("reviewer_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_settings" ADD CONSTRAINT "pay_settings_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_employee_idx" ON "attendance_intervals" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "audit_events_organization_created_idx" ON "audit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_organization_number_unique" ON "employees" USING btree ("organization_id","employee_number");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_profile_unique" ON "employees" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "employees_organization_idx" ON "employees" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "employees_manager_idx" ON "employees" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "leave_requests_employee_idx" ON "leave_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_organization_profile_unique" ON "memberships" USING btree ("organization_id","profile_id");--> statement-breakpoint
CREATE INDEX "memberships_organization_idx" ON "memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pay_settings_employee_idx" ON "pay_settings" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_run_employee_unique" ON "payouts" USING btree ("payroll_run_id","employee_id");--> statement-breakpoint
CREATE INDEX "payouts_employee_idx" ON "payouts" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_organization_idempotency_unique" ON "payroll_runs" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "payroll_runs_organization_period_idx" ON "payroll_runs" USING btree ("organization_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_payout_unique" ON "payslips" USING btree ("payout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_auth_user_id_unique" ON "profiles" USING btree ("auth_user_id");