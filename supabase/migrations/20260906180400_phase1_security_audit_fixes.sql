-- Phase 1 security/integrity audit fixes (additive; no schema redesign)

-- ---------------------------------------------------------------------------
-- 1. Remove indexes made redundant by UNIQUE constraints
--    - UNIQUE (public_id) already indexes public_id
--    - UNIQUE (queue_id, queue_number) already supports queue_id lookups
--    - UNIQUE (business_id, user_id) already supports business_id lookups
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.queue_entries_public_id_idx;
DROP INDEX IF EXISTS public.queue_entries_queue_id_idx;
DROP INDEX IF EXISTS public.business_members_business_id_idx;

-- ---------------------------------------------------------------------------
-- 2. Defense-in-depth: anon must not hold table privileges on tenant data
--    (RLS already denies without policies; revoke privileges explicitly)
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.businesses FROM PUBLIC;
REVOKE ALL ON TABLE public.businesses FROM anon;
REVOKE ALL ON TABLE public.business_members FROM PUBLIC;
REVOKE ALL ON TABLE public.business_members FROM anon;
REVOKE ALL ON TABLE public.services FROM PUBLIC;
REVOKE ALL ON TABLE public.services FROM anon;
REVOKE ALL ON TABLE public.queues FROM PUBLIC;
REVOKE ALL ON TABLE public.queues FROM anon;
REVOKE ALL ON TABLE public.queue_entries FROM PUBLIC;
REVOKE ALL ON TABLE public.queue_entries FROM anon;

-- Re-assert authenticated privileges (idempotent with prior migration)
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.businesses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.queues TO authenticated;

REVOKE ALL ON TABLE public.queue_entries FROM authenticated;
GRANT SELECT (
  id,
  public_id,
  business_id,
  queue_id,
  customer_name,
  customer_phone,
  queue_number,
  status,
  joined_at,
  called_at,
  serving_at,
  completed_at
) ON TABLE public.queue_entries TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Internal trigger/helper functions must not be callable by clients
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.enforce_queue_service_same_business() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_queue_service_same_business() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.enforce_entry_queue_business() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_entry_queue_business() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.handle_new_business() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_business() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Membership helpers must be VOLATILE
--    STABLE helpers can miss same-statement membership rows created by
--    AFTER INSERT triggers, breaking INSERT ... RETURNING under RLS.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_business_member(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_members bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_business_owner(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_members bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = auth.uid()
      AND bm.role = 'business_owner'
  );
$$;

REVOKE ALL ON FUNCTION public.is_business_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_business_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_business_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_business_owner(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_business_owner(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Membership trigger: prevent duplicate-owner insert errors on re-entrancy
--    Unique (business_id, user_id) remains the integrity guarantee.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create a business';
  END IF;

  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (NEW.id, auth.uid(), 'business_owner')
  ON CONFLICT (business_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_business() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_business() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. create_business RPC — reliable authenticated onboarding path
--    (PostgREST INSERT ... RETURNING is also fixed by VOLATILE helpers above)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_business(
  p_name text,
  p_slug text,
  p_business_type text,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_logo_url text DEFAULT NULL
)
RETURNS public.businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business public.businesses;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.businesses (
    name,
    slug,
    business_type,
    phone,
    email,
    logo_url
  ) VALUES (
    trim(p_name),
    lower(trim(p_slug)),
    trim(p_business_type),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    NULLIF(trim(COALESCE(p_email, '')), ''),
    NULLIF(trim(COALESCE(p_logo_url, '')), '')
  )
  RETURNING * INTO v_business;

  RETURN v_business;
END;
$$;

REVOKE ALL ON FUNCTION public.create_business(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_business(text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_business(text, text, text, text, text, text) TO authenticated;

-- Direct INSERT ... RETURNING on businesses fails under RLS because SELECT policies
-- are checked before the AFTER INSERT membership trigger runs. Onboarding must use
-- create_business(); keep SELECT/UPDATE/DELETE for members/owners.
REVOKE INSERT ON TABLE public.businesses FROM authenticated;

-- ---------------------------------------------------------------------------
-- 7. Re-assert privileged RPC grants after any broad default grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.transition_entry(uuid, public.entry_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_entry(uuid, public.entry_status) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_entry(uuid, public.entry_status) TO authenticated;

REVOKE ALL ON FUNCTION public.hash_access_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hash_access_token(text) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.generate_access_token() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_access_token() FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.join_queue(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ticket(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_ticket(uuid, text) TO anon, authenticated;
