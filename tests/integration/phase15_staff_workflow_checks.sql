-- Phase 15 staff queue workflow checks (local).
-- Reuses call_next_entry / transition_entry — no schema changes.
-- Run: npx supabase db query --local -f tests/integration/phase15_staff_workflow_checks.sql

DO $$
DECLARE
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_business_a public.businesses%ROWTYPE;
  v_business_b public.businesses%ROWTYPE;
  v_service_a public.services%ROWTYPE;
  v_queue_a public.queues%ROWTYPE;
  v_queue_b public.queues%ROWTYPE;
  v_join record;
  v_join2 record;
  v_call record;
  v_entry public.queue_entries%ROWTYPE;
  v_ticket record;
  denied boolean;
  v_visible integer;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
  (
    v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase15-a-' || substr(v_owner_a::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner A"}'::jsonb, now(), now()
  ),
  (
    v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase15-b-' || substr(v_owner_b::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner B"}'::jsonb, now(), now()
  ),
  (
    v_staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase15-staff-' || substr(v_staff::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Staff"}'::jsonb, now(), now()
  ),
  (
    v_stranger, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase15-stranger-' || substr(v_stranger::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Stranger"}'::jsonb, now(), now()
  );

  -- Anonymous denied
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  denied := false;
  BEGIN
    PERFORM * FROM public.call_next_entry('00000000-0000-0000-0000-000000000001');
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE15 FAIL: anon call_next allowed';
  END IF;

  denied := false;
  BEGIN
    PERFORM * FROM public.transition_entry(
      '00000000-0000-0000-0000-000000000001',
      'completed'
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE15 FAIL: anon transition allowed';
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
    'Phase 15 Shop A',
    'phase-15-a-' || substr(v_owner_a::text, 1, 8),
    'Retail', NULL, NULL, NULL
  );

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business_a.id, 'Desk', 10, true)
  RETURNING * INTO v_service_a;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business_a.id, v_service_a.id, 'Main', 'open')
  RETURNING * INTO v_queue_a;

  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (v_business_a.id, v_staff, 'staff');

  -- Always-open hours for joins
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

  -- Empty waiting → call_next fails
  denied := false;
  BEGIN
    PERFORM * FROM public.call_next_entry(v_queue_a.id);
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE '%no waiting%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE15 FAIL: call_next on empty queue succeeded';
  END IF;

  -- Customers join as anon
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Alice', NULL, NULL);
  SELECT * INTO v_join2 FROM public.join_queue(v_queue_a.id, 'Bob', NULL, NULL);

  -- Customer (anon) cannot call_next / transition
  denied := false;
  BEGIN
    PERFORM * FROM public.call_next_entry(v_queue_a.id);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE15 FAIL: customer/anon call_next succeeded';
  END IF;

  -- Privileged lookup of entry id via business member (column-level SELECT only)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );
  SELECT id INTO v_entry.id FROM public.queue_entries WHERE public_id = v_join.public_id;

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  denied := false;
  BEGIN
    PERFORM * FROM public.transition_entry(v_entry.id, 'skipped');
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE15 FAIL: customer transition succeeded';
  END IF;

  -- Staff can call next (FIFO)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text,
    true
  );
  SELECT * INTO v_call FROM public.call_next_entry(v_queue_a.id);
  IF v_call.queue_number IS DISTINCT FROM v_join.queue_number THEN
    RAISE EXCEPTION 'PHASE15 FAIL: call_next not FIFO';
  END IF;
  IF v_call.status IS DISTINCT FROM 'called' THEN
    RAISE EXCEPTION 'PHASE15 FAIL: expected called';
  END IF;

  -- Customer ticket reflects called (Phase 14 regression)
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SELECT * INTO v_ticket FROM public.get_ticket(v_join.public_id, v_join.access_token);
  IF v_ticket.status IS DISTINCT FROM 'called' OR v_ticket.called_at IS NULL THEN
    RAISE EXCEPTION 'PHASE15 FAIL: customer ticket not updated after call';
  END IF;

  -- Staff: serving → complete
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text,
    true
  );
  PERFORM * FROM public.transition_entry(v_call.id, 'serving');
  PERFORM * FROM public.transition_entry(v_call.id, 'completed');

  SELECT status, completed_at INTO v_entry.status, v_entry.completed_at
  FROM public.queue_entries WHERE id = v_call.id;
  IF v_entry.status IS DISTINCT FROM 'completed' OR v_entry.completed_at IS NULL THEN
    RAISE EXCEPTION 'PHASE15 FAIL: completion failed';
  END IF;

  -- Repeated complete fails safely
  denied := false;
  BEGIN
    PERFORM * FROM public.transition_entry(v_call.id, 'completed');
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE15 FAIL: duplicate complete succeeded';
  END IF;

  -- Skip waiting customer
  SELECT id INTO v_entry.id FROM public.queue_entries WHERE public_id = v_join2.public_id;
  PERFORM * FROM public.transition_entry(v_entry.id, 'skipped');
  SELECT status INTO v_entry.status FROM public.queue_entries WHERE id = v_entry.id;
  IF v_entry.status IS DISTINCT FROM 'skipped' THEN
    RAISE EXCEPTION 'PHASE15 FAIL: skip from waiting failed';
  END IF;

  -- New join for no-show path: call → no_show
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Cara', NULL, NULL);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text,
    true
  );
  SELECT * INTO v_call FROM public.call_next_entry(v_queue_a.id);
  PERFORM * FROM public.transition_entry(v_call.id, 'no_show');
  SELECT status INTO v_entry.status FROM public.queue_entries WHERE id = v_call.id;
  IF v_entry.status IS DISTINCT FROM 'no_show' THEN
    RAISE EXCEPTION 'PHASE15 FAIL: no_show failed';
  END IF;

  -- serving → no_show
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Dan', NULL, NULL);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text,
    true
  );
  SELECT * INTO v_call FROM public.call_next_entry(v_queue_a.id);
  PERFORM * FROM public.transition_entry(v_call.id, 'serving');
  PERFORM * FROM public.transition_entry(v_call.id, 'no_show');
  SELECT status INTO v_entry.status FROM public.queue_entries WHERE id = v_call.id;
  IF v_entry.status IS DISTINCT FROM 'no_show' THEN
    RAISE EXCEPTION 'PHASE15 FAIL: serving→no_show failed';
  END IF;

  -- Paused / closed call_next denied
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );
  UPDATE public.queues SET status = 'open' WHERE id = v_queue_a.id;

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Eve', NULL, NULL);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );
  UPDATE public.queues SET status = 'paused' WHERE id = v_queue_a.id;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text,
    true
  );

  denied := false;
  BEGIN
    PERFORM * FROM public.call_next_entry(v_queue_a.id);
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE '%not open%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE15 FAIL: call_next while paused succeeded';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );
  UPDATE public.queues SET status = 'closed' WHERE id = v_queue_a.id;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text,
    true
  );
  denied := false;
  BEGIN
    PERFORM * FROM public.call_next_entry(v_queue_a.id);
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE '%not open%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE15 FAIL: call_next while closed succeeded';
  END IF;

  -- Ticket still readable after queue closed (status unchanged for Eve waiting)
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SELECT * INTO v_ticket FROM public.get_ticket(v_join.public_id, v_join.access_token);
  IF v_ticket.status IS DISTINCT FROM 'waiting' THEN
    RAISE EXCEPTION 'PHASE15 FAIL: closing queue changed ticket status';
  END IF;

  -- Cross-tenant: owner B cannot call_next on A
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );
  SELECT * INTO v_business_b
  FROM public.create_business(
    'Phase 15 Shop B',
    'phase-15-b-' || substr(v_owner_b::text, 1, 8),
    'Retail', NULL, NULL, NULL
  );
  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business_b.id, 'Desk B', 10, true)
  RETURNING * INTO v_service_a;
  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business_b.id, v_service_a.id, 'Main B', 'open')
  RETURNING * INTO v_queue_b;

  denied := false;
  BEGIN
    PERFORM * FROM public.call_next_entry(v_queue_a.id);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE15 FAIL: owner B call_next on A succeeded';
  END IF;

  -- Unauthorized authenticated user (no membership) denied
  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text,
    true
  );
  denied := false;
  BEGIN
    PERFORM * FROM public.call_next_entry(v_queue_a.id);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE15 FAIL: stranger call_next succeeded';
  END IF;

  -- Direct table mutation denied / ineffective for owner B (no UPDATE grant; RLS)
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );

  denied := false;
  BEGIN
    UPDATE public.queue_entries SET status = 'completed'
    WHERE public_id = v_join.public_id;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;

  IF NOT denied THEN
    -- Some setups allow the statement but RLS updates 0 rows
    SELECT count(*)::integer INTO v_visible
    FROM public.queue_entries
    WHERE public_id = v_join.public_id;
    IF v_visible <> 0 THEN
      RAISE EXCEPTION 'PHASE15 FAIL: owner B can see business A entries';
    END IF;
  END IF;

  -- Confirm Eve still waiting via member path
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text,
    true
  );
  SELECT status INTO v_entry.status
  FROM public.queue_entries
  WHERE public_id = v_join.public_id;
  IF v_entry.status IS DISTINCT FROM 'waiting' THEN
    RAISE EXCEPTION 'PHASE15 FAIL: Eve ticket status corrupted by cross-tenant attempt';
  END IF;

  RAISE NOTICE 'PHASE15 PASS: staff workflow checks ok';
END;
$$;
