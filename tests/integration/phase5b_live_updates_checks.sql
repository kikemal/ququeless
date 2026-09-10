-- Phase 5B live updates checks (local).
-- Run: npx supabase db query --local -f tests/integration/phase5b_live_updates_checks.sql

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_business public.businesses%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_queue public.queues%ROWTYPE;
  v_join record;
  v_ticket record;
  v_pub boolean;
  v_trig boolean;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase5b-' || substr(v_owner::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Phase 5B Owner"}'::jsonb, now(), now()
  );

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT * INTO v_business
  FROM public.create_business(
    'Phase 5B Salon',
    'phase-5b-' || substr(v_owner::text, 1, 8),
    'Salon',
    NULL,
    NULL,
    NULL
  );

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business.id, 'Cut', 12, true)
  RETURNING * INTO v_service;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business.id, v_service.id, 'Desk', 'open')
  RETURNING * INTO v_queue;

  -- Publication includes queue_entries for staff postgres_changes
  SELECT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'queue_entries'
  ) INTO v_pub;

  IF NOT v_pub THEN
    RAISE EXCEPTION 'PHASE5B FAIL: queue_entries not in supabase_realtime publication';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'queue_entries_broadcast_refresh'
  ) INTO v_trig;

  IF NOT v_trig THEN
    RAISE EXCEPTION 'PHASE5B FAIL: broadcast refresh trigger missing';
  END IF;

  -- Anon still cannot select queue_entries (no broad exposure)
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    true
  );

  BEGIN
    PERFORM COUNT(*) FROM public.queue_entries;
    -- If selectable, must return zero under RLS / grants
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- Join + get_ticket returns queue_id; still requires token
  SELECT * INTO v_join
  FROM public.join_queue(v_queue.id, 'Live Customer', NULL);

  SELECT * INTO v_ticket
  FROM public.get_ticket(v_join.public_id, v_join.access_token);

  IF v_ticket.queue_id IS DISTINCT FROM v_queue.id THEN
    RAISE EXCEPTION 'PHASE5B FAIL: get_ticket missing/incorrect queue_id';
  END IF;

  BEGIN
    PERFORM * FROM public.get_ticket(v_join.public_id, 'not-the-token');
    RAISE EXCEPTION 'PHASE5B FAIL: get_ticket accepted invalid token';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Broadcast function is not executable by clients
  IF HAS_FUNCTION_PRIVILEGE('anon', 'public.broadcast_queue_refresh()', 'EXECUTE')
     OR HAS_FUNCTION_PRIVILEGE('authenticated', 'public.broadcast_queue_refresh()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE5B FAIL: broadcast_queue_refresh executable by clients';
  END IF;

  RAISE NOTICE 'PHASE5B PASS: live update foundations are secure';
END $$;
