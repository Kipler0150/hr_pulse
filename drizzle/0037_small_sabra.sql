CREATE TYPE "public"."privacy_consent_type" AS ENUM('product_analytics');--> statement-breakpoint
CREATE TYPE "public"."privacy_deletion_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_resolution" AS ENUM('administrator_rejected', 'employee_withdrawn');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_status" AS ENUM('submitted', 'under_review', 'approved', 'rejected', 'scheduled', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_type" AS ENUM('deletion');--> statement-breakpoint
CREATE TABLE "privacy_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"consent_type" "privacy_consent_type" DEFAULT 'product_analytics' NOT NULL,
	"granted" boolean NOT NULL,
	"policy_version" varchar(50) NOT NULL,
	"idempotency_key" varchar(64) NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "privacy_deletion_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"privacy_request_id" uuid,
	"execution_key" varchar(100) NOT NULL,
	"policy_version" varchar(50) NOT NULL,
	"status" "privacy_deletion_status" DEFAULT 'processing' NOT NULL,
	"batch_size" integer DEFAULT 100 NOT NULL,
	"deleted_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_code" varchar(100),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_deletion_executions_batch_size_check" CHECK ("privacy_deletion_executions"."batch_size" BETWEEN 1 AND 100),
	CONSTRAINT "privacy_deletion_executions_failure_code_safe" CHECK ("privacy_deletion_executions"."failure_code" IS NULL OR "privacy_deletion_executions"."failure_code" ~ '^[A-Z0-9_]{1,100}$')
);
--> statement-breakpoint
CREATE TABLE "privacy_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"placed_by_profile_id" uuid NOT NULL,
	"released_by_profile_id" uuid,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_holds_release_consistency" CHECK (("privacy_holds"."active" = true AND "privacy_holds"."released_at" IS NULL AND "privacy_holds"."released_by_profile_id" IS NULL) OR ("privacy_holds"."active" = false AND "privacy_holds"."released_at" IS NOT NULL AND "privacy_holds"."released_by_profile_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"request_type" "privacy_request_type" DEFAULT 'deletion' NOT NULL,
	"status" "privacy_request_status" DEFAULT 'submitted' NOT NULL,
	"resolution_code" "privacy_request_resolution",
	"policy_version" varchar(50) NOT NULL,
	"idempotency_key" varchar(64) NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_profile_id" uuid,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_code" varchar(100),
	"deleted_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_requests_failure_code_safe" CHECK ("privacy_requests"."failure_code" IS NULL OR "privacy_requests"."failure_code" ~ '^[A-Z0-9_]{1,100}$')
);
--> statement-breakpoint
ALTER TABLE "operation_failures" ADD COLUMN "analytics_subject_key" varchar(64);--> statement-breakpoint
ALTER TABLE "product_events" ADD COLUMN "analytics_subject_key" varchar(64);--> statement-breakpoint
ALTER TABLE "privacy_consents" ADD CONSTRAINT "privacy_consents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_consents" ADD CONSTRAINT "privacy_consents_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_deletion_executions" ADD CONSTRAINT "privacy_deletion_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_deletion_executions" ADD CONSTRAINT "privacy_deletion_executions_privacy_request_id_privacy_requests_id_fk" FOREIGN KEY ("privacy_request_id") REFERENCES "public"."privacy_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_holds" ADD CONSTRAINT "privacy_holds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_holds" ADD CONSTRAINT "privacy_holds_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_holds" ADD CONSTRAINT "privacy_holds_placed_by_profile_id_profiles_id_fk" FOREIGN KEY ("placed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_holds" ADD CONSTRAINT "privacy_holds_released_by_profile_id_profiles_id_fk" FOREIGN KEY ("released_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_reviewed_by_profile_id_profiles_id_fk" FOREIGN KEY ("reviewed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_consents_organization_profile_idx" ON "privacy_consents" USING btree ("organization_id","profile_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_consents_idempotency_unique" ON "privacy_consents" USING btree ("organization_id","profile_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_consents_current_unique" ON "privacy_consents" USING btree ("organization_id","profile_id","consent_type") WHERE "privacy_consents"."superseded_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_deletion_executions_key_unique" ON "privacy_deletion_executions" USING btree ("execution_key");--> statement-breakpoint
CREATE INDEX "privacy_deletion_executions_organization_started_idx" ON "privacy_deletion_executions" USING btree ("organization_id","started_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "privacy_holds_organization_profile_idx" ON "privacy_holds" USING btree ("organization_id","profile_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_holds_active_unique" ON "privacy_holds" USING btree ("organization_id","profile_id") WHERE "privacy_holds"."active" = true;--> statement-breakpoint
CREATE INDEX "privacy_requests_organization_status_idx" ON "privacy_requests" USING btree ("organization_id","status","submitted_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "privacy_requests_profile_submitted_idx" ON "privacy_requests" USING btree ("profile_id","submitted_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_requests_idempotency_unique" ON "privacy_requests" USING btree ("organization_id","profile_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_requests_open_unique" ON "privacy_requests" USING btree ("organization_id","profile_id") WHERE "privacy_requests"."status" IN ('submitted', 'under_review', 'approved', 'scheduled', 'failed');--> statement-breakpoint
CREATE INDEX "operation_failures_organization_subject_last_seen_idx" ON "operation_failures" USING btree ("organization_id","analytics_subject_key","last_seen_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "product_events_organization_subject_occurred_idx" ON "product_events" USING btree ("organization_id","analytics_subject_key","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);