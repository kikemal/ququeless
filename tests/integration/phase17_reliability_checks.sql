-- Phase 17 production reliability checks (local).
-- Run: npm run db:phase17-check
-- Focus: notification reclaim/exhaustion, claim races, transition independence,
-- call_next uniqueness, auth boundaries. Does not simulate multi-connection
-- concurrency beyond sequential SKIP LOCKED claims in one session.

DO $$
DECLARE
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
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
  v_entry_id uuid;
  v_entry_id2 uuid;
  v_notif_id uuid;
  v_status text;
  v_attempts integer;
  v_count integer;
  v_call_ids uuid[] := ARRAY[]::uuid[];
  denied boolean;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
  (
    v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase17-a-' || substr(v_owner_a::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner A"}'::jsonb, now(), now()
  ),
  (
    v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase17-b-' || substr(v_owner_b::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner B"}'::jsonb, now(), now()
  );

  -- Anonymous cannot claim staff notification path
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  denied := false;
  BEGIN
    PERFORM * FROM public.claim_customer_notifications_for_entry(gen_random_uuid());
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE17 FAIL: anon claimed entry notifications';
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
    'Phase 17 Shop A',
    'phase-17-a-' || substr(v_owner_a::text, 1, 8),
    'Retail', NULL, NULL, NULL
  );

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business_a.id, 'Help', 10, true)
  RETURNING * INTO v_service_a;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business_a.id, v_service_a.id, 'Counter', 'open')
  RETURNING * INTO v_queue_a;

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  SELECT * INTO v_join FROM public.join_queue(
    v_queue_a.id, 'Alice', NULL, 'alice17@example.com'
  );
  SELECT * INTO v_join2 FROM public.join_queue(
    v_queue_a.id, 'Bob', NULL, 'bob17@example.com'
  );
  SELECT * INTO v_join3 FROM public.join_queue(
    v_queue_a.id, 'Cara', NULL, 'cara17@example.com'
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );

  -- call_next uniqueness: two waiting guests → two distinct entry ids
  SELECT * INTO v_call FROM public.call_next_entry(v_queue_a.id);
  v_call_ids := array_append(v_call_ids, v_call.id);
  SELECT * INTO v_call FROM public.call_next_entry(v_queue_a.id);
  v_call_ids := array_append(v_call_ids, v_call.id);
  IF v_call_ids[1] = v_call_ids[2] THEN
    RAISE EXCEPTION 'PHASE17 FAIL: call_next returned the same entry twice';
  END IF;

  v_entry_id := v_call_ids[1];
  v_entry_id2 := v_call_ids[2];

  -- Transition succeeds even when notification is stuck pending (no delivery)
  SELECT c.id INTO v_notif_id
  FROM public.customer_notifications c
  WHERE c.queue_entry_id = v_entry_id AND c.type = 'called'
  LIMIT 1;

  IF v_notif_id IS NULL THEN
    RAISE EXCEPTION 'PHASE17 FAIL: expected called notification';
  END IF;

  SELECT status INTO v_status FROM public.customer_notifications WHERE id = v_notif_id;
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'PHASE17 FAIL: expected orphan pending notification';
  END IF;

  PERFORM * FROM public.transition_entry(v_entry_id, 'serving');
  PERFORM * FROM public.transition_entry(v_entry_id, 'completed');

  SELECT status INTO v_status FROM public.queue_entries WHERE id = v_entry_id;
  IF v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'PHASE17 FAIL: queue transition blocked by pending notification';
  END IF;

  -- Orphan pending remains claimable
  SELECT count(*) INTO v_count
  FROM public.claim_customer_notifications_for_entry(v_entry_id);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE17 FAIL: orphan pending was not claimable';
  END IF;

  -- Fresh sending must not be re-claimed
  SELECT count(*) INTO v_count
  FROM public.claim_customer_notifications_for_entry(v_entry_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE17 FAIL: fresh sending was re-claimed';
  END IF;

  -- Finalize as failed, then retry until attempt ceiling
  PERFORM public.finalize_customer_notification(
    v_notif_id, false, NULL, 'Delivery unavailable'
  );

  SELECT count(*) INTO v_count
  FROM public.claim_customer_notifications_for_entry(v_entry_id);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE17 FAIL: failed notification not reclaimed (attempt 2)';
  END IF;
  PERFORM public.finalize_customer_notification(
    v_notif_id, false, NULL, 'Delivery unavailable'
  );

  SELECT count(*) INTO v_count
  FROM public.claim_customer_notifications_for_entry(v_entry_id);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE17 FAIL: failed notification not reclaimed (attempt 3)';
  END IF;
  PERFORM public.finalize_customer_notification(
    v_notif_id, false, NULL, 'Delivery unavailable'
  );

  SELECT attempts, status INTO v_attempts, v_status
  FROM public.customer_notifications WHERE id = v_notif_id;
  IF v_attempts <> 3 OR v_status IS DISTINCT FROM 'failed' THEN
    RAISE EXCEPTION 'PHASE17 FAIL: expected attempts=3 failed, got % %', v_attempts, v_status;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.claim_customer_notifications_for_entry(v_entry_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE17 FAIL: exhausted notification was reclaimed';
  END IF;

  -- Exhausted stale sending → failed (not stuck)
  SELECT c.id INTO v_notif_id
  FROM public.customer_notifications c
  WHERE c.queue_entry_id = v_entry_id2 AND c.type = 'called'
  LIMIT 1;

  IF v_notif_id IS NULL THEN
    RAISE EXCEPTION 'PHASE17 FAIL: expected second called notification';
  END IF;

  RESET ROLE;
  UPDATE public.customer_notifications
  SET
    status = 'sending',
    attempts = 3,
    updated_at = now() - interval '10 minutes',
    last_error = 'worker crashed'
  WHERE id = v_notif_id;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO v_count
  FROM public.claim_customer_notifications_for_entry(v_entry_id2);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE17 FAIL: exhausted stale sending was reclaimed for send';
  END IF;

  SELECT status INTO v_status FROM public.customer_notifications WHERE id = v_notif_id;
  SELECT attempts INTO v_attempts FROM public.customer_notifications WHERE id = v_notif_id;
  IF v_status IS DISTINCT FROM 'failed' THEN
    RAISE EXCEPTION 'PHASE17 FAIL: exhausted stale sending not marked failed (got %)', v_status;
  END IF;
  IF v_attempts <> 3 THEN
    RAISE EXCEPTION 'PHASE17 FAIL: exhausted attempts mutated unexpectedly';
  END IF;

  -- Terminal double-transition rejected
  denied := false;
  BEGIN
    PERFORM * FROM public.transition_entry(v_entry_id, 'completed');
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE17 FAIL: completed entry accepted second complete';
  END IF;

  -- Customer ticket credentials cannot use staff claim RPC
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  denied := false;
  BEGIN
    PERFORM * FROM public.claim_customer_notifications_for_entry(v_entry_id2);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE17 FAIL: anon claimed via entry RPC';
  END IF;

  -- Cross-tenant claim denied
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_business_b
  FROM public.create_business(
    'Phase 17 Shop B',
    'phase-17-b-' || substr(v_owner_b::text, 1, 8),
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
    PERFORM * FROM public.claim_customer_notifications_for_entry(v_entry_id2);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE17 FAIL: owner B claimed owner A notifications';
  END IF;

  -- History RPC: anon denied
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  denied := false;
  BEGIN
    PERFORM * FROM public.get_my_business_queue_history(
      date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
      date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '1 day'
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE17 FAIL: anon read queue history';
  END IF;

  RAISE NOTICE 'PHASE17 PASS';
END;
$$;
