-- QueueLess Phase 16: staff queue history (operational reporting).
-- Reuses primary-business resolution pattern from Phase 8 analytics.
-- Terminal history only: completed / skipped / no_show (cancelled via cancelled_at).
-- No schema changes. No new indexes: existing
--   queue_entries_business_status_joined_idx (business_id, status, joined_at)
--   queue_entries_business_joined_at_idx (business_id, joined_at)
-- cover the cohort filter. Ordering is newest joined_at first.

CREATE OR REPLACE FUNCTION public.get_my_business_queue_history(
  p_start timestamptz,
  p_end timestamptz,
  p_queue_id uuid DEFAULT NULL,
  p_outcome text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  queue_name text,
  service_name text,
  queue_number integer,
  customer_name text,
  customer_phone text,
  customer_email text,
  status public.entry_status,
  outcome text,
  joined_at timestamptz,
  called_at timestamptz,
  serving_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  wait_seconds numeric,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_business_id uuid;
  v_limit integer;
  v_offset integer;
  v_outcome text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'Invalid date range'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_end > p_start + interval '366 days' THEN
    RAISE EXCEPTION 'Date range too large'
      USING ERRCODE = 'check_violation';
  END IF;

  v_outcome := NULLIF(lower(trim(COALESCE(p_outcome, ''))), '');
  IF v_outcome IS NOT NULL
     AND v_outcome NOT IN ('completed', 'cancelled', 'skipped', 'no_show') THEN
    RAISE EXCEPTION 'Invalid outcome filter'
      USING ERRCODE = 'check_violation';
  END IF;

  v_limit := COALESCE(p_limit, 25);
  IF v_limit < 1 OR v_limit > 50 THEN
    RAISE EXCEPTION 'Invalid page size'
      USING ERRCODE = 'check_violation';
  END IF;

  v_offset := COALESCE(p_offset, 0);
  IF v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid page offset'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT bm.business_id
  INTO v_business_id
  FROM public.business_members bm
  WHERE bm.user_id = v_user
  ORDER BY bm.created_at ASC
  LIMIT 1;

  IF v_business_id IS NULL OR NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Business membership required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Optional queue filter must belong to the caller's primary business.
  IF p_queue_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.queues q
      WHERE q.id = p_queue_id
        AND q.business_id = v_business_id
    ) THEN
      RAISE EXCEPTION 'Queue not found'
        USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN QUERY
  WITH cohort AS (
    SELECT
      e.id,
      e.queue_id,
      e.queue_number,
      e.customer_name,
      e.customer_phone,
      e.customer_email,
      e.status,
      e.joined_at,
      e.called_at,
      e.serving_at,
      e.completed_at,
      e.cancelled_at,
      CASE
        WHEN e.cancelled_at IS NOT NULL THEN 'cancelled'
        WHEN e.status = 'completed' THEN 'completed'
        WHEN e.status = 'no_show' THEN 'no_show'
        WHEN e.status = 'skipped' THEN 'skipped'
        ELSE e.status::text
      END AS derived_outcome,
      CASE
        WHEN COALESCE(e.called_at, e.serving_at) IS NOT NULL
          AND COALESCE(e.called_at, e.serving_at) >= e.joined_at
        THEN extract(epoch FROM (COALESCE(e.called_at, e.serving_at) - e.joined_at))
        ELSE NULL
      END AS derived_wait_seconds
    FROM public.queue_entries e
    WHERE e.business_id = v_business_id
      AND e.joined_at >= p_start
      AND e.joined_at < p_end
      AND e.status IN ('completed', 'skipped', 'no_show')
      AND (p_queue_id IS NULL OR e.queue_id = p_queue_id)
  ),
  filtered AS (
    SELECT c.*
    FROM cohort c
    WHERE v_outcome IS NULL OR c.derived_outcome = v_outcome
  )
  SELECT
    q.name,
    s.name,
    f.queue_number,
    f.customer_name,
    f.customer_phone,
    f.customer_email,
    f.status,
    f.derived_outcome,
    f.joined_at,
    f.called_at,
    f.serving_at,
    f.completed_at,
    f.cancelled_at,
    f.derived_wait_seconds,
    count(*) OVER ()::bigint AS total_count
  FROM filtered f
  JOIN public.queues q ON q.id = f.queue_id
  JOIN public.services s ON s.id = q.service_id
  ORDER BY f.joined_at DESC, f.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_business_queue_history(
  timestamptz, timestamptz, uuid, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_business_queue_history(
  timestamptz, timestamptz, uuid, text, integer, integer
) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_business_queue_history(
  timestamptz, timestamptz, uuid, text, integer, integer
) TO authenticated;

COMMENT ON FUNCTION public.get_my_business_queue_history(
  timestamptz, timestamptz, uuid, text, integer, integer
) IS
  'Phase 16: tenant-scoped terminal queue history for the caller primary business. No tokens/hashes.';
