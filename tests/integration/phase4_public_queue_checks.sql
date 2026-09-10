-- Phase 4 public join + secure ticket checks (local).
-- Run: npx supabase db query --local -f tests/integration/phase4_public_queue_checks.sql

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
  v_ticket record;
  v_cancel record;
  v_called record;
  v_count integer;
  v_people integer;
  v_eta integer;
  denied boolean;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
  (
    v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase4-a-' || substr(v_owner_a::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner A"}'::jsonb, now(), now()
  ),
  (
    v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase4-b-' || substr(v_owner_b::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner B"}'::jsonb, now(), now()
  );

  -- Owner A setup
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
    'Phase 4 Salon A',
    'phase-4-salon-a-' || substr(v_owner_a::text, 1, 8),
    'Salon',
    NULL,
    NULL,
    NULL
  );

  INSERT INTO public.services (business_id, name, description, average_service_minutes, is_active)
  VALUES (v_business_a.id, 'Haircut', 'Cut', 10, true)
  RETURNING * INTO v_service_a;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business_a.id, v_service_a.id, 'Front desk', 'open')
  RETURNING * INTO v_queue_a;

  -- Public discovery as anon
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    true
  );

  SELECT COUNT(*) INTO v_count
  FROM public.get_public_queues(v_business_a.slug);

  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE4 FAIL: public queues not discoverable by slug';
  END IF;

  -- Anon cannot read queue_entries table directly
  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.queue_entries;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'PHASE4 FAIL: anon can read queue_entries';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected for some privilege models
  END;

  -- Join open queue
  SELECT * INTO v_join
  FROM public.join_queue(v_queue_a.id, 'Customer One', '555-0100');

  IF v_join.public_id IS NULL OR v_join.access_token IS NULL OR v_join.queue_number IS NULL THEN
    RAISE EXCEPTION 'PHASE4 FAIL: join_queue did not return ticket credentials';
  END IF;

  IF length(v_join.access_token) < 32 THEN
    RAISE EXCEPTION 'PHASE4 FAIL: access token looks too short';
  END IF;

  -- Secure lookup with public_id + token
  SELECT * INTO v_ticket
  FROM public.get_ticket(v_join.public_id, v_join.access_token);

  IF v_ticket.queue_number IS DISTINCT FROM v_join.queue_number THEN
    RAISE EXCEPTION 'PHASE4 FAIL: get_ticket returned wrong ticket';
  END IF;

  IF v_ticket.people_ahead IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'PHASE4 FAIL: expected 0 people ahead, got %', v_ticket.people_ahead;
  END IF;

  IF v_ticket.estimated_wait_minutes IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'PHASE4 FAIL: expected ETA 0, got %', v_ticket.estimated_wait_minutes;
  END IF;

  -- Invalid token rejected
  BEGIN
    PERFORM * FROM public.get_ticket(v_join.public_id, 'wrong-token');
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE4 FAIL: invalid token accepted by get_ticket';
  END IF;

  -- Public ID alone with wrong token cannot access
  BEGIN
    PERFORM * FROM public.get_ticket(gen_random_uuid(), v_join.access_token);
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE4 FAIL: mismatched public_id/token accepted';
  END IF;

  -- Second customer for people-ahead / ETA
  SELECT * INTO v_join2
  FROM public.join_queue(v_queue_a.id, 'Customer Two', NULL);

  SELECT * INTO v_ticket
  FROM public.get_ticket(v_join2.public_id, v_join2.access_token);

  v_people := v_ticket.people_ahead;
  v_eta := v_ticket.estimated_wait_minutes;

  IF v_people < 1 THEN
    RAISE EXCEPTION 'PHASE4 FAIL: second customer should have people ahead';
  END IF;

  IF v_eta IS DISTINCT FROM (v_people * v_service_a.average_service_minutes) THEN
    RAISE EXCEPTION 'PHASE4 FAIL: ETA mismatch people=% avg=% eta=%',
      v_people, v_service_a.average_service_minutes, v_eta;
  END IF;

  -- Closed queue rejects joins
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );

  UPDATE public.queues SET status = 'closed' WHERE id = v_queue_a.id;

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    true
  );

  BEGIN
    PERFORM * FROM public.join_queue(v_queue_a.id, 'Late Customer', NULL);
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE4 FAIL: join allowed on closed queue';
  END IF;

  -- Re-open for cancellation + call next tests
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );
  UPDATE public.queues SET status = 'open' WHERE id = v_queue_a.id;

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    true
  );

  -- Cancel own waiting ticket
  SELECT * INTO v_cancel
  FROM public.cancel_ticket(v_join2.public_id, v_join2.access_token);

  IF v_cancel.status IS DISTINCT FROM 'skipped' THEN
    RAISE EXCEPTION 'PHASE4 FAIL: cancel_ticket did not skip ticket';
  END IF;

  -- Cannot cancel again
  BEGIN
    PERFORM * FROM public.cancel_ticket(v_join2.public_id, v_join2.access_token);
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE4 FAIL: cancelled ticket could be cancelled again';
  END IF;

  -- Cannot cancel another customer's ticket with wrong token
  BEGIN
    PERFORM * FROM public.cancel_ticket(v_join.public_id, v_join2.access_token);
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE4 FAIL: foreign token cancelled another ticket';
  END IF;

  -- Owner A can call next
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_called FROM public.call_next_entry(v_queue_a.id);
  IF v_called.status IS DISTINCT FROM 'called' THEN
    RAISE EXCEPTION 'PHASE4 FAIL: call_next_entry did not call waiting customer';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.queue_entries
  WHERE queue_id = v_queue_a.id;

  IF v_count < 1 THEN
    RAISE EXCEPTION 'PHASE4 FAIL: owner A cannot read own queue entries';
  END IF;

  -- Owner B cannot see/modify A entries
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_business_b
  FROM public.create_business(
    'Phase 4 Salon B',
    'phase-4-salon-b-' || substr(v_owner_b::text, 1, 8),
    'Salon',
    NULL,
    NULL,
    NULL
  );

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business_b.id, 'Trim', 15, true)
  RETURNING * INTO v_service_b;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business_b.id, v_service_b.id, 'Counter', 'open')
  RETURNING * INTO v_queue_b;

  SELECT COUNT(*) INTO v_count
  FROM public.queue_entries
  WHERE queue_id = v_queue_a.id;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE4 FAIL: owner B can read owner A queue entries';
  END IF;

  BEGIN
    PERFORM * FROM public.call_next_entry(v_queue_a.id);
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE4 FAIL: owner B called next on owner A queue';
  END IF;

  BEGIN
    PERFORM * FROM public.transition_entry(v_called.id, 'serving');
    denied := false;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE4 FAIL: owner B transitioned owner A entry';
  END IF;

  -- Public discovery must not leak Business B private fields via Business A slug
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    true
  );

  SELECT COUNT(*) INTO v_count
  FROM public.get_public_queues(v_business_a.slug)
  WHERE business_slug = v_business_b.slug;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE4 FAIL: public discovery leaked unrelated business';
  END IF;

  RAISE NOTICE 'PHASE4 PASS: public join + secure ticket checks succeeded';
END $$;
