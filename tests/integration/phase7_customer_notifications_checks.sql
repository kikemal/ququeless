-- Phase 7 customer email notification security checks (local).
-- Run: npx supabase db query --local -f tests/integration/phase7_customer_notifications_checks.sql

DO $$
DECLARE
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_business_a public.businesses%ROWTYPE;
  v_business_b public.businesses%ROWTYPE;
  v_service_a public.services%ROWTYPE;
  v_queue_a public.queues%ROWTYPE;
  v_join record;
  v_join_no_email record;
  v_call record;
  v_entry_id uuid;
  v_email text;
  v_count integer;
  denied boolean;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
  (
    v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase7-a-' || substr(v_owner_a::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner A"}'::jsonb, now(), now()
  ),
  (
    v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase7-b-' || substr(v_owner_b::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner B"}'::jsonb, now(), now()
  );

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
    'Phase 7 Salon A',
    'phase-7-a-' || substr(v_owner_a::text, 1, 8),
    'Salon', NULL, NULL, NULL
  );

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business_a.id, 'Cut', 15, true)
  RETURNING * INTO v_service_a;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business_a.id, v_service_a.id, 'Desk', 'open')
  RETURNING * INTO v_queue_a;

  -- Malformed email rejected
  denied := false;
  BEGIN
    PERFORM * FROM public.join_queue(v_queue_a.id, 'Bad Email', NULL, 'not-an-email');
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE7 FAIL: malformed email accepted';
  END IF;

  -- Join with email → normalized + notifications enabled
  v_email := 'guest.notify+' || substr(v_owner_a::text, 1, 6) || '@example.com';
  SELECT * INTO v_join
  FROM public.join_queue(
    v_queue_a.id,
    'Email Guest',
    NULL,
    '  Guest.Notify+' || substr(v_owner_a::text, 1, 6) || '@Example.COM '
  );

  IF (
    SELECT customer_email FROM public.queue_entries WHERE public_id = v_join.public_id
  ) IS DISTINCT FROM v_email
     OR NOT (
       SELECT email_notifications_enabled FROM public.queue_entries WHERE public_id = v_join.public_id
     ) THEN
    RAISE EXCEPTION 'PHASE7 FAIL: email not normalized/enabled';
  END IF;

  -- Call next creates exactly one called notification
  SELECT * INTO v_call
  FROM public.call_next_entry(v_queue_a.id);

  IF v_call.public_id IS DISTINCT FROM v_join.public_id THEN
    RAISE EXCEPTION 'PHASE7 FAIL: unexpected call target';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.customer_notifications
  WHERE queue_entry_id = v_call.id AND type = 'called';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'PHASE7 FAIL: expected one called notification, got %', v_count;
  END IF;

  -- Idempotency: enqueue again does not duplicate (privileged helper)
  RESET ROLE;
  PERFORM public.enqueue_customer_notification(v_call.id, 'called');
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO v_count
  FROM public.customer_notifications
  WHERE queue_entry_id = v_call.id AND type = 'called';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'PHASE7 FAIL: duplicate called notification';
  END IF;

  -- Complete → completed notification
  PERFORM * FROM public.transition_entry(v_call.id, 'serving');
  PERFORM * FROM public.transition_entry(v_call.id, 'completed');

  SELECT count(*) INTO v_count
  FROM public.customer_notifications
  WHERE queue_entry_id = v_call.id AND type = 'completed';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'PHASE7 FAIL: expected completed notification';
  END IF;

  -- Skip path
  SELECT * INTO v_join
  FROM public.join_queue(v_queue_a.id, 'Skip Guest', NULL, 'skip-' || substr(v_owner_a::text, 1, 8) || '@example.com');

  SELECT e.id INTO v_entry_id
  FROM public.queue_entries e
  WHERE e.public_id = v_join.public_id;

  PERFORM * FROM public.transition_entry(v_entry_id, 'skipped');

  SELECT count(*) INTO v_count
  FROM public.customer_notifications
  WHERE queue_entry_id = v_entry_id AND type = 'skipped';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'PHASE7 FAIL: expected skipped notification';
  END IF;

  -- Cancel creates cancelled (not skipped type)
  SELECT * INTO v_join
  FROM public.join_queue(v_queue_a.id, 'Cancel Guest', NULL, 'cancel-' || substr(v_owner_a::text, 1, 8) || '@example.com');

  PERFORM * FROM public.cancel_ticket(v_join.public_id, v_join.access_token);

  SELECT e.id INTO v_entry_id
  FROM public.queue_entries e WHERE e.public_id = v_join.public_id;

  SELECT count(*) INTO v_count
  FROM public.customer_notifications
  WHERE queue_entry_id = v_entry_id AND type = 'cancelled';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'PHASE7 FAIL: expected cancelled notification';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.customer_notifications
  WHERE queue_entry_id = v_entry_id AND type = 'skipped';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE7 FAIL: cancel should not create skipped type';
  END IF;

  -- No email join → call creates no notification
  SELECT * INTO v_join_no_email
  FROM public.join_queue(v_queue_a.id, 'Silent Guest', NULL, NULL);

  IF (
    SELECT email_notifications_enabled
    FROM public.queue_entries
    WHERE public_id = v_join_no_email.public_id
  ) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PHASE7 FAIL: email should be off when omitted';
  END IF;

  SELECT * INTO v_call FROM public.call_next_entry(v_queue_a.id);
  IF v_call.public_id IS DISTINCT FROM v_join_no_email.public_id THEN
    RAISE EXCEPTION 'PHASE7 FAIL: silent guest was not called';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.customer_notifications WHERE queue_entry_id = v_call.id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE7 FAIL: notification created without email';
  END IF;

  -- Anon cannot read notifications
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  denied := false;
  BEGIN
    SELECT count(*) INTO v_count FROM public.customer_notifications;
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied AND coalesce(v_count, 0) > 0 THEN
    RAISE EXCEPTION 'PHASE7 FAIL: anon could read notifications';
  END IF;

  -- Owner B isolation
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_business_b
  FROM public.create_business(
    'Phase 7 Salon B',
    'phase-7-b-' || substr(v_owner_b::text, 1, 8),
    'Salon', NULL, NULL, NULL
  );

  SELECT count(*) INTO v_count
  FROM public.customer_notifications
  WHERE business_id = v_business_a.id;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE7 FAIL: owner B could read A notifications';
  END IF;

  SELECT e.id INTO v_entry_id
  FROM public.queue_entries e
  WHERE e.business_id = v_business_a.id
  LIMIT 1;

  denied := false;
  BEGIN
    PERFORM * FROM public.claim_customer_notifications_for_entry(v_entry_id);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE7 FAIL: owner B claimed A notifications';
  END IF;

  -- Clients cannot insert notifications directly
  denied := false;
  BEGIN
    INSERT INTO public.customer_notifications (
      queue_entry_id, business_id, type, channel, recipient
    ) VALUES (
      v_entry_id, v_business_a.id, 'called', 'email', 'x@example.com'
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE7 FAIL: direct notification insert allowed';
  END IF;

  RAISE NOTICE 'PHASE7 PASS: customer notification security checks';
END;
$$;
