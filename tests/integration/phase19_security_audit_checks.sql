-- Phase 19 final security audit smoke checks (local).
-- No schema changes. Verifies cross-tenant and credential boundaries for release.
-- Run: npm run db:phase19-check

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
  v_join_b record;
  v_ticket record;
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
    'phase19-a-' || substr(v_owner_a::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner A"}'::jsonb, now(), now()
  ),
  (
    v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase19-b-' || substr(v_owner_b::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner B"}'::jsonb, now(), now()
  ),
  (
    v_staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase19-staff-' || substr(v_staff::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Staff"}'::jsonb, now(), now()
  );

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  denied := false;
  BEGIN
    PERFORM public.get_my_business_analytics(v_start, v_end);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE19 FAIL: anon read analytics';
  END IF;

  denied := false;
  BEGIN
    PERFORM * FROM public.get_my_business_queue_history(v_start, v_end);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE19 FAIL: anon read history';
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
    'Phase 19 Shop A',
    'phase-19-a-' || substr(v_owner_a::text, 1, 8),
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

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'Alice', NULL, NULL);
  SELECT * INTO v_join_b FROM public.join_queue(v_queue_a.id, 'Bob', NULL, NULL);

  SELECT * INTO v_ticket
  FROM public.get_ticket(v_join.public_id, v_join.access_token);

  IF to_jsonb(v_ticket) ? 'access_token'
     OR to_jsonb(v_ticket) ? 'access_token_hash'
     OR to_jsonb(v_ticket) ? 'token_hash' THEN
    RAISE EXCEPTION 'PHASE19 FAIL: get_ticket leaked credential fields';
  END IF;

  denied := false;
  BEGIN
    PERFORM * FROM public.get_ticket(v_join.public_id, v_join_b.access_token);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE19 FAIL: cross-ticket credential accepted';
  END IF;

  -- Owner B isolation
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_business_b
  FROM public.create_business(
    'Phase 19 Shop B',
    'phase-19-b-' || substr(v_owner_b::text, 1, 8),
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
    RAISE EXCEPTION 'PHASE19 FAIL: owner B called queue A';
  END IF;

  v_analytics := public.get_my_business_analytics(v_start, v_end);
  IF (v_analytics -> 'overview' ->> 'total_customers')::integer <> 0 THEN
    RAISE EXCEPTION 'PHASE19 FAIL: owner B saw A analytics volume';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.get_my_business_queue_history(v_start, v_end) h
    WHERE h.queue_name = 'Counter'
  ) THEN
    RAISE EXCEPTION 'PHASE19 FAIL: owner B history included business A queue';
  END IF;

  PERFORM public.update_my_business_settings(
    'Phase 19 Shop B Updated', NULL, NULL, NULL, NULL, 'minimal'
  );

  RESET ROLE;
  IF EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = v_business_a.id AND name = 'Phase 19 Shop B Updated'
  ) THEN
    RAISE EXCEPTION 'PHASE19 FAIL: owner B mutated business A settings';
  END IF;

  -- Staff of A cannot operate B; can operate A
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text,
    true
  );

  denied := false;
  BEGIN
    PERFORM * FROM public.call_next_entry(v_queue_b.id);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE19 FAIL: staff A called queue B';
  END IF;

  PERFORM * FROM public.call_next_entry(v_queue_a.id);

  denied := false;
  BEGIN
    PERFORM public.update_my_business_settings(
      'Staff Escalation', NULL, NULL, NULL, NULL, 'warm'
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE19 FAIL: staff updated settings';
  END IF;

  -- Anon cannot mutate entries directly
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  BEGIN
    UPDATE public.queue_entries SET customer_name = 'Hacked' WHERE queue_id = v_queue_a.id;
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN others THEN
      NULL;
  END;

  RESET ROLE;
  IF EXISTS (
    SELECT 1 FROM public.queue_entries
    WHERE queue_id = v_queue_a.id AND customer_name = 'Hacked'
  ) THEN
    RAISE EXCEPTION 'PHASE19 FAIL: anon updated queue_entries';
  END IF;

  RAISE NOTICE 'PHASE19 PASS';
END;
$$;
