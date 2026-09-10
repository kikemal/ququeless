-- Phase 2 onboarding membership checks (local).
-- Verifies create_business attaches business_owner and rejects client role assignment.
-- Run: npx supabase db query --local -f tests/integration/phase2_onboarding_checks.sql

DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_business public.businesses%ROWTYPE;
  v_role public.member_role;
  v_count integer;
  denied boolean;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase2-owner@example.com', crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Phase Two Owner"}'::jsonb, now(), now()
  );

  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );

  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT *
  INTO v_business
  FROM public.create_business(
    'Phase 2 Salon',
    'phase-2-salon',
    'Salon',
    NULL,
    NULL,
    NULL
  );

  SELECT bm.role INTO v_role
  FROM public.business_members bm
  WHERE bm.business_id = v_business.id AND bm.user_id = v_user;

  IF v_role IS DISTINCT FROM 'business_owner' THEN
    RAISE EXCEPTION 'PHASE2 FAIL: creator role is %, expected business_owner', v_role;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.business_members
  WHERE business_id = v_business.id AND user_id = v_user;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'PHASE2 FAIL: expected one membership, found %', v_count;
  END IF;

  -- Client cannot invent a second membership row as staff for themselves
  BEGIN
    INSERT INTO public.business_members (business_id, user_id, role)
    VALUES (v_business.id, v_user, 'staff');
    denied := false;
  EXCEPTION WHEN unique_violation THEN
    denied := true;
  END;

  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE2 FAIL: duplicate self-membership allowed';
  END IF;

  -- create_business does not accept a role argument; ownership comes from trigger only
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_business'
      AND pg_get_function_identity_arguments(p.oid) ILIKE '%role%'
  ) THEN
    RAISE EXCEPTION 'PHASE2 FAIL: create_business unexpectedly accepts a role argument';
  END IF;

  RAISE NOTICE 'Phase 2 onboarding checks passed';
END
$$;
