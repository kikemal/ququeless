-- Phase 5B: enable Realtime for live queue updates without weakening RLS.
-- Staff: postgres_changes on queue_entries (RLS membership remains the boundary).
-- Customers: public refresh broadcast with no PII; ticket data still via get_ticket(token).

-- ---------------------------------------------------------------------------
-- Publication (staff postgres_changes)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'queue_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_entries;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'queues'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queues;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Customer refresh signal (no customer PII / no tokens)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.broadcast_queue_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id uuid;
BEGIN
  v_queue_id := COALESCE(NEW.queue_id, OLD.queue_id);
  IF v_queue_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Public channel; payload is a refresh signal only (queue_id is already public via get_public_queues).
  PERFORM realtime.send(
    jsonb_build_object('type', 'refresh'),
    'refresh',
    'queue-refresh:' || v_queue_id::text,
    false
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION
  WHEN OTHERS THEN
    -- Never fail the business write if realtime delivery has an issue.
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS queue_entries_broadcast_refresh ON public.queue_entries;
CREATE TRIGGER queue_entries_broadcast_refresh
  AFTER INSERT OR UPDATE OR DELETE ON public.queue_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_queue_refresh();

REVOKE ALL ON FUNCTION public.broadcast_queue_refresh() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broadcast_queue_refresh() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_ticket: also return queue_id so the ticket page can subscribe safely
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_ticket(uuid, text);

CREATE FUNCTION public.get_ticket(
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
    v_entry.queue_id,
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
