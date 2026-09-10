-- QueueLess Phase 1: membership helpers + Row Level Security

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER to avoid recursive RLS on business_members)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_business_member(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
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
STABLE
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
REVOKE ALL ON FUNCTION public.is_business_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_owner(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners as well (defense in depth in local/dev roles)
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.businesses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.services FORCE ROW LEVEL SECURITY;
ALTER TABLE public.queues FORCE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entries FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Inserts come from handle_new_user (SECURITY DEFINER), not from clients.

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------

CREATE POLICY businesses_select_member
  ON public.businesses
  FOR SELECT
  TO authenticated
  USING (public.is_business_member(id));

CREATE POLICY businesses_insert_authenticated
  ON public.businesses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY businesses_update_owner
  ON public.businesses
  FOR UPDATE
  TO authenticated
  USING (public.is_business_owner(id))
  WITH CHECK (public.is_business_owner(id));

CREATE POLICY businesses_delete_owner
  ON public.businesses
  FOR DELETE
  TO authenticated
  USING (public.is_business_owner(id));

-- ---------------------------------------------------------------------------
-- business_members
-- ---------------------------------------------------------------------------

CREATE POLICY business_members_select_peer
  ON public.business_members
  FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

CREATE POLICY business_members_insert_owner
  ON public.business_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY business_members_update_owner
  ON public.business_members
  FOR UPDATE
  TO authenticated
  USING (public.is_business_owner(business_id))
  WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY business_members_delete_owner
  ON public.business_members
  FOR DELETE
  TO authenticated
  USING (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------

CREATE POLICY services_select_member
  ON public.services
  FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

CREATE POLICY services_insert_owner
  ON public.services
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY services_update_owner
  ON public.services
  FOR UPDATE
  TO authenticated
  USING (public.is_business_owner(business_id))
  WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY services_delete_owner
  ON public.services
  FOR DELETE
  TO authenticated
  USING (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------------
-- queues
-- ---------------------------------------------------------------------------

CREATE POLICY queues_select_member
  ON public.queues
  FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

CREATE POLICY queues_insert_owner
  ON public.queues
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY queues_update_owner
  ON public.queues
  FOR UPDATE
  TO authenticated
  USING (public.is_business_owner(business_id))
  WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY queues_delete_owner
  ON public.queues
  FOR DELETE
  TO authenticated
  USING (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------------
-- queue_entries
-- Members may SELECT (column grants hide access_token_hash).
-- No direct INSERT/UPDATE/DELETE for anon or authenticated — RPCs only.
-- ---------------------------------------------------------------------------

CREATE POLICY queue_entries_select_member
  ON public.queue_entries
  FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

-- Explicitly no INSERT/UPDATE/DELETE policies for authenticated/anon.

-- Table privileges
REVOKE ALL ON TABLE public.queue_entries FROM PUBLIC;
REVOKE ALL ON TABLE public.queue_entries FROM anon;
REVOKE ALL ON TABLE public.queue_entries FROM authenticated;

-- Authenticated staff/owners can read entry fields except the token hash.
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

-- Standard grants for other tables
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.businesses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.queues TO authenticated;

GRANT USAGE ON TYPE public.member_role TO authenticated;
GRANT USAGE ON TYPE public.queue_status TO authenticated, anon;
GRANT USAGE ON TYPE public.entry_status TO authenticated, anon;
