-- QueueLess Phase 4: public queue discovery and atomic next-ticket calling.

CREATE OR REPLACE FUNCTION public.get_public_queues(p_slug text)
RETURNS TABLE (
  business_name text,
  business_slug text,
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
  SELECT b.name, b.slug, q.id, q.name, q.status, q.current_number,
         s.name, s.description, s.average_service_minutes
  FROM public.businesses b
  JOIN public.queues q ON q.business_id = b.id
  JOIN public.services s ON s.id = q.service_id
  WHERE lower(b.slug) = lower(trim(p_slug))
    AND s.is_active = true
  ORDER BY s.name, q.name;
$$;

REVOKE ALL ON FUNCTION public.get_public_queues(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queues(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.call_next_entry(p_queue_id uuid)
RETURNS TABLE (
  id uuid,
  public_id uuid,
  queue_id uuid,
  queue_number integer,
  status public.entry_status,
  called_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue public.queues%ROWTYPE;
  v_entry public.queue_entries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_queue FROM public.queues WHERE id = p_queue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_business_member(v_queue.business_id) THEN
    RAISE EXCEPTION 'Not a member of this business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_queue.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Queue is not open' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_entry
  FROM public.queue_entries
  WHERE queue_id = p_queue_id AND status = 'waiting'
  ORDER BY joined_at, queue_number
  FOR UPDATE SKIP LOCKED LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No waiting customers' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY
  UPDATE public.queue_entries
  SET status = 'called', called_at = COALESCE(called_at, now())
  WHERE queue_entries.id = v_entry.id
  RETURNING queue_entries.id, queue_entries.public_id, queue_entries.queue_id,
            queue_entries.queue_number, queue_entries.status, queue_entries.called_at;
END;
$$;

REVOKE ALL ON FUNCTION public.call_next_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.call_next_entry(uuid) TO authenticated;
