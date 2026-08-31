ALTER TABLE mutation_receipts ADD COLUMN result_snapshot jsonb;--> statement-breakpoint
ALTER TABLE mutation_receipts ADD CONSTRAINT time_off_receipt_snapshot_shape CHECK (
  operation NOT IN ('time_off.submit', 'time_off.cancel', 'time_off.approve', 'time_off.decline') OR (
    result_snapshot IS NOT NULL
    AND jsonb_typeof(result_snapshot) = 'object'
    AND result_snapshot ?& ARRAY['schemaVersion', 'requestId', 'status', 'version', 'eventTime', 'actorProfileId', 'actorDisplayLabel', 'actorRole', 'wasLate']
    AND (result_snapshot - ARRAY['schemaVersion', 'requestId', 'status', 'version', 'eventTime', 'actorProfileId', 'actorDisplayLabel', 'actorRole', 'wasLate', 'reviewerAvailability']) = '{}'::jsonb
    AND jsonb_typeof(result_snapshot->'schemaVersion') = 'number' AND result_snapshot->>'schemaVersion' = '1'
    AND jsonb_typeof(result_snapshot->'requestId') = 'string'
    AND jsonb_typeof(result_snapshot->'status') = 'string'
    AND jsonb_typeof(result_snapshot->'version') = 'number'
    AND jsonb_typeof(result_snapshot->'eventTime') = 'string'
    AND jsonb_typeof(result_snapshot->'actorProfileId') = 'string'
    AND jsonb_typeof(result_snapshot->'actorDisplayLabel') = 'string'
    AND jsonb_typeof(result_snapshot->'actorRole') = 'string'
    AND jsonb_typeof(result_snapshot->'wasLate') = 'boolean'
    AND (NOT result_snapshot ? 'reviewerAvailability' OR (operation = 'time_off.submit' AND jsonb_typeof(result_snapshot->'reviewerAvailability') = 'string'))
  )
);--> statement-breakpoint
