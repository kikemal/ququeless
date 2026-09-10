-- Phase 3 services + queues checks (local).
-- Run: npx supabase db query --local -f tests/integration/phase3_services_queues_checks.sql

DO $$
DECLARE
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_business_a public.businesses%ROWTYPE;
  v_business_b public.businesses%ROWTYPE;
  v_service_a public.services%ROWTYPE;
  v_service_b public.services%ROWTYPE;
  v_queue public.queues%ROWTYPE;
  v_count integer;
  denied boolean;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
  (
    v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase3-a-' || substr(v_owner_a::text, 1, 8) || '@example.com', crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner A"}'::jsonb, now(), now()
  ),
  (
    v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase3-b-' || substr(v_owner_b::text, 1, 8) || '@example.com', crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner B"}'::jsonb, now(), now()
  );

  -- Owner A creates business + service + queue
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT * INTO v_business_a
  FROM public.create_business(
    'Phase 3 Salon A',
    'phase-3-salon-a-' || substr(v_owner_a::text, 1, 8),
    'Salon',
    NULL,
    NULL,
    NULL
  );

  INSERT INTO public.services (business_id, name, description, average_service_minutes, is_active)
  VALUES (v_business_a.id, 'Haircut', 'Standard cut', 30, true)
  RETURNING * INTO v_service_a;

  IF v_service_a.id IS NULL THEN
    RAISE EXCEPTION 'PHASE3 FAIL: owner A could not create service';
  END IF;

  -- Invalid duration rejected by check constraint
  BEGIN
    INSERT INTO public.services (business_id, name, average_service_minutes)
    VALUES (v_business_a.id, 'Bad duration', 0);
    denied := false;
  EXCEPTION WHEN check_violation THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE3 FAIL: invalid duration was accepted';
  END IF;

  UPDATE public.services
  SET name = 'Haircut Deluxe', average_service_minutes = 45
  WHERE id = v_service_a.id
  RETURNING * INTO v_service_a;

  IF v_service_a.name <> 'Haircut Deluxe' OR v_service_a.average_service_minutes <> 45 THEN
    RAISE EXCEPTION 'PHASE3 FAIL: owner A could not update own service';
  END IF;

  UPDATE public.services
  SET is_active = false
  WHERE id = v_service_a.id
  RETURNING * INTO v_service_a;

  IF v_service_a.is_active THEN
    RAISE EXCEPTION 'PHASE3 FAIL: owner A could not deactivate service';
  END IF;

  UPDATE public.services SET is_active = true WHERE id = v_service_a.id;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business_a.id, v_service_a.id, 'Front desk', 'open')
  RETURNING * INTO v_queue;

  IF v_queue.id IS NULL THEN
    RAISE EXCEPTION 'PHASE3 FAIL: owner A could not create queue';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.queues
  WHERE business_id = v_business_a.id;

  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE3 FAIL: owner A cannot read own queues';
  END IF;

  -- Owner B creates separate business + service
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_business_b
  FROM public.create_business(
    'Phase 3 Salon B',
    'phase-3-salon-b-' || substr(v_owner_b::text, 1, 8),
    'Salon',
    NULL,
    NULL,
    NULL
  );

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business_b.id, 'Trim', 20, true)
  RETURNING * INTO v_service_b;

  -- Cross-business read of services blocked by RLS
  SELECT COUNT(*) INTO v_count
  FROM public.services
  WHERE id = v_service_a.id;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE3 FAIL: owner B can read owner A services';
  END IF;

  -- Cross-business read of queues blocked by RLS
  SELECT COUNT(*) INTO v_count
  FROM public.queues
  WHERE id = v_queue.id;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE3 FAIL: owner B can read owner A queues';
  END IF;

  -- Cross-business service create rejected
  BEGIN
    INSERT INTO public.services (business_id, name, average_service_minutes)
    VALUES (v_business_a.id, 'Hostile service', 15);
    denied := false;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      denied := true;
    ELSE
      denied := false;
      RAISE;
    END IF;
  END;

  -- RLS typically returns 0 rows / fails WITH CHECK without raising in some paths;
  -- verify no hostile row exists under owner A membership.
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );

  SELECT COUNT(*) INTO v_count
  FROM public.services
  WHERE business_id = v_business_a.id AND name = 'Hostile service';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE3 FAIL: cross-business service insert succeeded';
  END IF;

  -- Cross-business queue linking service B under business A rejected by trigger/RLS
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    INSERT INTO public.queues (business_id, service_id, name, status)
    VALUES (v_business_a.id, v_service_b.id, 'Cross queue', 'open');
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;

  IF NOT denied THEN
    -- If insert appeared to succeed, ensure it is not visible/persisted for A
    SELECT COUNT(*) INTO v_count
    FROM public.queues
    WHERE business_id = v_business_a.id AND name = 'Cross queue';
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'PHASE3 FAIL: cross-business queue/service relationship allowed';
    END IF;
  END IF;

  -- Owner B cannot update owner A service
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );

  UPDATE public.services
  SET name = 'Hijacked'
  WHERE id = v_service_a.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE3 FAIL: owner B updated owner A service';
  END IF;

  RAISE NOTICE 'PHASE3 PASS: services and queues CRUD isolation checks succeeded';
END $$;
