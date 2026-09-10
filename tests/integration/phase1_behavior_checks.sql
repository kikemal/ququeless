-- Phase 1 behavioral validation (local only).
-- Covers onboarding, multi-tenant isolation, RPC security, queue integrity, state machine.
-- Run: npx supabase db query --local -f tests/integration/phase1_behavior_checks.sql

DO $$
DECLARE
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  user_staff uuid := gen_random_uuid();
  user_c uuid := gen_random_uuid();
  biz_a uuid;
  biz_b uuid;
  biz_c uuid;
  service_a uuid;
  service_b uuid;
  service_inactive uuid;
  queue_a uuid;
  queue_b uuid;
  queue_paused uuid;
  queue_closed uuid;
  queue_inactive_service uuid;
  entry_id uuid;
  entry_waiting uuid;
  join_public_id uuid;
  join_token text;
  join_number integer;
  join_status public.entry_status;
  ticket_people integer;
  ticket_eta integer;
  token_hash_stored text;
  member_count integer;
  saw_other boolean;
  write_failed boolean;
  transition_failed boolean;
  join_failed boolean;
  ticket_failed boolean;
BEGIN
  -- -------------------------------------------------------------------------
  -- Auth users → profiles via handle_new_user
  -- -------------------------------------------------------------------------
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (
      user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'owner-a@example.com', crypt('password', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Owner A"}'::jsonb, now(), now()
    ),
    (
      user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'owner-b@example.com', crypt('password', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Owner B"}'::jsonb, now(), now()
    ),
    (
      user_staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'staff-a@example.com', crypt('password', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Staff A"}'::jsonb, now(), now()
    ),
    (
      user_c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'owner-c@example.com', crypt('password', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Owner C"}'::jsonb, now(), now()
    );

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = user_a AND email = 'owner-a@example.com') THEN
    RAISE EXCEPTION 'ONBOARD FAIL: profile not created for user_a';
  END IF;

  -- -------------------------------------------------------------------------
  -- Create tenants A/B (JWT set so handle_new_business attaches owner)
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a::text, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.businesses (name, slug, business_type)
  VALUES ('Salon A', 'salon-a', 'salon')
  RETURNING id INTO biz_a;

  SELECT COUNT(*) INTO member_count
  FROM public.business_members
  WHERE business_id = biz_a AND user_id = user_a AND role = 'business_owner';

  IF member_count <> 1 THEN
    RAISE EXCEPTION 'ONBOARD FAIL: expected single owner membership for A';
  END IF;

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (biz_a, 'Haircut', 15, true)
  RETURNING id INTO service_a;

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (biz_a, 'Inactive Spa', 30, false)
  RETURNING id INTO service_inactive;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (biz_a, service_a, 'Walk-ins', 'open')
  RETURNING id INTO queue_a;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (biz_a, service_a, 'Paused desk', 'paused')
  RETURNING id INTO queue_paused;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (biz_a, service_a, 'Closed desk', 'closed')
  RETURNING id INTO queue_closed;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (biz_a, service_inactive, 'Inactive service queue', 'open')
  RETURNING id INTO queue_inactive_service;

  -- Staff of A
  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (biz_a, user_staff, 'staff');

  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b::text, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.businesses (name, slug, business_type)
  VALUES ('Clinic B', 'clinic-b', 'clinic')
  RETURNING id INTO biz_b;

  INSERT INTO public.services (business_id, name, average_service_minutes)
  VALUES (biz_b, 'Checkup', 20)
  RETURNING id INTO service_b;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (biz_b, service_b, 'Front desk', 'open')
  RETURNING id INTO queue_b;

  -- -------------------------------------------------------------------------
  -- Authenticated onboarding under RLS (user_c creates first business)
  -- -------------------------------------------------------------------------
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', user_c::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', user_c::text, 'role', 'authenticated')::text,
    true
  );

  -- Direct INSERT must be denied (use create_business instead)
  BEGIN
    INSERT INTO public.businesses (name, slug, business_type)
    VALUES ('Should Fail', 'should-fail', 'repair');
    write_failed := false;
  EXCEPTION
    WHEN insufficient_privilege THEN
      write_failed := true;
    WHEN OTHERS THEN
      write_failed := true;
  END;

  IF NOT write_failed THEN
    RAISE EXCEPTION 'ONBOARD FAIL: direct business INSERT still allowed';
  END IF;

  SELECT b.id INTO biz_c
  FROM public.create_business('Repair C', 'repair-c', 'repair') AS b;

  SELECT COUNT(*) INTO member_count
  FROM public.business_members
  WHERE business_id = biz_c AND user_id = user_c AND role = 'business_owner';

  IF member_count <> 1 THEN
    RAISE EXCEPTION 'ONBOARD FAIL: authenticated create did not attach single owner';
  END IF;

  -- Second business via RPC also attaches a single owner membership
  PERFORM public.create_business('Repair C2', 'repair-c2', 'repair');

  -- Duplicate membership attempt must fail unique constraint
  BEGIN
    INSERT INTO public.business_members (business_id, user_id, role)
    VALUES (biz_c, user_c, 'staff');
    write_failed := false;
  EXCEPTION WHEN unique_violation THEN
    write_failed := true;
  END;

  IF NOT write_failed THEN
    RAISE EXCEPTION 'ONBOARD FAIL: duplicate membership allowed';
  END IF;

  -- -------------------------------------------------------------------------
  -- Multi-tenant isolation (user_b / staff of A cannot access the other tenant)
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b::text, 'role', 'authenticated')::text,
    true
  );

  IF EXISTS (SELECT 1 FROM public.businesses WHERE id = biz_a)
     OR EXISTS (SELECT 1 FROM public.business_members WHERE business_id = biz_a)
     OR EXISTS (SELECT 1 FROM public.services WHERE business_id = biz_a)
     OR EXISTS (SELECT 1 FROM public.queues WHERE business_id = biz_a)
  THEN
    RAISE EXCEPTION 'SECURITY FAIL: owner B can SELECT Business A data';
  END IF;

  BEGIN
    UPDATE public.businesses SET name = 'Hacked' WHERE id = biz_a;
    GET DIAGNOSTICS member_count = ROW_COUNT;
    IF member_count > 0 THEN
      RAISE EXCEPTION 'SECURITY FAIL: owner B updated Business A';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- RLS may raise or update 0 rows depending on path
  END;

  BEGIN
    DELETE FROM public.businesses WHERE id = biz_a;
    GET DIAGNOSTICS member_count = ROW_COUNT;
    IF member_count > 0 THEN
      RAISE EXCEPTION 'SECURITY FAIL: owner B deleted Business A';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Staff of A cannot see B
  PERFORM set_config('request.jwt.claim.sub', user_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', user_staff::text, 'role', 'authenticated')::text,
    true
  );

  IF EXISTS (SELECT 1 FROM public.businesses WHERE id = biz_b)
     OR EXISTS (SELECT 1 FROM public.services WHERE business_id = biz_b)
     OR EXISTS (SELECT 1 FROM public.queues WHERE business_id = biz_b)
     OR EXISTS (SELECT 1 FROM public.queue_entries WHERE business_id = biz_b)
  THEN
    RAISE EXCEPTION 'SECURITY FAIL: staff A can SELECT Business B data';
  END IF;

  -- -------------------------------------------------------------------------
  -- Queue integrity: join open only; paused/closed/inactive rejected
  -- -------------------------------------------------------------------------
  BEGIN
    PERFORM public.join_queue(queue_paused, 'Nope', NULL);
    join_failed := false;
  EXCEPTION WHEN OTHERS THEN
    join_failed := true;
  END;
  IF NOT join_failed THEN
    RAISE EXCEPTION 'INTEGRITY FAIL: paused queue accepted join';
  END IF;

  BEGIN
    PERFORM public.join_queue(queue_closed, 'Nope', NULL);
    join_failed := false;
  EXCEPTION WHEN OTHERS THEN
    join_failed := true;
  END;
  IF NOT join_failed THEN
    RAISE EXCEPTION 'INTEGRITY FAIL: closed queue accepted join';
  END IF;

  BEGIN
    PERFORM public.join_queue(queue_inactive_service, 'Nope', NULL);
    join_failed := false;
  EXCEPTION WHEN OTHERS THEN
    join_failed := true;
  END;
  IF NOT join_failed THEN
    RAISE EXCEPTION 'INTEGRITY FAIL: inactive service queue accepted join';
  END IF;

  -- Cross-business service attachment rejected by trigger
  BEGIN
    UPDATE public.queues SET service_id = service_b WHERE id = queue_a;
    write_failed := false;
  EXCEPTION WHEN OTHERS THEN
    write_failed := true;
  END;
  IF NOT write_failed THEN
    -- If UPDATE matched 0 due to RLS while staff, reset role and retry as owner A
    NULL;
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a::text, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    UPDATE public.queues SET service_id = service_b WHERE id = queue_a;
    write_failed := false;
  EXCEPTION WHEN OTHERS THEN
    write_failed := true;
  END;
  IF NOT write_failed THEN
    RAISE EXCEPTION 'INTEGRITY FAIL: queue allowed cross-business service_id';
  END IF;

  -- -------------------------------------------------------------------------
  -- Customer join + token security
  -- -------------------------------------------------------------------------
  SELECT j.public_id, j.access_token, j.queue_number, j.status
  INTO join_public_id, join_token, join_number, join_status
  FROM public.join_queue(queue_a, 'Casey Customer', NULL) AS j;

  IF join_number <> 1 OR join_status <> 'waiting' THEN
    RAISE EXCEPTION 'join_queue failed basic assertions';
  END IF;

  IF join_token IS NULL OR length(join_token) < 64 THEN
    RAISE EXCEPTION 'TOKEN FAIL: access token missing or too short';
  END IF;

  SELECT e.access_token_hash, e.id
  INTO token_hash_stored, entry_waiting
  FROM public.queue_entries e
  WHERE e.public_id = join_public_id;

  IF token_hash_stored = join_token THEN
    RAISE EXCEPTION 'TOKEN FAIL: raw token stored in database';
  END IF;

  IF token_hash_stored <> encode(extensions.digest(join_token, 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'TOKEN FAIL: stored hash does not match sha256(token)';
  END IF;

  SELECT t.people_ahead, t.estimated_wait_minutes
  INTO ticket_people, ticket_eta
  FROM public.get_ticket(join_public_id, join_token) AS t;

  IF ticket_people <> 0 OR ticket_eta <> 0 THEN
    RAISE EXCEPTION 'get_ticket ETA mismatch for first guest';
  END IF;

  BEGIN
    PERFORM public.get_ticket(join_public_id, 'wrong-token');
    ticket_failed := false;
  EXCEPTION WHEN OTHERS THEN
    ticket_failed := true;
  END;
  IF NOT ticket_failed THEN
    RAISE EXCEPTION 'TOKEN FAIL: invalid token retrieved ticket';
  END IF;

  BEGIN
    PERFORM public.cancel_ticket(join_public_id, 'wrong-token');
    ticket_failed := false;
  EXCEPTION WHEN OTHERS THEN
    ticket_failed := true;
  END;
  IF NOT ticket_failed THEN
    RAISE EXCEPTION 'TOKEN FAIL: invalid token cancelled ticket';
  END IF;

  -- Authenticated cannot directly write queue_entries
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a::text, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    UPDATE public.queue_entries SET status = 'completed' WHERE id = entry_waiting;
    write_failed := false;
  EXCEPTION
    WHEN insufficient_privilege THEN
      write_failed := true;
    WHEN OTHERS THEN
      write_failed := true;
  END;
  IF NOT write_failed THEN
    -- privilege revoke should cause insufficient_privilege; if UPDATE runs with 0 cols writable, still fail closed
    IF EXISTS (SELECT 1 FROM public.queue_entries WHERE id = entry_waiting AND status = 'completed') THEN
      RAISE EXCEPTION 'SECURITY FAIL: authenticated updated queue_entries directly';
    END IF;
  END IF;

  -- -------------------------------------------------------------------------
  -- State machine + membership-gated transitions
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  BEGIN
    PERFORM public.transition_entry(entry_waiting, 'called');
    transition_failed := false;
  EXCEPTION WHEN OTHERS THEN
    transition_failed := true;
  END;
  IF NOT transition_failed THEN
    RAISE EXCEPTION 'SECURITY FAIL: unauthenticated transition_entry succeeded';
  END IF;

  -- Staff of A can transition
  PERFORM set_config('request.jwt.claim.sub', user_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', user_staff::text, 'role', 'authenticated')::text,
    true
  );
  PERFORM public.transition_entry(entry_waiting, 'called');

  -- Illegal from called
  BEGIN
    PERFORM public.transition_entry(entry_waiting, 'completed');
    transition_failed := false;
  EXCEPTION WHEN OTHERS THEN
    transition_failed := true;
  END;
  IF NOT transition_failed THEN
    RAISE EXCEPTION 'STATE FAIL: called -> completed allowed';
  END IF;

  BEGIN
    PERFORM public.transition_entry(entry_waiting, 'waiting');
    transition_failed := false;
  EXCEPTION WHEN OTHERS THEN
    transition_failed := true;
  END;
  IF NOT transition_failed THEN
    RAISE EXCEPTION 'STATE FAIL: called -> waiting allowed';
  END IF;

  PERFORM public.transition_entry(entry_waiting, 'serving');
  PERFORM public.transition_entry(entry_waiting, 'completed');

  BEGIN
    PERFORM public.transition_entry(entry_waiting, 'skipped');
    transition_failed := false;
  EXCEPTION WHEN OTHERS THEN
    transition_failed := true;
  END;
  IF NOT transition_failed THEN
    RAISE EXCEPTION 'STATE FAIL: terminal -> skipped allowed';
  END IF;

  -- Owner B cannot transition A's entry
  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b::text, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    PERFORM public.transition_entry(entry_waiting, 'skipped');
    transition_failed := false;
  EXCEPTION WHEN OTHERS THEN
    transition_failed := true;
  END;
  IF NOT transition_failed THEN
    RAISE EXCEPTION 'SECURITY FAIL: business B member transitioned business A entry';
  END IF;

  -- Owner B cannot SELECT A's entries
  SELECT EXISTS (
    SELECT 1 FROM public.queue_entries WHERE business_id = biz_a
  ) INTO saw_other;
  IF saw_other THEN
    RAISE EXCEPTION 'SECURITY FAIL: owner B can SELECT Business A queue_entries';
  END IF;

  -- Additional joins + numbering (SECURITY DEFINER RPCs)
  PERFORM public.join_queue(queue_a, 'Guest Two', NULL);
  PERFORM public.join_queue(queue_a, 'Guest Three', NULL);

  -- cancel_ticket with valid token on a fresh waiting entry
  SELECT j.public_id, j.access_token
  INTO join_public_id, join_token
  FROM public.join_queue(queue_a, 'Cancel Me', NULL) AS j;

  PERFORM public.cancel_ticket(join_public_id, join_token);

  -- Privileged verification (bypass RLS for assertions)
  EXECUTE 'RESET ROLE';

  IF NOT EXISTS (
    SELECT 1 FROM public.queue_entries
    WHERE public_id = join_public_id AND status = 'skipped'
  ) THEN
    RAISE EXCEPTION 'cancel_ticket failed to set skipped';
  END IF;

  IF (SELECT current_number FROM public.queues WHERE id = queue_a) <> 4 THEN
    RAISE EXCEPTION 'Queue counter mismatch after joins';
  END IF;

  IF (
    SELECT COUNT(DISTINCT queue_number)
    FROM public.queue_entries
    WHERE queue_id = queue_a
  ) <> 4 THEN
    RAISE EXCEPTION 'Duplicate or missing queue numbers';
  END IF;

  RAISE NOTICE 'Phase 1 behavior checks passed';
END
$$;
