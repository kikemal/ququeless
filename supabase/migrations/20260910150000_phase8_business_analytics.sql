-- Phase 8: business analytics — cancelled_at distinction + tenant-safe aggregation RPC.

-- ---------------------------------------------------------------------------
-- Distinguish customer cancellation from staff skip/no-show
-- ---------------------------------------------------------------------------

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.queue_entries
  DROP CONSTRAINT IF EXISTS queue_entries_cancelled_requires_completed;

ALTER TABLE public.queue_entries
  ADD CONSTRAINT queue_entries_cancelled_requires_completed
  CHECK (
    cancelled_at IS NULL
    OR completed_at IS NOT NULL
  );

REVOKE ALL ON TABLE public.queue_entries FROM authenticated;
GRANT SELECT (
  id,
  public_id,
  business_id,
  queue_id,
  customer_name,
  customer_phone,
  customer_email,
  email_notifications_enabled,
  queue_number,
  status,
  joined_at,
  called_at,
  serving_at,
  completed_at,
  cancelled_at
) ON TABLE public.queue_entries TO authenticated;

CREATE INDEX IF NOT EXISTS queue_entries_business_joined_at_idx
  ON public.queue_entries (business_id, joined_at);

CREATE INDEX IF NOT EXISTS queue_entries_business_status_joined_idx
  ON public.queue_entries (business_id, status, joined_at);

