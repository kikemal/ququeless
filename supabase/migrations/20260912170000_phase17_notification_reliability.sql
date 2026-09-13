-- QueueLess Phase 17: notification reliability hardening.
-- - Expire exhausted stale 'sending' rows to 'failed' (no endless reclaim)
-- - Preserve Phase 11 stale reclaim for attempts < max
-- - No RLS changes. No new product features.

-- ---------------------------------------------------------------------------
-- claim_customer_notifications_for_entry
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

  -- Exhausted stale claims: mark failed so they are not stuck in 'sending'.
  UPDATE public.customer_notifications n
  SET
    status = 'failed',
    last_error = COALESCE(NULLIF(trim(n.last_error), ''), 'Exceeded retry limit'),
    updated_at = now()
  WHERE n.queue_entry_id = p_entry_id
    AND n.channel = 'email'
    AND n.status = 'sending'
    AND n.attempts >= v_max_attempts
    AND n.updated_at < now() - v_stale_after;

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
-- claim_customer_notifications_for_ticket
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

  UPDATE public.customer_notifications n
  SET
    status = 'failed',
    last_error = COALESCE(NULLIF(trim(n.last_error), ''), 'Exceeded retry limit'),
    updated_at = now()
  WHERE n.queue_entry_id = v_entry.id
    AND n.channel = 'email'
    AND n.status = 'sending'
    AND n.attempts >= v_max_attempts
    AND n.updated_at < now() - v_stale_after;

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
