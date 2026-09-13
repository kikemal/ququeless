-- Phase 16 queue history checks (local).
-- Run: npx supabase db query --local -f tests/integration/phase16_queue_history_checks.sql

DO $$
DECLARE
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_business_a public.businesses%ROWTYPE;
  v_business_b public.businesses%ROWTYPE;
  v_service_a public.services%ROWTYPE;
  v_queue_a public.queues%ROWTYPE;
  v_queue_a2 public.queues%ROWTYPE;
  v_join record;
  v_join2 record;
  v_join3 record;
  v_call record;
  v_entry_id uuid;
  v_row record;
  v_count integer;
  denied boolean;
  v_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_end timestamptz := v_start + interval '1 day';
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
  (
    v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase16-a-' || substr(v_owner_a::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner A"}'::jsonb, now(), now()
  ),
  (
    v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase16-b-' || substr(v_owner_b::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner B"}'::jsonb, now(), now()
  ),
  (
    v_staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase16-staff-' || substr(v_staff::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Staff"}'::jsonb, now(), now()
  );

  -- Anonymous denied
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  denied := false;
  BEGIN
    PERFORM * FROM public.get_my_business_queue_history(v_start, v_end, NULL, NULL, 25, 0);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE16 FAIL: anon history access allowed';
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
    'Phase 16 Shop A',
    'phase-16-a-' || substr(v_owner_a::text, 1, 8),
    'Retail', NULL, NULL, NULL
  );

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business_a.id, 'Desk', 10, true)
  RETURNING * INTO v_service_a;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business_a.id, v_service_a.id, 'Main', 'open')
  RETURNING * INTO v_queue_a;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business_a.id, v_service_a.id, 'Express', 'open')
  RETURNING * INTO v_queue_a2;

  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (v_business_a.id, v_staff, 'staff');

  PERFORM public.update_my_business_operating_hours(
    'UTC',
    jsonb_build_array(
      jsonb_build_object('weekday', 1, 'is_closed', false, 'open_time', '00:00', 'close_time', '23:59'),
      jsonb_build_object('weekday', 2, 'is_closed', false, 'open_time', '00:00', 'close_time', '23:59'),
      jsonb_build_object('weekday', 3, 'is_closed', false, 'open_time', '00:00', 'close_time', '23:59'),
      jsonb_build_object('weekday', 4, 'is_closed', false, 'open_time', '00:00', 'close_time', '23:59'),
      jsonb_build_object('weekday', 5, 'is_closed', false, 'open_time', '00:00', 'close_time', '23:59'),
      jsonb_build_object('weekday', 6, 'is_closed', false, 'open_time', '00:00', 'close_time', '23:59'),
      jsonb_build_object('weekday', 7, 'is_closed', false, 'open_time', '00:00', 'close_time', '23:59')
    )
  );

  -- Waiting-only should not appear in history
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'WaitingOnly', NULL, NULL);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*)::integer INTO v_count
  FROM public.get_my_business_queue_history(v_start, v_end, NULL, NULL, 25, 0);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE16 FAIL: waiting ticket appeared in history';
  END IF;

  -- Clear waiting-only so later FIFO tests are deterministic
  SELECT id INTO v_entry_id FROM public.queue_entries WHERE public_id = v_join.public_id;
  PERFORM * FROM public.transition_entry(v_entry_id, 'skipped');

  -- Create terminal outcomes
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Alice', NULL, 'alice@example.com');
  SELECT * INTO v_join2 FROM public.join_queue(v_queue_a.id, 'Bob', NULL, NULL);
  SELECT * INTO v_join3 FROM public.join_queue(v_queue_a2.id, 'Cara', NULL, NULL);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text,
    true
  );

  -- Alice: call → serve → complete
  SELECT * INTO v_call FROM public.call_next_entry(v_queue_a.id);
  PERFORM * FROM public.transition_entry(v_call.id, 'serving');
  PERFORM * FROM public.transition_entry(v_call.id, 'completed');

  -- Bob: skip from waiting
  SELECT id INTO v_entry_id FROM public.queue_entries WHERE public_id = v_join2.public_id;
  PERFORM * FROM public.transition_entry(v_entry_id, 'skipped');

  -- Cara: call → no_show
  SELECT * INTO v_call FROM public.call_next_entry(v_queue_a2.id);
  PERFORM * FROM public.transition_entry(v_call.id, 'no_show');

  -- Cancelled via customer cancel on a new ticket
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Dana', NULL, NULL);
  PERFORM * FROM public.cancel_ticket(v_join.public_id, v_join.access_token);

  -- Staff can read history
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*)::integer INTO v_count
  FROM public.get_my_business_queue_history(v_start, v_end, NULL, NULL, 25, 0);
  IF v_count < 4 THEN
    RAISE EXCEPTION 'PHASE16 FAIL: expected terminal history rows, got %', v_count;
  END IF;

  -- Outcome filters
  SELECT count(*)::integer INTO v_count
  FROM public.get_my_business_queue_history(v_start, v_end, NULL, 'completed', 25, 0);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE16 FAIL: completed filter empty';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.get_my_business_queue_history(v_start, v_end, NULL, 'cancelled', 25, 0);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE16 FAIL: cancelled filter empty';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.get_my_business_queue_history(v_start, v_end, NULL, 'skipped', 25, 0);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE16 FAIL: skipped filter empty';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.get_my_business_queue_history(v_start, v_end, NULL, 'no_show', 25, 0);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE16 FAIL: no_show filter empty';
  END IF;

  -- Queue filter
  SELECT count(*)::integer INTO v_count
  FROM public.get_my_business_queue_history(v_start, v_end, v_queue_a2.id, NULL, 25, 0);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE16 FAIL: queue filter empty';
  END IF;

  -- Newest-first + no secrets in row
  SELECT * INTO v_row
  FROM public.get_my_business_queue_history(v_start, v_end, NULL, NULL, 1, 0);
  IF v_row.total_count IS NULL OR v_row.total_count < 4 THEN
    RAISE EXCEPTION 'PHASE16 FAIL: total_count missing';
  END IF;
  IF to_jsonb(v_row) ? 'access_token' OR to_jsonb(v_row) ? 'access_token_hash' THEN
    RAISE EXCEPTION 'PHASE16 FAIL: token fields leaked';
  END IF;
  IF to_jsonb(v_row) ? 'token_hash' OR to_jsonb(v_row) ? 'business_id' THEN
    RAISE EXCEPTION 'PHASE16 FAIL: forbidden fields leaked';
  END IF;

  -- Pagination: page 2 with limit 1
  SELECT count(*)::integer INTO v_count
  FROM public.get_my_business_queue_history(v_start, v_end, NULL, NULL, 1, 1);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'PHASE16 FAIL: offset pagination failed';
  END IF;

  -- Invalid outcome rejected
  denied := false;
  BEGIN
    PERFORM * FROM public.get_my_business_queue_history(v_start, v_end, NULL, 'waiting', 25, 0);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE16 FAIL: invalid outcome accepted';
  END IF;

  -- Client-supplied foreign queue_id rejected
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );
  SELECT * INTO v_business_b
  FROM public.create_business(
    'Phase 16 Shop B',
    'phase-16-b-' || substr(v_owner_b::text, 1, 8),
    'Retail', NULL, NULL, NULL
  );

  denied := false;
  BEGIN
    PERFORM * FROM public.get_my_business_queue_history(
      v_start, v_end, v_queue_a.id, NULL, 25, 0
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE16 FAIL: foreign queue_id accepted for owner B';
  END IF;

  -- Owner B cannot see business A history (empty for own empty business)
  SELECT count(*)::integer INTO v_count
  FROM public.get_my_business_queue_history(v_start, v_end, NULL, NULL, 25, 0);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE16 FAIL: owner B saw foreign history';
  END IF;

  -- Customer ticket credentials cannot call history (anon already denied).
  -- Extra: authenticated stranger with no membership denied.
  -- (owner B has membership on B, so use a fresh check via empty result above)

  -- Owner A can still read own history
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );
  SELECT count(*)::integer INTO v_count
  FROM public.get_my_business_queue_history(v_start, v_end, NULL, NULL, 25, 0);
  IF v_count < 4 THEN
    RAISE EXCEPTION 'PHASE16 FAIL: owner A lost history access';
  END IF;

  RAISE NOTICE 'PHASE16 PASS: queue history checks ok';
END;
$$;
