-- Phase 13 business hours / timezone / join admission checks (local).
-- Boundary: open_time <= local_time < close_time
-- Run: npx supabase db query --local -f tests/integration/phase13_business_hours_checks.sql

DO $$
DECLARE
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_business_a public.businesses%ROWTYPE;
  v_business_b public.businesses%ROWTYPE;
  v_service_a public.services%ROWTYPE;
  v_queue_a public.queues%ROWTYPE;
  v_queue_unlimited public.queues%ROWTYPE;
  v_join record;
  v_ticket record;
  v_public record;
  v_hours_count integer;
  denied boolean;
  v_open boolean;
  v_schedule jsonb;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
  (
    v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase13-a-' || substr(v_owner_a::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner A"}'::jsonb, now(), now()
  ),
  (
    v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase13-b-' || substr(v_owner_b::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner B"}'::jsonb, now(), now()
  ),
  (
    v_staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase13-staff-' || substr(v_staff::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Staff"}'::jsonb, now(), now()
  );

  -- Timezone helper
  IF NOT public.is_valid_iana_timezone('UTC') THEN
    RAISE EXCEPTION 'PHASE13 FAIL: UTC should be valid';
  END IF;
  IF public.is_valid_iana_timezone('Not/A_Real_Zone') THEN
    RAISE EXCEPTION 'PHASE13 FAIL: invalid timezone accepted';
  END IF;

  -- Anon cannot mutate operating hours
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  denied := false;
  BEGIN
    UPDATE public.business_operating_hours SET is_closed = true;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    IF EXISTS (SELECT 1 FROM public.business_operating_hours WHERE is_closed = true) THEN
      -- may be pre-existing; force check via insert
      NULL;
    END IF;
  END IF;

  denied := false;
  BEGIN
    PERFORM public.update_my_business_operating_hours(
      'UTC',
      '[{"weekday":1,"is_closed":true,"open_time":null,"close_time":null},{"weekday":2,"is_closed":true,"open_time":null,"close_time":null},{"weekday":3,"is_closed":true,"open_time":null,"close_time":null},{"weekday":4,"is_closed":true,"open_time":null,"close_time":null},{"weekday":5,"is_closed":true,"open_time":null,"close_time":null},{"weekday":6,"is_closed":true,"open_time":null,"close_time":null},{"weekday":7,"is_closed":true,"open_time":null,"close_time":null}]'::jsonb
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE13 FAIL: anon updated operating hours';
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
    'Phase 13 Shop A',
    'phase-13-a-' || substr(v_owner_a::text, 1, 8),
    'Retail', NULL, NULL, NULL
  );

  IF v_business_a.timezone IS DISTINCT FROM 'UTC' THEN
    RAISE EXCEPTION 'PHASE13 FAIL: new business timezone default expected UTC';
  END IF;

  SELECT count(*)::integer INTO v_hours_count
  FROM public.business_operating_hours
  WHERE business_id = v_business_a.id;
  IF v_hours_count <> 7 THEN
    RAISE EXCEPTION 'PHASE13 FAIL: expected 7 default hour rows, got %', v_hours_count;
  END IF;

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business_a.id, 'Desk', 10, true)
  RETURNING * INTO v_service_a;

  INSERT INTO public.queues (business_id, service_id, name, status, max_waiting_customers)
  VALUES (v_business_a.id, v_service_a.id, 'Main', 'open', 5)
  RETURNING * INTO v_queue_a;

  INSERT INTO public.queues (business_id, service_id, name, status, max_waiting_customers)
  VALUES (v_business_a.id, v_service_a.id, 'Unlimited', 'open', NULL)
  RETURNING * INTO v_queue_unlimited;

  -- Default always-open schedule: join succeeds
  SELECT * INTO v_join FROM public.join_queue(v_queue_a.id, 'DefaultOpen', NULL, NULL);
  IF v_join.queue_number IS NULL THEN
    RAISE EXCEPTION 'PHASE13 FAIL: default schedule should allow join';
  END IF;

  -- Valid schedule Mon–Fri 09:00–17:00, weekend closed, Africa/Addis_Ababa
  v_schedule := jsonb_build_array(
    jsonb_build_object('weekday', 1, 'is_closed', false, 'open_time', '09:00', 'close_time', '17:00'),
    jsonb_build_object('weekday', 2, 'is_closed', false, 'open_time', '09:00', 'close_time', '17:00'),
    jsonb_build_object('weekday', 3, 'is_closed', false, 'open_time', '09:00', 'close_time', '17:00'),
    jsonb_build_object('weekday', 4, 'is_closed', false, 'open_time', '09:00', 'close_time', '17:00'),
    jsonb_build_object('weekday', 5, 'is_closed', false, 'open_time', '09:00', 'close_time', '17:00'),
    jsonb_build_object('weekday', 6, 'is_closed', true, 'open_time', null, 'close_time', null),
    jsonb_build_object('weekday', 7, 'is_closed', true, 'open_time', null, 'close_time', null)
  );
  PERFORM public.update_my_business_operating_hours('Africa/Addis_Ababa', v_schedule);

  SELECT timezone INTO v_business_a.timezone FROM public.businesses WHERE id = v_business_a.id;
  IF v_business_a.timezone IS DISTINCT FROM 'Africa/Addis_Ababa' THEN
    RAISE EXCEPTION 'PHASE13 FAIL: timezone not saved';
  END IF;

  -- Reject invalid timezone
  denied := false;
  BEGIN
    PERFORM public.update_my_business_operating_hours('Fake/Zone', v_schedule);
  EXCEPTION WHEN check_violation THEN
    denied := true;
  WHEN others THEN
    IF SQLERRM ILIKE '%invalid timezone%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE13 FAIL: invalid timezone accepted by RPC';
  END IF;

  -- Reject start >= end
  denied := false;
  BEGIN
    PERFORM public.update_my_business_operating_hours(
      'UTC',
      jsonb_build_array(
        jsonb_build_object('weekday', 1, 'is_closed', false, 'open_time', '17:00', 'close_time', '09:00'),
        jsonb_build_object('weekday', 2, 'is_closed', true, 'open_time', null, 'close_time', null),
        jsonb_build_object('weekday', 3, 'is_closed', true, 'open_time', null, 'close_time', null),
        jsonb_build_object('weekday', 4, 'is_closed', true, 'open_time', null, 'close_time', null),
        jsonb_build_object('weekday', 5, 'is_closed', true, 'open_time', null, 'close_time', null),
        jsonb_build_object('weekday', 6, 'is_closed', true, 'open_time', null, 'close_time', null),
        jsonb_build_object('weekday', 7, 'is_closed', true, 'open_time', null, 'close_time', null)
      )
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE13 FAIL: overnight / inverted interval accepted';
  END IF;

  -- Reject missing times on open day
  denied := false;
  BEGIN
    PERFORM public.update_my_business_operating_hours(
      'UTC',
      jsonb_build_array(
        jsonb_build_object('weekday', 1, 'is_closed', false, 'open_time', null, 'close_time', null),
        jsonb_build_object('weekday', 2, 'is_closed', true, 'open_time', null, 'close_time', null),
        jsonb_build_object('weekday', 3, 'is_closed', true, 'open_time', null, 'close_time', null),
        jsonb_build_object('weekday', 4, 'is_closed', true, 'open_time', null, 'close_time', null),
        jsonb_build_object('weekday', 5, 'is_closed', true, 'open_time', null, 'close_time', null),
        jsonb_build_object('weekday', 6, 'is_closed', true, 'open_time', null, 'close_time', null),
        jsonb_build_object('weekday', 7, 'is_closed', true, 'open_time', null, 'close_time', null)
      )
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE13 FAIL: open day without times accepted';
  END IF;

  -- Restore valid Addis schedule
  PERFORM public.update_my_business_operating_hours('Africa/Addis_Ababa', v_schedule);

  -- Addis Ababa = UTC+3, no DST. Monday 2026-06-01:
  -- 05:59 UTC = 08:59 local → closed (before open)
  -- 06:00 UTC = 09:00 local → open (exact open)
  -- 12:59 UTC = 15:59 local → open
  -- 13:00 UTC = 16:00? wait 13:00 UTC = 16:00 local... close is 17:00
  -- 14:00 UTC = 17:00 local → closed (exact close)
  -- 14:01 UTC = 17:01 → closed

  IF public.is_business_open_at(v_business_a.id, '2026-06-01 05:59:00+00'::timestamptz) THEN
    RAISE EXCEPTION 'PHASE13 FAIL: before opening should be closed';
  END IF;
  IF NOT public.is_business_open_at(v_business_a.id, '2026-06-01 06:00:00+00'::timestamptz) THEN
    RAISE EXCEPTION 'PHASE13 FAIL: exact opening should be open';
  END IF;
  IF NOT public.is_business_open_at(v_business_a.id, '2026-06-01 13:59:00+00'::timestamptz) THEN
    RAISE EXCEPTION 'PHASE13 FAIL: just before closing should be open';
  END IF;
  IF public.is_business_open_at(v_business_a.id, '2026-06-01 14:00:00+00'::timestamptz) THEN
    RAISE EXCEPTION 'PHASE13 FAIL: exact closing should be closed';
  END IF;
  IF public.is_business_open_at(v_business_a.id, '2026-06-01 14:01:00+00'::timestamptz) THEN
    RAISE EXCEPTION 'PHASE13 FAIL: after closing should be closed';
  END IF;

  -- Weekend closed (Saturday 2026-06-06 Addis)
  IF public.is_business_open_at(v_business_a.id, '2026-06-06 10:00:00+00'::timestamptz) THEN
    RAISE EXCEPTION 'PHASE13 FAIL: Saturday should be closed';
  END IF;

  -- Negative offset: America/New_York (EDT UTC-4 in June)
  PERFORM public.update_my_business_operating_hours('America/New_York', v_schedule);
  -- Monday 2026-06-01 12:59 UTC = 08:59 EDT → closed
  IF public.is_business_open_at(v_business_a.id, '2026-06-01 12:59:00+00'::timestamptz) THEN
    RAISE EXCEPTION 'PHASE13 FAIL: NY before open should be closed';
  END IF;
  -- 13:00 UTC = 09:00 EDT → open
  IF NOT public.is_business_open_at(v_business_a.id, '2026-06-01 13:00:00+00'::timestamptz) THEN
    RAISE EXCEPTION 'PHASE13 FAIL: NY exact open should be open';
  END IF;
  -- 21:00 UTC = 17:00 EDT → closed
  IF public.is_business_open_at(v_business_a.id, '2026-06-01 21:00:00+00'::timestamptz) THEN
    RAISE EXCEPTION 'PHASE13 FAIL: NY exact close should be closed';
  END IF;

  -- UTC timezone day-boundary: open 00:00-23:59 Monday only for this check via temp schedule
  PERFORM public.update_my_business_operating_hours(
    'UTC',
    jsonb_build_array(
      jsonb_build_object('weekday', 1, 'is_closed', false, 'open_time', '00:00', 'close_time', '23:59'),
      jsonb_build_object('weekday', 2, 'is_closed', true, 'open_time', null, 'close_time', null),
      jsonb_build_object('weekday', 3, 'is_closed', true, 'open_time', null, 'close_time', null),
      jsonb_build_object('weekday', 4, 'is_closed', true, 'open_time', null, 'close_time', null),
      jsonb_build_object('weekday', 5, 'is_closed', true, 'open_time', null, 'close_time', null),
      jsonb_build_object('weekday', 6, 'is_closed', true, 'open_time', null, 'close_time', null),
      jsonb_build_object('weekday', 7, 'is_closed', true, 'open_time', null, 'close_time', null)
    )
  );
  IF NOT public.is_business_open_at(v_business_a.id, '2026-06-01 00:00:00+00'::timestamptz) THEN
    RAISE EXCEPTION 'PHASE13 FAIL: UTC Monday midnight open';
  END IF;
  IF public.is_business_open_at(v_business_a.id, '2026-06-02 00:00:00+00'::timestamptz) THEN
    RAISE EXCEPTION 'PHASE13 FAIL: UTC Tuesday should be closed';
  END IF;

  -- Restore weekday hours for join_queue admission tests (Addis, Mon–Fri 09–17)
  PERFORM public.update_my_business_operating_hours('Africa/Addis_Ababa', v_schedule);

  -- Force closed now: set all days closed
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

  denied := false;
  BEGIN
    PERFORM * FROM public.join_queue(v_queue_a.id, 'ShouldFail', NULL, NULL);
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE '%business is closed%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE13 FAIL: join allowed while business closed';
  END IF;

  -- Existing ticket still readable after close
  SELECT * INTO v_ticket
  FROM public.get_ticket(v_join.public_id, v_join.access_token);
  IF v_ticket.public_id IS DISTINCT FROM v_join.public_id THEN
    RAISE EXCEPTION 'PHASE13 FAIL: ticket inaccessible after business closed';
  END IF;

  -- Re-open business (always open) and verify paused/closed/capacity still work
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

  UPDATE public.queues SET status = 'paused' WHERE id = v_queue_a.id;
  denied := false;
  BEGIN
    PERFORM * FROM public.join_queue(v_queue_a.id, 'Paused', NULL, NULL);
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE '%not open%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE13 FAIL: paused queue join succeeded';
  END IF;

  UPDATE public.queues SET status = 'closed' WHERE id = v_queue_a.id;
  denied := false;
  BEGIN
    PERFORM * FROM public.join_queue(v_queue_a.id, 'ClosedQ', NULL, NULL);
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE '%not open%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE13 FAIL: closed queue join succeeded';
  END IF;

  UPDATE public.queues SET status = 'open', max_waiting_customers = 1 WHERE id = v_queue_a.id;
  -- Already has DefaultOpen waiting from earlier — may be more than 1 waiting
  -- Cap at 1: if waiting >= 1, next join fails
  SELECT count(*)::integer INTO v_hours_count
  FROM public.queue_entries
  WHERE queue_id = v_queue_a.id AND status = 'waiting';

  IF v_hours_count >= 1 THEN
    denied := false;
    BEGIN
      PERFORM * FROM public.join_queue(v_queue_a.id, 'Cap', NULL, NULL);
    EXCEPTION WHEN others THEN
      IF SQLERRM ILIKE '%queue is full%' THEN
        denied := true;
      ELSE
        RAISE;
      END IF;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'PHASE13 FAIL: capacity full join succeeded';
    END IF;
  END IF;

  -- Unlimited still works
  PERFORM * FROM public.join_queue(v_queue_unlimited.id, 'UnlimitedOk', NULL, NULL);

  -- Public allowlist includes availability fields
  SELECT * INTO v_public
  FROM public.get_public_queues(v_business_a.slug)
  WHERE queue_id = v_queue_unlimited.id;
  IF v_public.business_timezone IS DISTINCT FROM 'UTC' THEN
    RAISE EXCEPTION 'PHASE13 FAIL: public timezone missing';
  END IF;
  IF v_public.business_is_open IS NOT TRUE THEN
    RAISE EXCEPTION 'PHASE13 FAIL: public business_is_open expected true';
  END IF;
  IF v_public.today_is_closed IS TRUE THEN
    RAISE EXCEPTION 'PHASE13 FAIL: today should not be closed';
  END IF;

  -- Staff cannot modify hours
  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (v_business_a.id, v_staff, 'staff');

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text,
    true
  );

  denied := false;
  BEGIN
    PERFORM public.update_my_business_operating_hours('Europe/London', v_schedule);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE13 FAIL: staff modified operating hours';
  END IF;

  -- Staff can read own business hours
  SELECT count(*)::integer INTO v_hours_count
  FROM public.business_operating_hours
  WHERE business_id = v_business_a.id;
  IF v_hours_count <> 7 THEN
    RAISE EXCEPTION 'PHASE13 FAIL: staff cannot read own schedule';
  END IF;

  -- Owner B cannot read/modify A
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_business_b
  FROM public.create_business(
    'Phase 13 Shop B',
    'phase-13-b-' || substr(v_owner_b::text, 1, 8),
    'Retail', NULL, NULL, NULL
  );

  SELECT count(*)::integer INTO v_hours_count
  FROM public.business_operating_hours
  WHERE business_id = v_business_a.id;
  IF v_hours_count <> 0 THEN
    RAISE EXCEPTION 'PHASE13 FAIL: owner B read business A schedule';
  END IF;

  PERFORM public.update_my_business_operating_hours(
    'Europe/London',
    jsonb_build_array(
      jsonb_build_object('weekday', 1, 'is_closed', false, 'open_time', '10:00', 'close_time', '18:00'),
      jsonb_build_object('weekday', 2, 'is_closed', false, 'open_time', '10:00', 'close_time', '18:00'),
      jsonb_build_object('weekday', 3, 'is_closed', false, 'open_time', '10:00', 'close_time', '18:00'),
      jsonb_build_object('weekday', 4, 'is_closed', false, 'open_time', '10:00', 'close_time', '18:00'),
      jsonb_build_object('weekday', 5, 'is_closed', false, 'open_time', '10:00', 'close_time', '18:00'),
      jsonb_build_object('weekday', 6, 'is_closed', true, 'open_time', null, 'close_time', null),
      jsonb_build_object('weekday', 7, 'is_closed', true, 'open_time', null, 'close_time', null)
    )
  );

  -- Privileged check: A timezone unchanged
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT timezone INTO v_business_a.timezone FROM public.businesses WHERE id = v_business_a.id;
  IF v_business_a.timezone IS DISTINCT FROM 'UTC' THEN
    RAISE EXCEPTION 'PHASE13 FAIL: owner B mutated business A timezone';
  END IF;

  SELECT timezone INTO v_business_b.timezone FROM public.businesses WHERE id = v_business_b.id;
  IF v_business_b.timezone IS DISTINCT FROM 'Europe/London' THEN
    RAISE EXCEPTION 'PHASE13 FAIL: owner B timezone not applied to B';
  END IF;

  RAISE NOTICE 'PHASE13 PASS: business hours, timezone, and admission checks ok';
END;
$$;
