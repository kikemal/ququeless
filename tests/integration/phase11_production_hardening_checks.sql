-- Phase 11 production hardening checks (local).
-- Run: npx supabase db query --local -f tests/integration/phase11_production_hardening_checks.sql

DO $$
DECLARE
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_business_a public.businesses%ROWTYPE;
  v_business_b public.businesses%ROWTYPE;
  v_service_a public.services%ROWTYPE;
  v_service_b public.services%ROWTYPE;
  v_queue_a public.queues%ROWTYPE;
  v_queue_b public.queues%ROWTYPE;
  v_join record;
  v_join2 record;
  v_join3 record;
  v_call record;
  v_call_ids uuid[] := ARRAY[]::uuid[];
  v_ticket record;
  v_entry_id uuid;
  v_notif_id uuid;
  v_count integer;
  v_numbers integer[];
  v_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_end timestamptz := v_start + interval '1 day';
  v_analytics jsonb;
  denied boolean;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
  (
    v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase11-a-' || substr(v_owner_a::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner A"}'::jsonb, now(), now()
  ),
  (
    v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase11-b-' || substr(v_owner_b::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner B"}'::jsonb, now(), now()
  ),
  (
    v_staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase11-staff-' || substr(v_staff::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Staff"}'::jsonb, now(), now()
  );

  -- Anonymous denied analytics / settings
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  denied := false;
  BEGIN
    PERFORM public.get_my_business_analytics(v_start, v_end);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE11 FAIL: anon could read analytics';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.update_my_business_settings('Hacked', NULL, NULL, NULL, NULL, 'default');
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE11 FAIL: anon could update settings';
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
    'Phase 11 Shop A',
    'phase-11-a-' || substr(v_owner_a::text, 1, 8),
    'Retail', NULL, NULL, NULL
  );

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business_a.id, 'Help', 10, true)
  RETURNING * INTO v_service_a;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business_a.id, v_service_a.id, 'Counter', 'open')
  RETURNING * INTO v_queue_a;

  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (v_business_a.id, v_staff, 'staff');

  -- Unique queue numbers under repeated joins
  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Guest 1', NULL, NULL);
  SELECT * INTO v_join2 FROM public.join_queue(v_queue_a.id, 'Guest 2', NULL, NULL);
  SELECT * INTO v_join3 FROM public.join_queue(
    v_queue_a.id,
    'Guest 3',
    NULL,
    'guest3+' || substr(v_owner_a::text, 1, 6) || '@example.com'
  );

  SELECT array_agg(queue_number ORDER BY queue_number)
  INTO v_numbers
  FROM public.queue_entries
  WHERE queue_id = v_queue_a.id;

  IF v_numbers IS DISTINCT FROM ARRAY[v_join.queue_number, v_join2.queue_number, v_join3.queue_number] THEN
    RAISE EXCEPTION 'PHASE11 FAIL: unexpected queue numbers %', v_numbers;
  END IF;
  IF v_join.queue_number = v_join2.queue_number
     OR v_join.queue_number = v_join3.queue_number
     OR v_join2.queue_number = v_join3.queue_number THEN
    RAISE EXCEPTION 'PHASE11 FAIL: duplicate queue numbers';
  END IF;

  -- FIFO call-next yields distinct entries; no double-call of same entry
  SELECT * INTO v_call FROM public.call_next_entry(v_queue_a.id);
  v_call_ids := v_call_ids || v_call.id;
  SELECT * INTO v_call FROM public.call_next_entry(v_queue_a.id);
  v_call_ids := v_call_ids || v_call.id;
  SELECT * INTO v_call FROM public.call_next_entry(v_queue_a.id);
  v_call_ids := v_call_ids || v_call.id;

  IF cardinality(v_call_ids) <> 3
     OR v_call_ids[1] = v_call_ids[2]
     OR v_call_ids[1] = v_call_ids[3]
     OR v_call_ids[2] = v_call_ids[3] THEN
    RAISE EXCEPTION 'PHASE11 FAIL: call_next duplicated entries';
  END IF;

  denied := false;
  BEGIN
    PERFORM * FROM public.call_next_entry(v_queue_a.id);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE11 FAIL: call_next should fail when empty';
  END IF;

  -- Impossible transition rejected
  denied := false;
  BEGIN
    PERFORM * FROM public.transition_entry(v_call_ids[1], 'waiting');
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE11 FAIL: invalid transition allowed';
  END IF;

  -- Whitespace-padded token still works for get_ticket / cancel (trim hardening)
  SELECT * INTO v_join
  FROM public.join_queue(v_queue_a.id, 'Pad Token', NULL, NULL);

  SELECT * INTO v_ticket
  FROM public.get_ticket(v_join.public_id, '  ' || v_join.access_token || '  ');
  IF v_ticket.public_id IS DISTINCT FROM v_join.public_id THEN
    RAISE EXCEPTION 'PHASE11 FAIL: padded token rejected by get_ticket';
  END IF;

  PERFORM * FROM public.cancel_ticket(v_join.public_id, '  ' || v_join.access_token || '  ');
  IF NOT EXISTS (
    SELECT 1 FROM public.queue_entries
    WHERE public_id = v_join.public_id AND cancelled_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PHASE11 FAIL: padded token cancel failed';
  END IF;

  -- Wrong token cannot access another customer's ticket
  denied := false;
  BEGIN
    PERFORM * FROM public.get_ticket(v_join.public_id, v_join2.access_token);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE11 FAIL: cross-ticket credential accepted';
  END IF;

  -- Stale sending reclaim
  SELECT e.id INTO v_entry_id
  FROM public.queue_entries e
  WHERE e.public_id = v_join3.public_id;

  -- ensure a called notification exists for guest 3
  SELECT c.id INTO v_notif_id
  FROM public.customer_notifications c
  WHERE c.queue_entry_id = v_entry_id AND c.type = 'called'
  LIMIT 1;

  IF v_notif_id IS NULL THEN
    RAISE EXCEPTION 'PHASE11 FAIL: expected called notification';
  END IF;

  -- Fresh claim
  SELECT count(*) INTO v_count
  FROM public.claim_customer_notifications_for_entry(v_entry_id);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE11 FAIL: initial claim empty';
  END IF;

  -- Second claim while fresh 'sending' must not re-claim
  SELECT count(*) INTO v_count
  FROM public.claim_customer_notifications_for_entry(v_entry_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE11 FAIL: fresh sending row was re-claimed';
  END IF;

  -- Simulate crash: age the sending row, then reclaim
  RESET ROLE;
  UPDATE public.customer_notifications
  SET updated_at = now() - interval '10 minutes', status = 'sending'
  WHERE id = v_notif_id;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO v_count
  FROM public.claim_customer_notifications_for_entry(v_entry_id);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE11 FAIL: stale sending was not reclaimed';
  END IF;

  -- Cross-tenant isolation matrix
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_business_b
  FROM public.create_business(
    'Phase 11 Shop B',
    'phase-11-b-' || substr(v_owner_b::text, 1, 8),
    'Retail', NULL, NULL, NULL
  );

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business_b.id, 'Help B', 10, true)
  RETURNING * INTO v_service_b;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business_b.id, v_service_b.id, 'Counter B', 'open')
  RETURNING * INTO v_queue_b;

  denied := false;
  BEGIN
    PERFORM * FROM public.call_next_entry(v_queue_a.id);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE11 FAIL: owner B called queue A';
  END IF;

  denied := false;
  BEGIN
    PERFORM * FROM public.claim_customer_notifications_for_entry(v_entry_id);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE11 FAIL: owner B claimed A notifications';
  END IF;

  v_analytics := public.get_my_business_analytics(v_start, v_end);
  IF (v_analytics -> 'overview' ->> 'total_customers')::integer <> 0 THEN
    RAISE EXCEPTION 'PHASE11 FAIL: owner B saw A analytics volume';
  END IF;

  PERFORM public.update_my_business_settings(
    'Phase 11 Shop B Updated', NULL, NULL, NULL, NULL, 'minimal'
  );

  RESET ROLE;
  IF EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = v_business_a.id AND name = 'Phase 11 Shop B Updated'
  ) THEN
    RAISE EXCEPTION 'PHASE11 FAIL: owner B mutated business A settings';
  END IF;

  -- Staff of A cannot update settings
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text,
    true
  );
  denied := false;
  BEGIN
    PERFORM public.update_my_business_settings('Staff Escalation', NULL, NULL, NULL, NULL, 'warm');
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE11 FAIL: staff updated settings';
  END IF;

  -- Staff can still call next on own business queue (after re-joining customers)
  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Staff Call Guest', NULL, NULL);
  PERFORM * FROM public.call_next_entry(v_queue_a.id);

  -- Anon public RPC must not expose private business columns
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SELECT count(*) INTO v_count FROM public.get_public_queues(v_business_a.slug);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE11 FAIL: public queues missing';
  END IF;

  denied := false;
  BEGIN
    PERFORM * FROM public.claim_customer_notifications_for_entry(v_entry_id);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE11 FAIL: anon claimed notifications';
  END IF;

  RAISE NOTICE 'PHASE11 PASS: production hardening checks succeeded';
END;
$$;
