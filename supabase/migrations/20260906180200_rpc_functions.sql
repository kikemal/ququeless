-- QueueLess Phase 1: customer + staff RPC foundations

CREATE OR REPLACE FUNCTION public.hash_access_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION public.hash_access_token(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.generate_access_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.gen_random_bytes(32), 'hex');
$$;

REVOKE ALL ON FUNCTION public.generate_access_token() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- join_queue
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_queue(
  p_queue_id uuid,
  p_customer_name text,
  p_customer_phone text DEFAULT NULL
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
  v_token text;
  v_token_hash text;
  v_public_id uuid;
  v_number integer;
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

  -- Lock the queue row so concurrent joins cannot reuse the same number.
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
    queue_number,
    status,
    access_token_hash
  ) VALUES (
    v_public_id,
    v_queue.business_id,
    v_queue.id,
    v_name,
    v_phone,
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

REVOKE ALL ON FUNCTION public.join_queue(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_queue(uuid, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_ticket
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ticket(
  p_public_id uuid,
  p_access_token text
)
RETURNS TABLE (
  public_id uuid,
  queue_number integer,
  status public.entry_status,
  people_ahead integer,
  estimated_wait_minutes integer,
  service_name text,
  business_name text,
  queue_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_entry public.queue_entries%ROWTYPE;
  v_token_hash text;
  v_people_ahead integer;
  v_avg_minutes integer;
BEGIN
  IF p_public_id IS NULL OR p_access_token IS NULL OR length(trim(p_access_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid ticket credentials'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_token_hash := encode(extensions.digest(p_access_token, 'sha256'), 'hex');

  SELECT e.*
  INTO v_entry
  FROM public.queue_entries e
  WHERE e.public_id = p_public_id
    AND e.access_token_hash = v_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_people_ahead
  FROM public.queue_entries e
  WHERE e.queue_id = v_entry.queue_id
    AND e.id <> v_entry.id
    AND (
      e.status IN ('called', 'serving')
      OR (
        e.status = 'waiting'
        AND (
          e.joined_at < v_entry.joined_at
          OR (e.joined_at = v_entry.joined_at AND e.queue_number < v_entry.queue_number)
        )
      )
    );

  SELECT s.average_service_minutes
  INTO v_avg_minutes
  FROM public.queues q
  JOIN public.services s ON s.id = q.service_id
  WHERE q.id = v_entry.queue_id;

  RETURN QUERY
  SELECT
    v_entry.public_id,
    v_entry.queue_number,
    v_entry.status,
    v_people_ahead,
    (v_people_ahead * COALESCE(v_avg_minutes, 1))::integer,
    s.name,
    b.name,
    q.name
  FROM public.queues q
  JOIN public.services s ON s.id = q.service_id
  JOIN public.businesses b ON b.id = q.business_id
  WHERE q.id = v_entry.queue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ticket(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ticket(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- cancel_ticket (customer leave while waiting -> skipped)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_ticket(
  p_public_id uuid,
  p_access_token text
)
RETURNS TABLE (
  public_id uuid,
  queue_number integer,
  status public.entry_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_entry public.queue_entries%ROWTYPE;
  v_token_hash text;
BEGIN
  IF p_public_id IS NULL OR p_access_token IS NULL OR length(trim(p_access_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid ticket credentials'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_token_hash := encode(extensions.digest(p_access_token, 'sha256'), 'hex');

  SELECT e.*
  INTO v_entry
  FROM public.queue_entries e
  WHERE e.public_id = p_public_id
    AND e.access_token_hash = v_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_entry.status IS DISTINCT FROM 'waiting' THEN
    RAISE EXCEPTION 'Only waiting tickets can be cancelled'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.queue_entries e
  SET status = 'skipped',
      completed_at = now()
  WHERE e.id = v_entry.id;

  RETURN QUERY
  SELECT e.public_id, e.queue_number, e.status
  FROM public.queue_entries e
  WHERE e.id = v_entry.id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_ticket(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_ticket(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- transition_entry (authenticated staff/owner only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transition_entry(
  p_entry_id uuid,
  p_new_status public.entry_status
)
RETURNS TABLE (
  id uuid,
  public_id uuid,
  queue_id uuid,
  queue_number integer,
  status public.entry_status,
  called_at timestamptz,
  serving_at timestamptz,
  completed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.queue_entries%ROWTYPE;
  v_allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT e.*
  INTO v_entry
  FROM public.queue_entries e
  WHERE e.id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue entry not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_business_member(v_entry.business_id) THEN
    RAISE EXCEPTION 'Not a member of this business'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_entry.status = p_new_status THEN
    RAISE EXCEPTION 'Entry is already in status %', p_new_status
      USING ERRCODE = 'check_violation';
  END IF;

  v_allowed :=
    (v_entry.status = 'waiting' AND p_new_status IN ('called', 'skipped'))
    OR (v_entry.status = 'called' AND p_new_status IN ('serving', 'skipped', 'no_show'))
    OR (v_entry.status = 'serving' AND p_new_status IN ('completed', 'no_show'));

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid transition from % to %', v_entry.status, p_new_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.queue_entries e
  SET
    status = p_new_status,
    called_at = CASE
      WHEN p_new_status = 'called' THEN COALESCE(e.called_at, now())
      ELSE e.called_at
    END,
    serving_at = CASE
      WHEN p_new_status = 'serving' THEN COALESCE(e.serving_at, now())
      ELSE e.serving_at
    END,
    completed_at = CASE
      WHEN p_new_status IN ('completed', 'skipped', 'no_show') THEN COALESCE(e.completed_at, now())
      ELSE e.completed_at
    END
  WHERE e.id = v_entry.id
  RETURNING
    e.id,
    e.public_id,
    e.queue_id,
    e.queue_number,
    e.status,
    e.called_at,
    e.serving_at,
    e.completed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_entry(uuid, public.entry_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_entry(uuid, public.entry_status) TO authenticated;

-- Keep internal crypto helpers non-executable by clients
REVOKE ALL ON FUNCTION public.hash_access_token(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_access_token() FROM anon, authenticated;
