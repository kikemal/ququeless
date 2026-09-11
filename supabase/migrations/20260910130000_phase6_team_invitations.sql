-- Phase 6: staff invitations + team management (hashed tokens, owner-only).

CREATE TABLE public.business_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_invitations_email_not_blank CHECK (length(trim(email)) > 0),
  CONSTRAINT business_invitations_token_hash_not_blank CHECK (length(trim(token_hash)) > 0),
  CONSTRAINT business_invitations_expires_after_created CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX business_invitations_token_hash_unique
  ON public.business_invitations (token_hash);

-- One active pending invitation per business + email
CREATE UNIQUE INDEX business_invitations_pending_email_unique
  ON public.business_invitations (business_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX business_invitations_business_id_idx
  ON public.business_invitations (business_id);

ALTER TABLE public.business_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_invitations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.business_invitations FROM PUBLIC;
REVOKE ALL ON TABLE public.business_invitations FROM anon;
REVOKE ALL ON TABLE public.business_invitations FROM authenticated;

-- Owners can read invitation metadata (never grant token_hash via column grants).
GRANT SELECT (
  id,
  business_id,
  email,
  invited_by,
  expires_at,
  accepted_at,
  revoked_at,
  created_at
) ON TABLE public.business_invitations TO authenticated;

GRANT INSERT (
  business_id,
  email,
  token_hash,
  invited_by,
  expires_at
) ON TABLE public.business_invitations TO authenticated;

GRANT UPDATE (
  revoked_at,
  accepted_at
) ON TABLE public.business_invitations TO authenticated;

CREATE POLICY business_invitations_select_owner
  ON public.business_invitations
  FOR SELECT
  TO authenticated
  USING (public.is_business_owner(business_id));

CREATE POLICY business_invitations_insert_owner
  ON public.business_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY business_invitations_update_owner
  ON public.business_invitations
  FOR UPDATE
  TO authenticated
  USING (public.is_business_owner(business_id))
  WITH CHECK (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_invite_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(COALESCE(p_email, '')));
$$;

REVOKE ALL ON FUNCTION public.normalize_invite_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_invite_email(text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.hash_invite_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION public.hash_invite_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hash_invite_token(text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_business_invitation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_business_invitation(p_email text)
RETURNS TABLE (
  invitation_id uuid,
  email text,
  expires_at timestamptz,
  invitation_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_business_id uuid;
  v_email text;
  v_token text;
  v_hash text;
  v_expires timestamptz;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_email := public.normalize_invite_email(p_email);
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'A valid email is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT bm.business_id
  INTO v_business_id
  FROM public.business_members bm
  WHERE bm.user_id = v_user
    AND bm.role = 'business_owner'
  ORDER BY bm.created_at ASC
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Owner access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.business_members bm
    JOIN public.profiles p ON p.id = bm.user_id
    WHERE bm.business_id = v_business_id
      AND public.normalize_invite_email(p.email) = v_email
  ) THEN
    RAISE EXCEPTION 'This email is already a team member'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Replace any existing pending invite for this email
  UPDATE public.business_invitations bi
  SET revoked_at = now()
  WHERE bi.business_id = v_business_id
    AND public.normalize_invite_email(bi.email) = v_email
    AND bi.accepted_at IS NULL
    AND bi.revoked_at IS NULL;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_expires := now() + interval '7 days';

  INSERT INTO public.business_invitations (
    business_id,
    email,
    token_hash,
    invited_by,
    expires_at
  ) VALUES (
    v_business_id,
    v_email,
    v_hash,
    v_user,
    v_expires
  )
  RETURNING id INTO v_id;

  RETURN QUERY
  SELECT v_id, v_email, v_expires, v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_business_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_business_invitation(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_business_invitation(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_invitation_preview (minimal public info; no token hash)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_invitation_preview(p_token text)
RETURNS TABLE (
  business_name text,
  email text,
  expires_at timestamptz,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_inv public.business_invitations%ROWTYPE;
  v_hash text;
  v_status text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid invitation'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_hash := encode(extensions.digest(trim(p_token), 'sha256'), 'hex');

  SELECT bi.*
  INTO v_inv
  FROM public.business_invitations bi
  WHERE bi.token_hash = v_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invitation'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    v_status := 'accepted';
  ELSIF v_inv.revoked_at IS NOT NULL THEN
    v_status := 'revoked';
  ELSIF v_inv.expires_at <= now() THEN
    v_status := 'expired';
  ELSE
    v_status := 'pending';
  END IF;

  RETURN QUERY
  SELECT b.name, v_inv.email, v_inv.expires_at, v_status
  FROM public.businesses b
  WHERE b.id = v_inv.business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_invitation_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_preview(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- accept_business_invitation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_business_invitation(p_token text)
RETURNS TABLE (
  business_id uuid,
  business_name text,
  role public.member_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.business_invitations%ROWTYPE;
  v_hash text;
  v_name text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid invitation'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_email := public.normalize_invite_email(COALESCE(auth.jwt() ->> 'email', ''));
  IF v_email = '' THEN
    SELECT public.normalize_invite_email(p.email)
    INTO v_email
    FROM public.profiles p
    WHERE p.id = v_user;
  END IF;

  IF v_email = '' THEN
    RAISE EXCEPTION 'Authenticated email is required'
      USING ERRCODE = 'check_violation';
  END IF;

  v_hash := encode(extensions.digest(trim(p_token), 'sha256'), 'hex');

  SELECT bi.*
  INTO v_inv
  FROM public.business_invitations bi
  WHERE bi.token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invitation'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has already been accepted'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has been revoked'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'This invitation has expired'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.normalize_invite_email(v_inv.email) IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'This invitation belongs to a different email address'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.business_members bm
    WHERE bm.business_id = v_inv.business_id
      AND bm.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'You are already a member of this business'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (v_inv.business_id, v_user, 'staff');

  UPDATE public.business_invitations
  SET accepted_at = now()
  WHERE id = v_inv.id;

  SELECT b.name INTO v_name
  FROM public.businesses b
  WHERE b.id = v_inv.business_id;

  RETURN QUERY
  SELECT v_inv.business_id, v_name, 'staff'::public.member_role;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_business_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_business_invitation(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_business_invitation(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- revoke_business_invitation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_business_invitation(p_invitation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inv public.business_invitations%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT bi.*
  INTO v_inv
  FROM public.business_invitations bi
  WHERE bi.id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_business_owner(v_inv.business_id) THEN
    RAISE EXCEPTION 'Owner access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Accepted invitations cannot be revoked'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_inv.revoked_at IS NOT NULL THEN
    RETURN true;
  END IF;

  UPDATE public.business_invitations
  SET revoked_at = now()
  WHERE id = v_inv.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_business_invitation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_business_invitation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_business_invitation(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- remove_staff_member
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_staff_member(p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_member public.business_members%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT bm.*
  INTO v_member
  FROM public.business_members bm
  WHERE bm.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_business_owner(v_member.business_id) THEN
    RAISE EXCEPTION 'Owner access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_member.user_id = v_user THEN
    RAISE EXCEPTION 'You cannot remove yourself'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_member.role IS DISTINCT FROM 'staff' THEN
    RAISE EXCEPTION 'Only staff members can be removed'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.business_members
  WHERE id = v_member.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_staff_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_staff_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_staff_member(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- list_business_team (members of primary-owned/joined business; no secrets)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_business_team()
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  role public.member_role,
  created_at timestamptz,
  email text,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_business_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT bm.business_id
  INTO v_business_id
  FROM public.business_members bm
  WHERE bm.user_id = v_user
  ORDER BY bm.created_at ASC
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Business membership required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Business membership required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    bm.id,
    bm.user_id,
    bm.role,
    bm.created_at,
    p.email,
    p.full_name
  FROM public.business_members bm
  LEFT JOIN public.profiles p ON p.id = bm.user_id
  WHERE bm.business_id = v_business_id
  ORDER BY
    CASE WHEN bm.role = 'business_owner' THEN 0 ELSE 1 END,
    bm.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_business_team() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_business_team() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_business_team() TO authenticated;

-- ---------------------------------------------------------------------------
-- list_pending_invitations (owner only; never returns token_hash)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_pending_invitations()
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_business_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT bm.business_id
  INTO v_business_id
  FROM public.business_members bm
  WHERE bm.user_id = v_user
    AND bm.role = 'business_owner'
  ORDER BY bm.created_at ASC
  LIMIT 1;

  IF v_business_id IS NULL OR NOT public.is_business_owner(v_business_id) THEN
    RAISE EXCEPTION 'Owner access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    bi.id,
    bi.email,
    bi.created_at,
    bi.expires_at,
    bi.accepted_at,
    bi.revoked_at
  FROM public.business_invitations bi
  WHERE bi.business_id = v_business_id
    AND bi.accepted_at IS NULL
    AND bi.revoked_at IS NULL
  ORDER BY bi.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_pending_invitations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_pending_invitations() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_pending_invitations() TO authenticated;
