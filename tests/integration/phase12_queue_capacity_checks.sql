-- Phase 12 queue capacity / admission control checks (local).
-- Waiting = entry_status 'waiting' only.
-- Run: npx supabase db query --local -f tests/integration/phase12_queue_capacity_checks.sql

DO $$
DECLARE
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_business_a public.businesses%ROWTYPE;
  v_business_b public.businesses%ROWTYPE;
  v_service_a public.services%ROWTYPE;
  v_queue_a public.queues%ROWTYPE;
  v_queue_unlimited public.queues%ROWTYPE;
  v_join record;
  v_call record;
  v_public record;
  v_waiting integer;
  denied boolean;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
  (
    v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase12-a-' || substr(v_owner_a::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner A"}'::jsonb, now(), now()
  ),
  (
    v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase12-b-' || substr(v_owner_b::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner B"}'::jsonb, now(), now()
  );

  -- Anon cannot update capacity
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  denied := false;
  BEGIN
    UPDATE public.queues SET max_waiting_customers = 1;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    -- RLS may allow 0 rows updated without error
    IF EXISTS (SELECT 1 FROM public.queues WHERE max_waiting_customers = 1) THEN
      RAISE EXCEPTION 'PHASE12 FAIL: anon mutated capacity';
    END IF;
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
    'Phase 12 Shop A',
    'phase-12-a-' || substr(v_owner_a::text, 1, 8),
    'Retail', NULL, NULL, NULL
  );

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business_a.id, 'Desk', 10, true)
  RETURNING * INTO v_service_a;

  INSERT INTO public.queues (business_id, service_id, name, status, max_waiting_customers)
  VALUES (v_business_a.id, v_service_a.id, 'Limited', 'open', 3)
  RETURNING * INTO v_queue_a;

  INSERT INTO public.queues (business_id, service_id, name, status, max_waiting_customers)
  VALUES (v_business_a.id, v_service_a.id, 'Unlimited', 'open', NULL)
  RETURNING * INTO v_queue_unlimited;

  -- Invalid capacity rejected by constraint
  denied := false;
  BEGIN
    UPDATE public.queues SET max_waiting_customers = 0 WHERE id = v_queue_a.id;
  EXCEPTION WHEN check_violation THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE12 FAIL: zero capacity accepted';
  END IF;

  -- Under capacity: 2 of 3 succeed
  PERFORM * FROM public.join_queue(v_queue_a.id, 'A1', NULL, NULL);
  PERFORM * FROM public.join_queue(v_queue_a.id, 'A2', NULL, NULL);

  SELECT count(*)::integer INTO v_waiting
  FROM public.queue_entries
  WHERE queue_id = v_queue_a.id AND status = 'waiting';
  IF v_waiting <> 2 THEN
    RAISE EXCEPTION 'PHASE12 FAIL: expected 2 waiting';
  END IF;

  -- Fill to capacity
  PERFORM * FROM public.join_queue(v_queue_a.id, 'A3', NULL, NULL);

  denied := false;
  BEGIN
    PERFORM * FROM public.join_queue(v_queue_a.id, 'A4', NULL, NULL);
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE '%queue is full%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE12 FAIL: join beyond capacity succeeded';
  END IF;

  SELECT count(*)::integer INTO v_waiting
  FROM public.queue_entries
  WHERE queue_id = v_queue_a.id AND status = 'waiting';
  IF v_waiting <> 3 THEN
    RAISE EXCEPTION 'PHASE12 FAIL: waiting exceeded capacity (% > 3)', v_waiting;
  END IF;

  -- Free a slot by calling next (waiting → called)
  SELECT * INTO v_call FROM public.call_next_entry(v_queue_a.id);
  SELECT count(*)::integer INTO v_waiting
  FROM public.queue_entries
  WHERE queue_id = v_queue_a.id AND status = 'waiting';
  IF v_waiting <> 2 THEN
    RAISE EXCEPTION 'PHASE12 FAIL: call_next did not free waiting capacity';
  END IF;

  -- Refill to capacity, then prove cancel frees a slot
  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'A5', NULL, NULL);

  denied := false;
  BEGIN
    PERFORM * FROM public.join_queue(v_queue_a.id, 'A6', NULL, NULL);
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE '%queue is full%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE12 FAIL: expected full after refill';
  END IF;

  PERFORM * FROM public.cancel_ticket(v_join.public_id, v_join.access_token);
  PERFORM * FROM public.join_queue(v_queue_a.id, 'A7', NULL, NULL);

  -- Unlimited still accepts
  PERFORM * FROM public.join_queue(v_queue_unlimited.id, 'U1', NULL, NULL);
  PERFORM * FROM public.join_queue(v_queue_unlimited.id, 'U2', NULL, NULL);

  -- Public RPC exposes waiting_count / max, not private columns
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  SELECT * INTO v_public
  FROM public.get_public_queues(v_business_a.slug)
  WHERE queue_id = v_queue_a.id;

  IF v_public.max_waiting_customers IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'PHASE12 FAIL: public max_waiting_customers missing';
  END IF;
  IF v_public.waiting_count IS NULL OR v_public.waiting_count < 1 THEN
    RAISE EXCEPTION 'PHASE12 FAIL: public waiting_count missing';
  END IF;

  -- Cross-tenant: owner B cannot change A capacity
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_business_b
  FROM public.create_business(
    'Phase 12 Shop B',
    'phase-12-b-' || substr(v_owner_b::text, 1, 8),
    'Retail', NULL, NULL, NULL
  );

  UPDATE public.queues
  SET max_waiting_customers = 99
  WHERE id = v_queue_a.id;

  RESET ROLE;
  IF EXISTS (
    SELECT 1 FROM public.queues
    WHERE id = v_queue_a.id AND max_waiting_customers = 99
  ) THEN
    RAISE EXCEPTION 'PHASE12 FAIL: owner B changed A capacity';
  END IF;

  -- Documented concurrency model: join_queue locks the queue row (FOR UPDATE)
  -- before counting waiting entries, so concurrent joins serialize on that lock.
  -- This suite verifies the invariant waiting <= max after sequential pressure.

  RAISE NOTICE 'PHASE12 PASS: queue capacity checks succeeded';
END;
$$;
