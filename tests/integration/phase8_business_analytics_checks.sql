-- Phase 8 business analytics checks (local).
-- Run: npx supabase db query --local -f tests/integration/phase8_business_analytics_checks.sql

DO $$
DECLARE
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_business_a public.businesses%ROWTYPE;
  v_business_b public.businesses%ROWTYPE;
  v_service_a public.services%ROWTYPE;
  v_queue_a public.queues%ROWTYPE;
  v_join record;
  v_call record;
  v_entry_id uuid;
  v_analytics jsonb;
  v_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_end timestamptz := v_start + interval '1 day';
  denied boolean;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
  (
    v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase8-a-' || substr(v_owner_a::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner A"}'::jsonb, now(), now()
  ),
  (
    v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase8-b-' || substr(v_owner_b::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner B"}'::jsonb, now(), now()
  );

  -- Anon cannot call analytics
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  denied := false;
  BEGIN
    PERFORM public.get_my_business_analytics(v_start, v_end);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE8 FAIL: anon could read analytics';
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_business_a
  FROM public.create_business(
    'Phase 8 Salon A',
    'phase-8-a-' || substr(v_owner_a::text, 1, 8),
    'Salon', NULL, NULL, NULL
  );

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business_a.id, 'Cut', 15, true)
  RETURNING * INTO v_service_a;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business_a.id, v_service_a.id, 'Desk', 'open')
  RETURNING * INTO v_queue_a;

  -- Empty range is safe
  v_analytics := public.get_my_business_analytics(v_start, v_end);
  IF (v_analytics -> 'overview' ->> 'total_customers')::integer <> 0 THEN
    RAISE EXCEPTION 'PHASE8 FAIL: empty range should be zero';
  END IF;
  IF v_analytics -> 'overview' ->> 'completion_rate' IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE8 FAIL: empty completion rate should be null';
  END IF;

  -- Deterministic activity: 1 served, 1 cancelled, 1 skipped, 1 waiting
  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Serve Me', NULL, NULL);
  SELECT * INTO v_call FROM public.call_next_entry(v_queue_a.id);
  PERFORM * FROM public.transition_entry(v_call.id, 'serving');
  -- Force known timestamps for wait/service averages (privileged test setup)
  RESET ROLE;
  UPDATE public.queue_entries
  SET
    joined_at = v_start + interval '1 hour',
    called_at = v_start + interval '1 hour 10 minutes',
    serving_at = v_start + interval '1 hour 12 minutes',
    completed_at = v_start + interval '1 hour 22 minutes',
    status = 'completed'
  WHERE id = v_call.id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Cancel Me', NULL, NULL);
  PERFORM * FROM public.cancel_ticket(v_join.public_id, v_join.access_token);
  IF NOT EXISTS (
    SELECT 1 FROM public.queue_entries
    WHERE public_id = v_join.public_id AND cancelled_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PHASE8 FAIL: cancel did not set cancelled_at';
  END IF;

  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Skip Me', NULL, NULL);
  SELECT e.id INTO v_entry_id FROM public.queue_entries e WHERE e.public_id = v_join.public_id;
  PERFORM * FROM public.transition_entry(v_entry_id, 'skipped');

  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Still Waiting', NULL, NULL);

  -- Outside-range entry must be excluded
  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Old Guest', NULL, NULL);
  RESET ROLE;
  UPDATE public.queue_entries
  SET joined_at = v_start - interval '2 days'
  WHERE public_id = v_join.public_id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );

  v_analytics := public.get_my_business_analytics(v_start, v_end);

  IF (v_analytics -> 'overview' ->> 'total_customers')::integer <> 4 THEN
    RAISE EXCEPTION 'PHASE8 FAIL: expected 4 customers in range, got %',
      v_analytics -> 'overview' ->> 'total_customers';
  END IF;
  IF (v_analytics -> 'overview' ->> 'served')::integer <> 1 THEN
    RAISE EXCEPTION 'PHASE8 FAIL: expected 1 served';
  END IF;
  IF (v_analytics -> 'overview' ->> 'cancelled')::integer <> 1 THEN
    RAISE EXCEPTION 'PHASE8 FAIL: expected 1 cancelled';
  END IF;
  IF (v_analytics -> 'overview' ->> 'skipped')::integer <> 1 THEN
    RAISE EXCEPTION 'PHASE8 FAIL: expected 1 skipped';
  END IF;
  IF (v_analytics -> 'overview' ->> 'completion_rate')::numeric <> 33.3 THEN
    RAISE EXCEPTION 'PHASE8 FAIL: expected completion rate 33.3, got %',
      v_analytics -> 'overview' ->> 'completion_rate';
  END IF;
  IF (v_analytics -> 'overview' ->> 'avg_wait_seconds')::numeric <> 600 THEN
    RAISE EXCEPTION 'PHASE8 FAIL: expected avg wait 600s, got %',
      v_analytics -> 'overview' ->> 'avg_wait_seconds';
  END IF;
  IF (v_analytics -> 'overview' ->> 'avg_service_seconds')::numeric <> 600 THEN
    RAISE EXCEPTION 'PHASE8 FAIL: expected avg service 600s, got %',
      v_analytics -> 'overview' ->> 'avg_service_seconds';
  END IF;

  IF jsonb_array_length(v_analytics -> 'trend') < 1 THEN
    RAISE EXCEPTION 'PHASE8 FAIL: trend missing';
  END IF;

  IF v_analytics -> 'busiest_day' IS NULL THEN
    RAISE EXCEPTION 'PHASE8 FAIL: busiest day missing';
  END IF;

  IF jsonb_array_length(v_analytics -> 'queues') <> 1 THEN
    RAISE EXCEPTION 'PHASE8 FAIL: expected one queue row';
  END IF;
  IF jsonb_array_length(v_analytics -> 'services') <> 1 THEN
    RAISE EXCEPTION 'PHASE8 FAIL: expected one service row';
  END IF;

  -- Business B isolation
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );
  SELECT * INTO v_business_b
  FROM public.create_business(
    'Phase 8 Salon B',
    'phase-8-b-' || substr(v_owner_b::text, 1, 8),
    'Salon', NULL, NULL, NULL
  );

  v_analytics := public.get_my_business_analytics(v_start, v_end);
  IF (v_analytics -> 'overview' ->> 'total_customers')::integer <> 0 THEN
    RAISE EXCEPTION 'PHASE8 FAIL: owner B saw A analytics';
  END IF;

  -- Invalid range
  denied := false;
  BEGIN
    PERFORM public.get_my_business_analytics(v_end, v_start);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE8 FAIL: invalid range accepted';
  END IF;

  -- Notification regression: cancel still enqueues cancelled when email present
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );
  SELECT * INTO v_join
  FROM public.join_queue(
    v_queue_a.id,
    'Notify Cancel',
    NULL,
    'phase8-cancel-' || substr(v_owner_a::text, 1, 8) || '@example.com'
  );
  PERFORM * FROM public.cancel_ticket(v_join.public_id, v_join.access_token);
  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_notifications n
    JOIN public.queue_entries e ON e.id = n.queue_entry_id
    WHERE e.public_id = v_join.public_id
      AND n.type = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'PHASE8 FAIL: cancel notification regression';
  END IF;

  RAISE NOTICE 'PHASE8 PASS: business analytics checks';
END;
$$;
