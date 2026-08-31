DROP POLICY IF EXISTS time_off_authorized_requests ON public.leave_requests;--> statement-breakpoint
CREATE POLICY time_off_authorized_requests ON public.leave_requests FOR SELECT USING (
  public.active_time_off_member(organization_id)
  AND EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.memberships membership ON membership.profile_id = profile.id
    LEFT JOIN public.employees actor ON actor.profile_id = profile.id
      AND actor.organization_id = leave_requests.organization_id
      AND actor.status = 'active'
    JOIN public.employees target ON target.id = leave_requests.employee_id
      AND target.organization_id = leave_requests.organization_id
    WHERE profile.auth_user_id = auth.uid()
      AND profile.status = 'active'
      AND membership.organization_id = leave_requests.organization_id
      AND membership.status = 'active'
      AND (target.profile_id = profile.id OR target.manager_id = actor.id OR membership.role = 'administrator')
  )
);--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.get_leave_request_detail(target_organization_id uuid, target_request_id uuid) RETURNS SETOF jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'request', to_jsonb(request),
    'employeeLabel', COALESCE(employee.preferred_name, employee.legal_name),
    'employeeNumber', employee.employee_number,
    'permissions', jsonb_build_object(
      'can_cancel', request.status = 'submitted' AND public.current_time_off_profile(request.organization_id) = employee.profile_id,
      'can_approve', request.status = 'submitted' AND public.current_time_off_profile(request.organization_id) IS DISTINCT FROM employee.profile_id AND EXISTS (SELECT 1 FROM public.memberships actor_membership JOIN public.profiles actor_profile ON actor_profile.id = actor_membership.profile_id LEFT JOIN public.employees actor_employee ON actor_employee.profile_id = actor_profile.id AND actor_employee.organization_id = request.organization_id AND actor_employee.status = 'active' WHERE actor_profile.id = public.current_time_off_profile(request.organization_id) AND actor_membership.organization_id = request.organization_id AND actor_membership.status = 'active' AND actor_profile.status = 'active' AND (actor_membership.role = 'administrator' OR (actor_membership.role = 'manager' AND actor_employee.id = employee.manager_id))),
      'can_decline', request.status = 'submitted' AND public.current_time_off_profile(request.organization_id) IS DISTINCT FROM employee.profile_id AND EXISTS (SELECT 1 FROM public.memberships actor_membership JOIN public.profiles actor_profile ON actor_profile.id = actor_membership.profile_id LEFT JOIN public.employees actor_employee ON actor_employee.profile_id = actor_profile.id AND actor_employee.organization_id = request.organization_id AND actor_employee.status = 'active' WHERE actor_profile.id = public.current_time_off_profile(request.organization_id) AND actor_membership.organization_id = request.organization_id AND actor_membership.status = 'active' AND actor_profile.status = 'active' AND (actor_membership.role = 'administrator' OR (actor_membership.role = 'manager' AND actor_employee.id = employee.manager_id)))
    ),
    'events', COALESCE((SELECT jsonb_agg(to_jsonb(event) || jsonb_build_object('actor_display_label', COALESCE(profile.display_name, 'Former user')) ORDER BY event.occurred_at, event.id) FROM public.leave_request_events event LEFT JOIN public.profiles profile ON profile.id = event.actor_profile_id WHERE event.leave_request_id = request.id), '[]'::jsonb),
    'currentLate', request.status = 'submitted' AND (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date > request.start_date,
    'reviewerAvailability', CASE WHEN EXISTS (SELECT 1 FROM public.employees manager_employee JOIN public.profiles manager_profile ON manager_profile.id = manager_employee.profile_id JOIN public.memberships manager_membership ON manager_membership.profile_id = manager_profile.id AND manager_membership.organization_id = request.organization_id WHERE manager_employee.id = employee.manager_id AND manager_employee.organization_id = request.organization_id AND manager_employee.status = 'active' AND manager_profile.status = 'active' AND manager_membership.status = 'active' AND manager_membership.role IN ('manager', 'administrator')) THEN 'manager_available' WHEN EXISTS (SELECT 1 FROM public.memberships administrator_membership JOIN public.profiles administrator_profile ON administrator_profile.id = administrator_membership.profile_id WHERE administrator_membership.organization_id = request.organization_id AND administrator_membership.status = 'active' AND administrator_membership.role = 'administrator' AND administrator_profile.status = 'active' AND administrator_profile.id <> employee.profile_id) THEN 'administrator_fallback' ELSE 'reviewer_needed' END
  )
  FROM public.leave_requests request
  JOIN public.organizations organization ON organization.id = request.organization_id AND organization.status = 'active'
  JOIN public.employees employee ON employee.id = request.employee_id AND employee.organization_id = request.organization_id
  WHERE request.id = target_request_id AND request.organization_id = target_organization_id AND request.status <> 'draft';
$$;--> statement-breakpoint
