CREATE OR REPLACE FUNCTION public.user_organization_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $$
  SELECT membership.organization_id
  FROM public.memberships membership
  JOIN public.profiles profile ON profile.id = membership.profile_id
  WHERE profile.auth_user_id = auth.uid()
    AND profile.status = 'active'
    AND membership.status = 'active'
$$;
