ALTER TABLE public.employees ALTER COLUMN preferred_name TYPE text;
ALTER TABLE public.employees ALTER COLUMN phone TYPE text;

UPDATE public.employees
SET preferred_name = CASE
      WHEN preferred_name IS NULL OR pg_catalog.btrim(preferred_name) = '' OR char_length(pg_catalog.btrim(preferred_name)) > 200 THEN NULL
      ELSE pg_catalog.btrim(preferred_name)
    END,
    phone = CASE
      WHEN phone IS NULL OR pg_catalog.btrim(phone) = '' OR pg_catalog.btrim(phone) !~ '^[+][0-9]{7,15}$' THEN NULL
      ELSE pg_catalog.btrim(phone)
    END;

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS version integer;
UPDATE public.employees SET version = 1 WHERE version IS NULL OR version < 1;
ALTER TABLE public.employees ALTER COLUMN version SET DEFAULT 1;
ALTER TABLE public.employees ALTER COLUMN version SET NOT NULL;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_version_positive;
ALTER TABLE public.employees ADD CONSTRAINT employees_version_positive CHECK (version > 0);
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_preferred_name_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_preferred_name_valid CHECK (preferred_name IS NULL OR (pg_catalog.btrim(preferred_name) <> '' AND char_length(preferred_name) <= 200));
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_phone_e164_or_null;
ALTER TABLE public.employees ADD CONSTRAINT employees_phone_e164_or_null CHECK (phone IS NULL OR phone ~ '^[+][0-9]{7,15}$');

ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS payroll_period_end date;
UPDATE public.payouts payout SET payroll_period_end = run.period_end FROM public.payroll_runs run WHERE run.id = payout.payroll_run_id AND payout.payroll_period_end IS NULL;
ALTER TABLE public.payouts ALTER COLUMN payroll_period_end SET NOT NULL;
CREATE INDEX IF NOT EXISTS payouts_employee_period_cursor_idx ON public.payouts (employee_id, payroll_period_end DESC, id DESC);

ALTER TABLE public.payroll_preview_tokens ADD COLUMN IF NOT EXISTS payroll_period_end date;
UPDATE public.payroll_preview_tokens SET payroll_period_end = period_end WHERE payroll_period_end IS NULL;
ALTER TABLE public.payroll_preview_tokens ALTER COLUMN payroll_period_end SET NOT NULL;

CREATE OR REPLACE FUNCTION public.update_self_service_profile(target_organization_id uuid, submitted_preferred_name text, submitted_phone text, expected_version integer, retry_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  employee public.employees%ROWTYPE;
  receipt public.mutation_receipts%ROWTYPE;
  normalized_preferred_name text := NULLIF(pg_catalog.btrim(submitted_preferred_name), '');
  normalized_phone text := NULLIF(pg_catalog.btrim(submitted_phone), '');
  payload_hash text;
  result jsonb;
BEGIN
  SELECT profile.id INTO actor FROM public.profiles profile
  JOIN public.memberships membership ON membership.profile_id = profile.id
  JOIN public.organizations organization ON organization.id = membership.organization_id
  WHERE profile.auth_user_id = auth.uid() AND profile.status = 'active' AND membership.organization_id = target_organization_id AND membership.status = 'active' AND organization.status = 'active' LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'SELF_SERVICE_ACCESS_UNAVAILABLE'; END IF;
  SELECT * INTO employee FROM public.employees employee_row WHERE employee_row.organization_id = target_organization_id AND employee_row.profile_id = actor AND employee_row.status = 'active' FOR UPDATE;
  IF employee.id IS NULL THEN RAISE EXCEPTION 'SELF_SERVICE_ACCESS_UNAVAILABLE'; END IF;
  IF expected_version IS NULL OR expected_version < 1 OR retry_request_id IS NULL OR (normalized_preferred_name IS NOT NULL AND (char_length(normalized_preferred_name) > 200 OR char_length(normalized_preferred_name) < 1)) OR (normalized_phone IS NOT NULL AND normalized_phone !~ '^[+][0-9]{7,15}$') THEN RAISE EXCEPTION 'SELF_SERVICE_INVALID_INPUT'; END IF;
  payload_hash := encode(extensions.digest(jsonb_build_array(target_organization_id, normalized_preferred_name, normalized_phone, expected_version)::text, 'sha256'), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_organization_id::text || ':self_service.profile_update:' || retry_request_id::text, 0));
  SELECT * INTO receipt FROM public.mutation_receipts WHERE organization_id = target_organization_id AND operation = 'self_service.profile_update' AND request_id = retry_request_id;
  IF receipt.id IS NOT NULL THEN
    IF receipt.actor_profile_id <> actor OR receipt.payload_hash <> payload_hash THEN RAISE EXCEPTION 'SELF_SERVICE_RETRY_CONFLICT'; END IF;
    RETURN receipt.result_snapshot || jsonb_build_object('replayed', true);
  END IF;
  IF employee.version <> expected_version THEN RAISE EXCEPTION 'SELF_SERVICE_STALE'; END IF;
  UPDATE public.profiles SET display_name = COALESCE(normalized_preferred_name, employee.legal_name), updated_at = pg_catalog.transaction_timestamp() WHERE id = actor;
  UPDATE public.employees SET preferred_name = normalized_preferred_name, phone = normalized_phone, version = version + 1, updated_at = pg_catalog.transaction_timestamp() WHERE id = employee.id RETURNING * INTO employee;
  result := jsonb_build_object('employeeId', employee.id, 'preferredName', employee.preferred_name, 'phone', employee.phone, 'displayName', COALESCE(employee.preferred_name, employee.legal_name), 'version', employee.version, 'replayed', false);
  INSERT INTO public.mutation_receipts (organization_id, actor_profile_id, operation, request_id, payload_hash, result_entity_type, result_entity_id, result_version, result_snapshot) VALUES (target_organization_id, actor, 'self_service.profile_update', retry_request_id, payload_hash, 'employee', employee.id, employee.version, result - 'replayed');
  INSERT INTO public.audit_events (organization_id, actor_profile_id, action, entity_type, entity_id, metadata) VALUES (target_organization_id, actor, 'self_service.profile_updated', 'employee', employee.id, jsonb_build_object('employeeId', employee.id, 'resultingVersion', employee.version, 'changedFields', jsonb_build_array('preferred_name', 'phone')));
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.update_self_service_profile(uuid, text, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_self_service_profile(uuid, text, text, integer, uuid) TO authenticated;
