CREATE OR REPLACE FUNCTION user_organization_ids() RETURNS SETOF uuid
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT membership.organization_id
		FROM memberships membership
		JOIN profiles profile ON profile.id = membership.profile_id
		WHERE profile.auth_user_id = auth.uid()
	$$;
