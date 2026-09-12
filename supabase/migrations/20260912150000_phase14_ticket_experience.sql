-- QueueLess Phase 14: extend get_ticket for customer timeline UX.
-- Adds timestamps + cancelled_at + informational queue/business availability.
-- Does NOT change auth model, RLS, or queue_entries status semantics.
-- Token verification unchanged (trim + SHA-256 hash match).

DROP FUNCTION IF EXISTS public.get_ticket(uuid, text);

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
  email_notifications_enabled boolean,
  joined_at timestamptz,
  called_at timestamptz,
  serving_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  queue_status public.queue_status,
  business_is_open boolean
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
    v_entry.email_notifications_enabled,
    v_entry.joined_at,
    v_entry.called_at,
    v_entry.serving_at,
    v_entry.completed_at,
    v_entry.cancelled_at,
    q.status,
    public.is_business_open_now(b.id)
  FROM public.queues q
  JOIN public.services s ON s.id = q.service_id
  JOIN public.businesses b ON b.id = q.business_id
  WHERE q.id = v_entry.queue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ticket(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ticket(uuid, text) TO anon, authenticated;
