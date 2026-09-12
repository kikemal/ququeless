-- QueueLess Phase 11: production hardening.
-- - Reclaim stale notification claims stuck in 'sending'
-- - Consistent trim() for ticket access-token hashing
-- No RLS policy changes. No product features.

-- ---------------------------------------------------------------------------
-- claim_customer_notifications_for_entry — reclaim stale 'sending' rows
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_customer_notifications_for_entry(
  p_entry_id uuid
)
RETURNS TABLE (
  id uuid,
  type public.customer_notification_type,
  channel public.customer_notification_channel,
  recipient text,
  attempts integer,
  business_name text,
  queue_name text,
  queue_number integer,
  public_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.queue_entries%ROWTYPE;
  v_max_attempts integer := 3;
  v_stale_after interval := interval '5 minutes';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT e.*
  INTO v_entry
  FROM public.queue_entries e
  WHERE e.id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue entry not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_business_member(v_entry.business_id) THEN
    RAISE EXCEPTION 'Not a member of this business'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    UPDATE public.customer_notifications n
    SET
      status = 'sending',
      attempts = n.attempts + 1,
      updated_at = now(),
      last_error = NULL
    WHERE n.id IN (
      SELECT c.id
      FROM public.customer_notifications c
      WHERE c.queue_entry_id = p_entry_id
        AND c.channel = 'email'
        AND c.attempts < v_max_attempts
        AND (
          c.status = 'pending'
          OR c.status = 'failed'
          OR (
            c.status = 'sending'
            AND c.updated_at < now() - v_stale_after
          )
        )
      ORDER BY c.created_at ASC
      FOR UPDATE SKIP LOCKED
    )
    RETURNING n.*
  )
  SELECT
    claimed.id,
    claimed.type,
    claimed.channel,
    claimed.recipient,
    claimed.attempts,
    b.name,
    q.name,
    v_entry.queue_number,
    v_entry.public_id
  FROM claimed
  JOIN public.businesses b ON b.id = claimed.business_id
  JOIN public.queues q ON q.id = v_entry.queue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_customer_notifications_for_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_customer_notifications_for_entry(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_customer_notifications_for_entry(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- claim_customer_notifications_for_ticket — same stale reclaim + trim token
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_customer_notifications_for_ticket(
  p_public_id uuid,
  p_access_token text
)
RETURNS TABLE (
  id uuid,
  type public.customer_notification_type,
  channel public.customer_notification_channel,
  recipient text,
  attempts integer,
  business_name text,
  queue_name text,
  queue_number integer,
  public_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_entry public.queue_entries%ROWTYPE;
  v_token_hash text;
  v_max_attempts integer := 3;
  v_stale_after interval := interval '5 minutes';
BEGIN
  IF p_public_id IS NULL OR p_access_token IS NULL OR length(trim(p_access_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid ticket credentials'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_token_hash := encode(extensions.digest(trim(p_access_token), 'sha256'), 'hex');

  SELECT e.*
  INTO v_entry
  FROM public.queue_entries e
  WHERE e.public_id = p_public_id
    AND e.access_token_hash = v_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    UPDATE public.customer_notifications n
    SET
      status = 'sending',
      attempts = n.attempts + 1,
      updated_at = now(),
      last_error = NULL
    WHERE n.id IN (
      SELECT c.id
      FROM public.customer_notifications c
      WHERE c.queue_entry_id = v_entry.id
        AND c.channel = 'email'
        AND c.attempts < v_max_attempts
        AND (
          c.status = 'pending'
          OR c.status = 'failed'
          OR (
            c.status = 'sending'
            AND c.updated_at < now() - v_stale_after
          )
        )
      ORDER BY c.created_at ASC
      FOR UPDATE SKIP LOCKED
    )
    RETURNING n.*
  )
  SELECT
    claimed.id,
    claimed.type,
    claimed.channel,
    claimed.recipient,
    claimed.attempts,
    b.name,
    q.name,
    v_entry.queue_number,
    v_entry.public_id
  FROM claimed
  JOIN public.businesses b ON b.id = claimed.business_id
  JOIN public.queues q ON q.id = v_entry.queue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_customer_notifications_for_ticket(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_customer_notifications_for_ticket(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- cancel_ticket — hash trimmed access token (match claim/get_ticket)
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

  v_token_hash := encode(extensions.digest(trim(p_access_token), 'sha256'), 'hex');

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
      completed_at = now(),
      cancelled_at = now()
  WHERE e.id = v_entry.id;

  PERFORM public.enqueue_customer_notification(v_entry.id, 'cancelled');

  RETURN QUERY
  SELECT e.public_id, e.queue_number, e.status
  FROM public.queue_entries e
  WHERE e.id = v_entry.id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_ticket(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_ticket(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_ticket — hash trimmed access token
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ticket(
  p_public_id uuid,
  p_access_token text
)
RETURNS TABLE (
  public_id uuid,
  queue_id uuid,
  queue_number integer,
  status public.entry_status,
  people_ahead integer,
  estimated_wait_minutes integer,
  service_name text,
  business_name text,
  queue_name text,
  email_notifications_enabled boolean
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

  v_token_hash := encode(extensions.digest(trim(p_access_token), 'sha256'), 'hex');

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
    v_entry.queue_id,
    v_entry.queue_number,
    v_entry.status,
    v_people_ahead,
    (v_people_ahead * COALESCE(v_avg_minutes, 1))::integer,
    s.name,
    b.name,
    q.name,
    v_entry.email_notifications_enabled
  FROM public.queues q
  JOIN public.services s ON s.id = q.service_id
  JOIN public.businesses b ON b.id = q.business_id
  WHERE q.id = v_entry.queue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ticket(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ticket(uuid, text) TO anon, authenticated;