-- ---------------------------------------------------------------------------
-- cancel_ticket: set cancelled_at (preserve Phase 7 notification behavior)
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
-- get_my_business_analytics
-- Date range is half-open [p_start, p_end) in timestamptz (UTC-oriented).
-- Cohort = entries with joined_at in range for the caller's primary business.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_business_analytics(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_business_id uuid;
  v_overview jsonb;
  v_queues jsonb;
  v_services jsonb;
  v_trend jsonb;
  v_busiest jsonb;
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

  WITH cohort AS (
    SELECT e.*
    FROM public.queue_entries e
    WHERE e.business_id = v_business_id
      AND e.joined_at >= p_start
      AND e.joined_at < p_end
  ),
  overview AS (
    SELECT
      count(*)::integer AS total_customers,
      count(*) FILTER (WHERE status = 'completed')::integer AS served,
      count(*) FILTER (WHERE cancelled_at IS NOT NULL)::integer AS cancelled,
      count(*) FILTER (
        WHERE status IN ('skipped', 'no_show') AND cancelled_at IS NULL
      )::integer AS skipped,
      (
        SELECT avg(extract(epoch FROM (COALESCE(c.called_at, c.serving_at) - c.joined_at)))
        FROM cohort c
        WHERE COALESCE(c.called_at, c.serving_at) IS NOT NULL
          AND COALESCE(c.called_at, c.serving_at) >= c.joined_at
      ) AS avg_wait_seconds,
      (
        SELECT avg(extract(epoch FROM (c.completed_at - COALESCE(c.serving_at, c.called_at))))
        FROM cohort c
        WHERE c.status = 'completed'
          AND c.completed_at IS NOT NULL
          AND COALESCE(c.serving_at, c.called_at) IS NOT NULL
          AND c.completed_at >= COALESCE(c.serving_at, c.called_at)
      ) AS avg_service_seconds
    FROM cohort
  )
  SELECT jsonb_build_object(
    'total_customers', o.total_customers,
    'served', o.served,
    'cancelled', o.cancelled,
    'skipped', o.skipped,
    'eligible_outcomes', (o.served + o.cancelled + o.skipped),
    'completion_rate',
      CASE
        WHEN (o.served + o.cancelled + o.skipped) = 0 THEN NULL
        ELSE round(
          (o.served::numeric / (o.served + o.cancelled + o.skipped)::numeric) * 100,
          1
        )
      END,
    'avg_wait_seconds', CASE WHEN o.avg_wait_seconds IS NULL THEN NULL ELSE round(o.avg_wait_seconds::numeric, 1) END,
    'avg_service_seconds', CASE WHEN o.avg_service_seconds IS NULL THEN NULL ELSE round(o.avg_service_seconds::numeric, 1) END
  )
  INTO v_overview
  FROM overview o;

  WITH cohort AS (
    SELECT e.*
    FROM public.queue_entries e
    WHERE e.business_id = v_business_id
      AND e.joined_at >= p_start
      AND e.joined_at < p_end
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'queue_name', q.name,
      'total_customers', s.total_customers,
      'served', s.served,
      'cancelled', s.cancelled,
      'skipped', s.skipped,
      'avg_wait_seconds', s.avg_wait_seconds,
      'avg_service_seconds', s.avg_service_seconds
    )
    ORDER BY s.total_customers DESC, q.name ASC
  ), '[]'::jsonb)
  INTO v_queues
  FROM (
    SELECT
      c.queue_id,
      count(*)::integer AS total_customers,
      count(*) FILTER (WHERE c.status = 'completed')::integer AS served,
      count(*) FILTER (WHERE c.cancelled_at IS NOT NULL)::integer AS cancelled,
      count(*) FILTER (
        WHERE c.status IN ('skipped', 'no_show') AND c.cancelled_at IS NULL
      )::integer AS skipped,
      round(avg(extract(epoch FROM (COALESCE(c.called_at, c.serving_at) - c.joined_at)))
        FILTER (
          WHERE COALESCE(c.called_at, c.serving_at) IS NOT NULL
            AND COALESCE(c.called_at, c.serving_at) >= c.joined_at
        )::numeric, 1) AS avg_wait_seconds,
      round(avg(extract(epoch FROM (c.completed_at - COALESCE(c.serving_at, c.called_at))))
        FILTER (
          WHERE c.status = 'completed'
            AND c.completed_at IS NOT NULL
            AND COALESCE(c.serving_at, c.called_at) IS NOT NULL
            AND c.completed_at >= COALESCE(c.serving_at, c.called_at)
        )::numeric, 1) AS avg_service_seconds
    FROM cohort c
    GROUP BY c.queue_id
  ) s
  JOIN public.queues q ON q.id = s.queue_id;

  WITH cohort AS (
    SELECT e.*, q.service_id
    FROM public.queue_entries e
    JOIN public.queues q ON q.id = e.queue_id
    WHERE e.business_id = v_business_id
      AND e.joined_at >= p_start
      AND e.joined_at < p_end
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'service_name', COALESCE(sv.name, 'Unknown service'),
      'total_customers', s.total_customers,
      'served', s.served,
      'avg_wait_seconds', s.avg_wait_seconds,
      'avg_service_seconds', s.avg_service_seconds
    )
    ORDER BY s.total_customers DESC, COALESCE(sv.name, 'Unknown service') ASC
  ), '[]'::jsonb)
  INTO v_services
  FROM (
    SELECT
      c.service_id,
      count(*)::integer AS total_customers,
      count(*) FILTER (WHERE c.status = 'completed')::integer AS served,
      round(avg(extract(epoch FROM (COALESCE(c.called_at, c.serving_at) - c.joined_at)))
        FILTER (
          WHERE COALESCE(c.called_at, c.serving_at) IS NOT NULL
            AND COALESCE(c.called_at, c.serving_at) >= c.joined_at
        )::numeric, 1) AS avg_wait_seconds,
      round(avg(extract(epoch FROM (c.completed_at - COALESCE(c.serving_at, c.called_at))))
        FILTER (
          WHERE c.status = 'completed'
            AND c.completed_at IS NOT NULL
            AND COALESCE(c.serving_at, c.called_at) IS NOT NULL
            AND c.completed_at >= COALESCE(c.serving_at, c.called_at)
        )::numeric, 1) AS avg_service_seconds
    FROM cohort c
    GROUP BY c.service_id
  ) s
  LEFT JOIN public.services sv ON sv.id = s.service_id;

  WITH days AS (
    SELECT generate_series(
      date_trunc('day', p_start AT TIME ZONE 'UTC'),
      date_trunc('day', (p_end - interval '1 second') AT TIME ZONE 'UTC'),
      interval '1 day'
    ) AS day_utc
  ),
  cohort AS (
    SELECT e.*
    FROM public.queue_entries e
    WHERE e.business_id = v_business_id
      AND e.joined_at >= p_start
      AND e.joined_at < p_end
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'day', to_char(d.day_utc, 'YYYY-MM-DD'),
      'total_customers', COALESCE(t.total_customers, 0),
      'served', COALESCE(t.served, 0),
      'cancelled', COALESCE(t.cancelled, 0)
    )
    ORDER BY d.day_utc ASC
  ), '[]'::jsonb)
  INTO v_trend
  FROM days d
  LEFT JOIN (
    SELECT
      date_trunc('day', c.joined_at AT TIME ZONE 'UTC') AS day_utc,
      count(*)::integer AS total_customers,
      count(*) FILTER (WHERE c.status = 'completed')::integer AS served,
      count(*) FILTER (WHERE c.cancelled_at IS NOT NULL)::integer AS cancelled
    FROM cohort c
    GROUP BY 1
  ) t ON t.day_utc = d.day_utc;

  WITH cohort AS (
    SELECT e.*
    FROM public.queue_entries e
    WHERE e.business_id = v_business_id
      AND e.joined_at >= p_start
      AND e.joined_at < p_end
  ),
  by_day AS (
    SELECT
      date_trunc('day', c.joined_at AT TIME ZONE 'UTC') AS day_utc,
      count(*)::integer AS total_customers
    FROM cohort c
    GROUP BY 1
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM by_day) THEN NULL
    ELSE (
      SELECT jsonb_build_object(
        'day', to_char(b.day_utc, 'YYYY-MM-DD'),
        'total_customers', b.total_customers
      )
      FROM by_day b
      ORDER BY b.total_customers DESC, b.day_utc ASC
      LIMIT 1
    )
  END
  INTO v_busiest;

  RETURN jsonb_build_object(
    'range_start', p_start,
    'range_end', p_end,
    'timezone', 'UTC',
    'overview', v_overview,
    'queues', v_queues,
    'services', v_services,
    'trend', v_trend,
    'busiest_day', v_busiest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_business_analytics(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_business_analytics(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_business_analytics(timestamptz, timestamptz) TO authenticated;
