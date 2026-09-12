-- QueueLess Phase 13: business timezone + weekly operating hours.
-- Admission uses half-open local interval: open_time <= local_time < close_time.
-- Default for existing/new businesses: all days open 00:00–23:59 (effectively always joinable).
-- RLS: members can SELECT hours; mutations via owner RPC only.
-- Does not weaken existing RLS on businesses/queues.

-- ---------------------------------------------------------------------------
-- Timezone on businesses
-- ---------------------------------------------------------------------------

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

CREATE OR REPLACE FUNCTION public.is_valid_iana_timezone(p_tz text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_tz IS NOT NULL
    AND length(trim(p_tz)) > 0
    AND EXISTS (
      SELECT 1 FROM pg_timezone_names z WHERE z.name = trim(p_tz)
    );
$$;

REVOKE ALL ON FUNCTION public.is_valid_iana_timezone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_iana_timezone(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_business_timezone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.timezone := trim(NEW.timezone);
  IF NOT public.is_valid_iana_timezone(NEW.timezone) THEN
    RAISE EXCEPTION 'Invalid timezone'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_timezone_valid ON public.businesses;
CREATE TRIGGER businesses_timezone_valid
  BEFORE INSERT OR UPDATE OF timezone ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_business_timezone();

-- ---------------------------------------------------------------------------
-- Weekly schedule (ISO weekday: Mon=1 … Sun=7)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_operating_hours (
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  weekday smallint NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  open_time time,
  close_time time,
  PRIMARY KEY (business_id, weekday),
  CONSTRAINT business_operating_hours_weekday_range
    CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT business_operating_hours_interval_valid CHECK (
    (
      is_closed = true
      AND open_time IS NULL
      AND close_time IS NULL
    )
    OR (
      is_closed = false
      AND open_time IS NOT NULL
      AND close_time IS NOT NULL
      AND open_time < close_time
    )
  )
);

CREATE INDEX IF NOT EXISTS business_operating_hours_business_id_idx
  ON public.business_operating_hours (business_id);

ALTER TABLE public.business_operating_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_operating_hours_select_member ON public.business_operating_hours;
CREATE POLICY business_operating_hours_select_member
  ON public.business_operating_hours
  FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

-- No direct INSERT/UPDATE/DELETE for clients — owner RPC only.
REVOKE ALL ON TABLE public.business_operating_hours FROM PUBLIC;
GRANT SELECT ON TABLE public.business_operating_hours TO authenticated;

-- ---------------------------------------------------------------------------
-- Default nearly-always-open schedule (00:00–23:59) for existing + new businesses
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_default_operating_hours(p_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d smallint;
BEGIN
  FOR d IN 1..7 LOOP
    INSERT INTO public.business_operating_hours (
      business_id, weekday, is_closed, open_time, close_time
    ) VALUES (
      p_business_id, d, false, TIME '00:00', TIME '23:59'
    )
    ON CONFLICT (business_id, weekday) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_operating_hours(uuid) FROM PUBLIC;

INSERT INTO public.business_operating_hours (business_id, weekday, is_closed, open_time, close_time)
SELECT b.id, d.weekday, false, TIME '00:00', TIME '23:59'
FROM public.businesses b
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6),(7)) AS d(weekday)
ON CONFLICT (business_id, weekday) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_business_operating_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_operating_hours(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_business_created_operating_hours ON public.businesses;
CREATE TRIGGER on_business_created_operating_hours
  AFTER INSERT ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_business_operating_hours();

-- ---------------------------------------------------------------------------
-- is_business_open_at — authoritative admission helper
-- Boundary: open_time <= local_time < close_time
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_business_open_at(
  p_business_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
  v_local timestamp;
  v_weekday smallint;
  v_local_time time;
  v_row public.business_operating_hours%ROWTYPE;
BEGIN
  SELECT b.timezone INTO v_tz
  FROM public.businesses b
  WHERE b.id = p_business_id;

  IF v_tz IS NULL THEN
    RETURN false;
  END IF;

  v_local := p_at AT TIME ZONE v_tz;
  v_weekday := EXTRACT(ISODOW FROM v_local)::smallint;
  v_local_time := v_local::time;

  SELECT h.*
  INTO v_row
  FROM public.business_operating_hours h
  WHERE h.business_id = p_business_id
    AND h.weekday = v_weekday;

  IF NOT FOUND THEN
    -- Missing schedule row: treat as closed (defaults are seeded).
    RETURN false;
  END IF;

  IF v_row.is_closed THEN
    RETURN false;
  END IF;

  RETURN v_local_time >= v_row.open_time AND v_local_time < v_row.close_time;
END;
$$;

REVOKE ALL ON FUNCTION public.is_business_open_at(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_business_open_at(uuid, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_business_open_now(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_business_open_at(p_business_id, now());
$$;

REVOKE ALL ON FUNCTION public.is_business_open_now(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_business_open_now(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- update_my_business_operating_hours — owner of primary business
-- p_schedule: JSON array of 7 objects
-- { "weekday": 1-7, "is_closed": bool, "open_time": "HH:MM"|null, "close_time": "HH:MM"|null }
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_my_business_operating_hours(
  p_timezone text,
  p_schedule jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_business_id uuid;
  v_tz text;
  v_item jsonb;
  v_weekday smallint;
  v_closed boolean;
  v_open time;
  v_close time;
  v_seen int[] := ARRAY[]::int[];
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

  v_tz := trim(COALESCE(p_timezone, ''));
  IF NOT public.is_valid_iana_timezone(v_tz) THEN
    RAISE EXCEPTION 'Invalid timezone'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_schedule IS NULL OR jsonb_typeof(p_schedule) <> 'array' OR jsonb_array_length(p_schedule) <> 7 THEN
    RAISE EXCEPTION 'Schedule must include exactly 7 weekdays'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.businesses
  SET timezone = v_tz
  WHERE id = v_business_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_schedule)
  LOOP
    v_weekday := (v_item ->> 'weekday')::smallint;
    IF v_weekday IS NULL OR v_weekday < 1 OR v_weekday > 7 OR v_weekday = ANY (v_seen) THEN
      RAISE EXCEPTION 'Invalid weekday in schedule'
        USING ERRCODE = 'check_violation';
    END IF;
    v_seen := v_seen || v_weekday;

    v_closed := COALESCE((v_item ->> 'is_closed')::boolean, false);
    IF v_closed THEN
      v_open := NULL;
      v_close := NULL;
    ELSE
      BEGIN
        v_open := (v_item ->> 'open_time')::time;
        v_close := (v_item ->> 'close_time')::time;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Invalid schedule time'
          USING ERRCODE = 'check_violation';
      END;
      IF v_open IS NULL OR v_close IS NULL OR v_open >= v_close THEN
        RAISE EXCEPTION 'Open days require start before end'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    INSERT INTO public.business_operating_hours (
      business_id, weekday, is_closed, open_time, close_time
    ) VALUES (
      v_business_id, v_weekday, v_closed, v_open, v_close
    )
    ON CONFLICT (business_id, weekday) DO UPDATE
    SET
      is_closed = EXCLUDED.is_closed,
      open_time = EXCLUDED.open_time,
      close_time = EXCLUDED.close_time;
  END LOOP;

  IF cardinality(v_seen) <> 7 THEN
    RAISE EXCEPTION 'Schedule must include each weekday once'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_business_operating_hours(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_business_operating_hours(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_business_operating_hours(text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- join_queue: enforce business hours after queue open, before capacity
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_queue(
  p_queue_id uuid,
  p_customer_name text,
  p_customer_phone text DEFAULT NULL,
  p_customer_email text DEFAULT NULL
)
RETURNS TABLE (
  public_id uuid,
  access_token text,
  queue_number integer,
  status public.entry_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_queue public.queues%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_name text;
  v_phone text;
  v_email text;
  v_notify boolean := false;
  v_token text;
  v_token_hash text;
  v_public_id uuid;
  v_number integer;
  v_waiting integer;
BEGIN
  v_name := trim(COALESCE(p_customer_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Customer name is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Customer name is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  v_phone := NULLIF(trim(COALESCE(p_customer_phone, '')), '');
  IF v_phone IS NOT NULL AND char_length(v_phone) > 32 THEN
    RAISE EXCEPTION 'Customer phone is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  v_email := lower(trim(COALESCE(p_customer_email, '')));
  IF v_email = '' THEN
    v_email := NULL;
  ELSE
    IF position('@' IN v_email) = 0
       OR position(' ' IN v_email) > 0
       OR char_length(v_email) > 254 THEN
      RAISE EXCEPTION 'A valid email is required'
        USING ERRCODE = 'check_violation';
    END IF;
    v_notify := true;
  END IF;

  SELECT *
  INTO v_queue
  FROM public.queues q
  WHERE q.id = p_queue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_queue.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Queue is not open'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.is_business_open_now(v_queue.business_id) THEN
    RAISE EXCEPTION 'Business is closed'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT *
  INTO v_service
  FROM public.services s
  WHERE s.id = v_queue.service_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found for queue'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_service.business_id IS DISTINCT FROM v_queue.business_id THEN
    RAISE EXCEPTION 'Queue/service business mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_service.is_active THEN
    RAISE EXCEPTION 'Service is inactive'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_queue.max_waiting_customers IS NOT NULL THEN
    SELECT count(*)::integer
    INTO v_waiting
    FROM public.queue_entries e
    WHERE e.queue_id = v_queue.id
      AND e.status = 'waiting';

    IF v_waiting >= v_queue.max_waiting_customers THEN
      RAISE EXCEPTION 'Queue is full'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.queues q
  SET current_number = q.current_number + 1,
      updated_at = now()
  WHERE q.id = v_queue.id
  RETURNING q.current_number INTO v_number;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_public_id := gen_random_uuid();

  INSERT INTO public.queue_entries (
    public_id,
    business_id,
    queue_id,
    customer_name,
    customer_phone,
    customer_email,
    email_notifications_enabled,
    queue_number,
    status,
    access_token_hash
  ) VALUES (
    v_public_id,
    v_queue.business_id,
    v_queue.id,
    v_name,
    v_phone,
    v_email,
    v_notify,
    v_number,
    'waiting',
    v_token_hash
  );

  RETURN QUERY
  SELECT
    v_public_id,
    v_token,
    v_number,
    'waiting'::public.entry_status;
END;
$$;

REVOKE ALL ON FUNCTION public.join_queue(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_queue(uuid, text, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_public_queues: public availability fields (allowlisted)
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
  business_timezone text,
  business_is_open boolean,
  today_is_closed boolean,
  today_open_time time,
  today_close_time time,
  queue_id uuid,
  queue_name text,
  queue_status public.queue_status,
  current_number integer,
  waiting_count integer,
  max_waiting_customers integer,
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
    b.timezone,
    public.is_business_open_now(b.id),
    COALESCE(h.is_closed, true),
    h.open_time,
    h.close_time,
    q.id,
    q.name,
    q.status,
    q.current_number,
    (
      SELECT count(*)::integer
      FROM public.queue_entries e
      WHERE e.queue_id = q.id
        AND e.status = 'waiting'
    ) AS waiting_count,
    q.max_waiting_customers,
    s.name,
    s.description,
    s.average_service_minutes
  FROM public.businesses b
  JOIN public.queues q ON q.business_id = b.id
  JOIN public.services s ON s.id = q.service_id
  LEFT JOIN public.business_operating_hours h
    ON h.business_id = b.id
   AND h.weekday = EXTRACT(ISODOW FROM (now() AT TIME ZONE b.timezone))::smallint
  WHERE lower(b.slug) = lower(trim(p_slug))
    AND s.is_active = true
  ORDER BY s.name, q.name;
$$;

REVOKE ALL ON FUNCTION public.get_public_queues(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queues(text) TO anon, authenticated;
