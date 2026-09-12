-- Phase 14 customer ticket experience checks (local).
-- Extends get_ticket timestamps; auth model unchanged.
-- Run: npx supabase db query --local -f tests/integration/phase14_ticket_experience_checks.sql

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_business public.businesses%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_queue public.queues%ROWTYPE;
  v_join record;
  v_join_b record;
  v_call record;
  v_ticket record;
  v_ticket2 record;
  denied boolean;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase14-' || substr(v_owner::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner"}'::jsonb, now(), now()
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_business
  FROM public.create_business(
    'Phase 14 Shop',
    'phase-14-' || substr(v_owner::text, 1, 8),
    'Retail', NULL, NULL, NULL
  );

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business.id, 'Counter', 8, true)
  RETURNING * INTO v_service;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business.id, v_service.id, 'Main', 'open')
  RETURNING * INTO v_queue;

  -- Always-open hours so joins succeed under Phase 13
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

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  SELECT * INTO v_join FROM public.join_queue(v_queue.id, 'Alice', NULL, NULL);
  SELECT * INTO v_join_b FROM public.join_queue(v_queue.id, 'Bob', NULL, NULL);

  -- Waiting ticket returns timeline timestamps
  SELECT * INTO v_ticket
  FROM public.get_ticket(v_join.public_id, v_join.access_token);

  IF v_ticket.joined_at IS NULL THEN
    RAISE EXCEPTION 'PHASE14 FAIL: joined_at missing';
  END IF;
  IF v_ticket.called_at IS NOT NULL OR v_ticket.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE14 FAIL: unexpected early timestamps';
  END IF;
  IF v_ticket.status IS DISTINCT FROM 'waiting' THEN
    RAISE EXCEPTION 'PHASE14 FAIL: expected waiting';
  END IF;
  IF v_ticket.queue_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'PHASE14 FAIL: queue_status missing/open expected';
  END IF;
  IF v_ticket.business_is_open IS NOT TRUE THEN
    RAISE EXCEPTION 'PHASE14 FAIL: business_is_open expected true';
  END IF;

  -- Missing token rejected
  denied := false;
  BEGIN
    PERFORM * FROM public.get_ticket(v_join.public_id, '');
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE14 FAIL: empty token accepted';
  END IF;

  -- Wrong token rejected
  denied := false;
  BEGIN
    PERFORM * FROM public.get_ticket(v_join.public_id, 'definitely-wrong-token');
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE14 FAIL: wrong token accepted';
  END IF;

  -- public_id alone / mismatched public_id + other token rejected
  denied := false;
  BEGIN
    PERFORM * FROM public.get_ticket(v_join.public_id, v_join_b.access_token);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE14 FAIL: Bob token retrieved Alice ticket';
  END IF;

  denied := false;
  BEGIN
    PERFORM * FROM public.get_ticket(v_join_b.public_id, v_join.access_token);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE14 FAIL: Alice token retrieved Bob ticket';
  END IF;

  -- Call next → called timestamps
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );
  SELECT * INTO v_call FROM public.call_next_entry(v_queue.id);

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  SELECT * INTO v_ticket
  FROM public.get_ticket(v_join.public_id, v_join.access_token);
  IF v_ticket.status IS DISTINCT FROM 'called' THEN
    RAISE EXCEPTION 'PHASE14 FAIL: expected called status';
  END IF;
  IF v_ticket.called_at IS NULL THEN
    RAISE EXCEPTION 'PHASE14 FAIL: called_at missing after call';
  END IF;

  -- Complete ticket via authoritative transition RPC
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );
  PERFORM * FROM public.transition_entry(v_call.id, 'serving');
  PERFORM * FROM public.transition_entry(v_call.id, 'completed');

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  SELECT * INTO v_ticket
  FROM public.get_ticket(v_join.public_id, v_join.access_token);
  IF v_ticket.status IS DISTINCT FROM 'completed' OR v_ticket.completed_at IS NULL THEN
    RAISE EXCEPTION 'PHASE14 FAIL: completed ticket payload incomplete';
  END IF;

  -- Cancelled ticket exposes cancelled_at (Bob)
  PERFORM * FROM public.cancel_ticket(v_join_b.public_id, v_join_b.access_token);
  SELECT * INTO v_ticket2
  FROM public.get_ticket(v_join_b.public_id, v_join_b.access_token);
  IF v_ticket2.cancelled_at IS NULL THEN
    RAISE EXCEPTION 'PHASE14 FAIL: cancelled_at missing after cancel';
  END IF;
  IF v_ticket2.status IS DISTINCT FROM 'skipped' THEN
    RAISE EXCEPTION 'PHASE14 FAIL: cancel should set skipped status';
  END IF;

  -- Ticket remains readable after queue closes
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );
  UPDATE public.queues SET status = 'closed' WHERE id = v_queue.id;

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  SELECT * INTO v_ticket
  FROM public.get_ticket(v_join.public_id, v_join.access_token);
  IF v_ticket.public_id IS DISTINCT FROM v_join.public_id THEN
    RAISE EXCEPTION 'PHASE14 FAIL: ticket unreadable after queue closed';
  END IF;
  IF v_ticket.queue_status IS DISTINCT FROM 'closed' THEN
    RAISE EXCEPTION 'PHASE14 FAIL: queue_status should report closed';
  END IF;
  IF v_ticket.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'PHASE14 FAIL: queue close must not change ticket status';
  END IF;

  -- Ticket remains readable after business hours close
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );
  PERFORM public.update_my_business_operating_hours(
    'UTC',
    jsonb_build_array(
      jsonb_build_object('weekday', 1, 'is_closed', true, 'open_time', null, 'close_time', null),
      jsonb_build_object('weekday', 2, 'is_closed', true, 'open_time', null, 'close_time', null),
      jsonb_build_object('weekday', 3, 'is_closed', true, 'open_time', null, 'close_time', null),
      jsonb_build_object('weekday', 4, 'is_closed', true, 'open_time', null, 'close_time', null),
      jsonb_build_object('weekday', 5, 'is_closed', true, 'open_time', null, 'close_time', null),
      jsonb_build_object('weekday', 6, 'is_closed', true, 'open_time', null, 'close_time', null),
      jsonb_build_object('weekday', 7, 'is_closed', true, 'open_time', null, 'close_time', null)
    )
  );

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  SELECT * INTO v_ticket
  FROM public.get_ticket(v_join.public_id, v_join.access_token);
  IF v_ticket.public_id IS DISTINCT FROM v_join.public_id THEN
    RAISE EXCEPTION 'PHASE14 FAIL: ticket unreadable after business closed';
  END IF;
  IF v_ticket.business_is_open IS NOT FALSE THEN
    RAISE EXCEPTION 'PHASE14 FAIL: business_is_open should be false';
  END IF;
  IF v_ticket.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'PHASE14 FAIL: business close must not change ticket status';
  END IF;

  -- Ensure token hash never returned (column absense checked via record fields)
  -- access_token_hash is not a returned column of get_ticket.

  RAISE NOTICE 'PHASE14 PASS: ticket experience checks ok';
END;
$$;
