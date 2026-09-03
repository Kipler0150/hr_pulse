-- Product milestones are written by flag-gated trusted server operations.
-- Keep the database trigger responsible only for audit defaults and sanitization.
CREATE OR REPLACE FUNCTION public.populate_audit_event_context() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor_label text;
  actor_role text;
  safe_version jsonb;
  safe_fields jsonb;
  safe_reasons jsonb;
BEGIN
  NEW.result := COALESCE(NEW.result, 'success');
  NEW.correlation_id := COALESCE(NEW.correlation_id, gen_random_uuid());
  IF NEW.actor_profile_id IS NOT NULL THEN
    SELECT profile.display_name INTO actor_label FROM public.profiles profile WHERE profile.id = NEW.actor_profile_id;
    SELECT membership.role::text INTO actor_role
    FROM public.memberships membership
    WHERE membership.organization_id = NEW.organization_id AND membership.profile_id = NEW.actor_profile_id
    ORDER BY membership.updated_at DESC LIMIT 1;
    NEW.actor_label_snapshot := COALESCE(NEW.actor_label_snapshot, actor_label);
    NEW.actor_role_snapshot := COALESCE(NEW.actor_role_snapshot, actor_role);
  END IF;

  safe_version := COALESCE(NEW.metadata -> 'resultingVersion', NEW.metadata -> 'version');
  safe_fields := COALESCE(NEW.metadata -> 'changedFields', NEW.metadata -> 'changedFieldNames');
  IF jsonb_typeof(safe_fields) <> 'array' THEN safe_fields := NULL; END IF;
  IF jsonb_typeof(NEW.metadata -> 'reasonCodes') = 'array' THEN
    safe_reasons := NEW.metadata -> 'reasonCodes';
  ELSIF NEW.metadata ? 'reasonCode' THEN
    safe_reasons := jsonb_build_array(NEW.metadata -> 'reasonCode');
  ELSIF NEW.metadata ? 'errorCode' THEN
    safe_reasons := jsonb_build_array(NEW.metadata -> 'errorCode');
  END IF;
  NEW.metadata := jsonb_strip_nulls(jsonb_build_object('resultingVersion', safe_version, 'changedFields', safe_fields, 'reasonCodes', safe_reasons));
  RETURN NEW;
END;
$$;
