ALTER TABLE "privacy_holds" ADD COLUMN "last_action_idempotency_key" varchar(64);--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD COLUMN "last_action_idempotency_key" varchar(64);