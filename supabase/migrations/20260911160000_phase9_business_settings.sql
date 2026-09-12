-- QueueLess Phase 9: business settings + public queue customization.
-- Adds public profile fields, owner-only update RPC, and extends get_public_queues.
-- Does not weaken RLS. Slug is never updated by settings.

-- ---------------------------------------------------------------------------
-- Columns (safe defaults for existing businesses)
-- ---------------------------------------------------------------------------

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS public_description text,
  ADD COLUMN IF NOT EXISTS public_instructions text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS branding_theme text NOT NULL DEFAULT 'default';

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_branding_theme_allowed;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_branding_theme_allowed
  CHECK (branding_theme IN ('default', 'minimal', 'warm', 'professional'));

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_public_description_length;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_public_description_length
  CHECK (public_description IS NULL OR char_length(public_description) <= 500);

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_public_instructions_length;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_public_instructions_length
  CHECK (public_instructions IS NULL OR char_length(public_instructions) <= 1000);

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_name_max_length;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_name_max_length
  CHECK (char_length(name) <= 100);

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_contact_phone_max_length;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_contact_phone_max_length
  CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 40);

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_contact_email_max_length;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_contact_email_max_length
  CHECK (contact_email IS NULL OR char_length(contact_email) <= 254);

-- ---------------------------------------------------------------------------
-- update_my_business_settings — owner of primary business only; no business_id arg
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_my_business_settings(
  p_name text,
  p_public_description text DEFAULT NULL,
  p_public_instructions text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_branding_theme text DEFAULT 'default'
)
RETURNS public.businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_business_id uuid;
  v_name text;
  v_description text;
  v_instructions text;
  v_email text;
  v_phone text;
  v_theme text;
  v_row public.businesses%ROWTYPE;
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

  IF NOT public.is_business_owner(v_business_id) THEN
    RAISE EXCEPTION 'Owner access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_name := trim(BOTH FROM coalesce(p_name, ''));
  v_name := regexp_replace(v_name, '[[:cntrl:]]', '', 'g');
  IF v_name = '' THEN
    RAISE EXCEPTION 'Business name is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'Business name is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  v_description := nullif(trim(BOTH FROM coalesce(p_public_description, '')), '');
  IF v_description IS NOT NULL THEN
    v_description := regexp_replace(v_description, '[[:cntrl:]]', '', 'g');
    v_description := nullif(trim(BOTH FROM v_description), '');
  END IF;
  IF v_description IS NOT NULL AND char_length(v_description) > 500 THEN
    RAISE EXCEPTION 'Public description is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  v_instructions := nullif(trim(BOTH FROM coalesce(p_public_instructions, '')), '');
  IF v_instructions IS NOT NULL THEN
    -- Allow newlines; strip other control characters
    v_instructions := regexp_replace(v_instructions, '[^\t\n\r[:print:]]', '', 'g');
    v_instructions := nullif(trim(BOTH FROM v_instructions), '');
  END IF;
  IF v_instructions IS NOT NULL AND char_length(v_instructions) > 1000 THEN
    RAISE EXCEPTION 'Public instructions are too long'
      USING ERRCODE = 'check_violation';
  END IF;

  v_email := nullif(lower(trim(BOTH FROM coalesce(p_contact_email, ''))), '');
  IF v_email IS NOT NULL THEN
    IF v_email ~ '\s' OR char_length(v_email) > 254
       OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
      RAISE EXCEPTION 'Enter a valid email address'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_phone := nullif(trim(BOTH FROM coalesce(p_contact_phone, '')), '');
  IF v_phone IS NOT NULL THEN
    v_phone := regexp_replace(v_phone, '[[:cntrl:]]', '', 'g');
    v_phone := nullif(trim(BOTH FROM v_phone), '');
  END IF;
  IF v_phone IS NOT NULL AND char_length(v_phone) > 40 THEN
    RAISE EXCEPTION 'Contact phone is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  v_theme := lower(trim(BOTH FROM coalesce(p_branding_theme, 'default')));
  IF v_theme NOT IN ('default', 'minimal', 'warm', 'professional') THEN
    RAISE EXCEPTION 'Invalid branding theme'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.businesses b
  SET
    name = v_name,
    public_description = v_description,
    public_instructions = v_instructions,
    contact_email = v_email,
    contact_phone = v_phone,
    branding_theme = v_theme
    -- slug intentionally unchanged; onboarding email/phone untouched
  WHERE b.id = v_business_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_business_settings(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_business_settings(text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_business_settings(text, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Extend get_public_queues with allowlisted public profile fields only
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_public_queues(text);

CREATE OR REPLACE FUNCTION public.get_public_queues(p_slug text)
RETURNS TABLE (
  business_name text,
  business_slug text,
  public_description text,
  public_instructions text,
  contact_email text,
  contact_phone text,
  branding_theme text,
  queue_id uuid,
  queue_name text,
  queue_status public.queue_status,
  current_number integer,
  service_name text,
  service_description text,
  average_service_minutes integer
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    b.name,
    b.slug,
    b.public_description,
    b.public_instructions,
    b.contact_email,
    b.contact_phone,
    b.branding_theme,
    q.id,
    q.name,
    q.status,
    q.current_number,
    s.name,
    s.description,
    s.average_service_minutes
  FROM public.businesses b
  JOIN public.queues q ON q.business_id = b.id
  JOIN public.services s ON s.id = q.service_id
  WHERE lower(b.slug) = lower(trim(p_slug))
    AND s.is_active = true
  ORDER BY s.name, q.name;
$$;

REVOKE ALL ON FUNCTION public.get_public_queues(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queues(text) TO anon, authenticated;
