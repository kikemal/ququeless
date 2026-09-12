-- QueueLess Phase 12: queue capacity / admission control.
-- Waiting capacity counts only entry_status = 'waiting'.
-- join_queue enforces capacity under FOR UPDATE on the queue row.
-- RLS policies unchanged.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.queues
  ADD COLUMN IF NOT EXISTS max_waiting_customers integer;

ALTER TABLE public.queues
  DROP CONSTRAINT IF EXISTS queues_max_waiting_customers_positive;

ALTER TABLE public.queues
  ADD CONSTRAINT queues_max_waiting_customers_positive
  CHECK (
    max_waiting_customers IS NULL
    OR (max_waiting_customers > 0 AND max_waiting_customers <= 10000)
  );

COMMENT ON COLUMN public.queues.max_waiting_customers IS
  'NULL = unlimited. Positive integer = max concurrent waiting (status=waiting) customers.';

-- ---------------------------------------------------------------------------
-- join_queue: atomic capacity check after locking the queue row
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

  -- Capacity: only status = waiting counts. Locked queue serializes concurrent joins.
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
-- get_public_queues: expose waiting_count + max_waiting_customers only
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
  WHERE lower(b.slug) = lower(trim(p_slug))
    AND s.is_active = true
  ORDER BY s.name, q.name;
$$;

REVOKE ALL ON FUNCTION public.get_public_queues(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queues(text) TO anon, authenticated;
