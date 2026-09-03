CREATE OR REPLACE FUNCTION public.populate_audit_event_context() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor_label text;
  actor_role text;
  safe_version jsonb;
  safe_fields jsonb;
  safe_reasons jsonb;
  event_name text;
  workflow_area text;
  result_category text;
  occurrence_identity text;
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

  event_name := CASE NEW.action
    WHEN 'organization.created' THEN 'setup.organization_completed'
    WHEN 'employee.created' THEN 'setup.employee_created'
    WHEN 'attendance.checked_in' THEN 'attendance.checked_in'
    WHEN 'attendance.clocked_out' THEN 'attendance.clocked_out'
    WHEN 'time_off.submitted' THEN 'time_off.submitted'
    WHEN 'time_off.approved' THEN 'time_off.approved'
    WHEN 'time_off.declined' THEN 'time_off.declined'
    WHEN 'timecard.submitted' THEN 'timecard.submitted'
    WHEN 'timecard.approved' THEN 'timecard.approved'
    WHEN 'payroll.confirmed' THEN 'payroll.confirmed'
    WHEN 'payroll.completed' THEN 'payroll.completed'
    WHEN 'payroll.failed' THEN 'payroll.failed'
    WHEN 'self_service.profile_updated' THEN 'self_service.profile_updated'
    ELSE NULL
  END;
  workflow_area := CASE
    WHEN NEW.action LIKE 'attendance.%' THEN 'attendance'
    WHEN NEW.action LIKE 'time_off.%' THEN 'time_off'
    WHEN NEW.action LIKE 'timecard.%' THEN 'timecards'
    WHEN NEW.action LIKE 'payroll.%' THEN 'payroll'
    WHEN NEW.action LIKE 'self_service.%' THEN 'self_service'
    WHEN NEW.action LIKE 'employee.%' OR NEW.action LIKE 'organization.%' THEN 'setup'
    ELSE NULL
  END;
  result_category := CASE WHEN NEW.result = 'unexpected_error' THEN 'unexpected_error' ELSE 'success' END;
  occurrence_identity := NEW.entity_id::text || ':' || COALESCE(safe_version #>> '{}', 'transition');
  IF event_name IS NOT NULL AND NEW.result IN ('success', 'unexpected_error') THEN
    INSERT INTO public.product_events (organization_id, event_name, schema_version, workflow_area, result_category, dedupe_key)
    VALUES (
      NEW.organization_id,
      event_name,
      1,
      workflow_area,
      result_category,
      encode(extensions.digest(event_name || '|' || occurrence_identity, 'sha256'), 'hex')
    )
    ON CONFLICT (organization_id, dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
