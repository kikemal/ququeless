-- Phase 9 business settings checks (local).
-- Run: npx supabase db query --local -f tests/integration/phase9_business_settings_checks.sql

DO $$
DECLARE
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_business_a public.businesses%ROWTYPE;
  v_business_b public.businesses%ROWTYPE;
  v_service_a public.services%ROWTYPE;
  v_queue_a public.queues%ROWTYPE;
  v_updated public.businesses%ROWTYPE;
  v_slug text;
  v_public record;
  v_keys text[];
  denied boolean;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
  (
    v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase9-a-' || substr(v_owner_a::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner A"}'::jsonb, now(), now()
  ),
  (
    v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase9-b-' || substr(v_owner_b::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner B"}'::jsonb, now(), now()
  ),
  (
    v_staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase9-staff-' || substr(v_staff::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Staff"}'::jsonb, now(), now()
  );

  -- Anonymous cannot mutate settings
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  denied := false;
  BEGIN
    PERFORM public.update_my_business_settings('Hacked', NULL, NULL, NULL, NULL, 'default');
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE9 FAIL: anon could update settings';
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
    'Phase 9 Clinic A',
    'phase-9-a-' || substr(v_owner_a::text, 1, 8),
    'Clinic',
    '555-PRIVATE',
    'private-a@example.com',
    NULL
  );
  v_slug := v_business_a.slug;

  INSERT INTO public.services (business_id, name, average_service_minutes, is_active)
  VALUES (v_business_a.id, 'Consult', 20, true)
  RETURNING * INTO v_service_a;

  INSERT INTO public.queues (business_id, service_id, name, status)
  VALUES (v_business_a.id, v_service_a.id, 'Front desk', 'open')
  RETURNING * INTO v_queue_a;

  -- Default public retrieval still works with null customization
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  SELECT * INTO v_public
  FROM public.get_public_queues(v_slug)
  LIMIT 1;

  IF v_public.business_name IS DISTINCT FROM 'Phase 9 Clinic A' THEN
    RAISE EXCEPTION 'PHASE9 FAIL: default business name missing';
  END IF;
  IF v_public.branding_theme IS DISTINCT FROM 'default' THEN
    RAISE EXCEPTION 'PHASE9 FAIL: default theme expected';
  END IF;
  IF v_public.contact_email IS NOT NULL OR v_public.contact_phone IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE9 FAIL: onboarding email/phone must not appear as public contact';
  END IF;

  -- Public keys must not include private columns
  SELECT array_agg(key ORDER BY key) INTO v_keys
  FROM jsonb_object_keys(to_jsonb(v_public)) AS key;

  IF 'id' = ANY (v_keys) OR 'email' = ANY (v_keys) OR 'phone' = ANY (v_keys)
     OR 'logo_url' = ANY (v_keys) OR 'business_type' = ANY (v_keys)
     OR 'created_at' = ANY (v_keys) OR 'updated_at' = ANY (v_keys) THEN
    RAISE EXCEPTION 'PHASE9 FAIL: public RPC leaked private business columns: %', v_keys;
  END IF;

  IF NOT (
    'business_name' = ANY (v_keys)
    AND 'business_slug' = ANY (v_keys)
    AND 'public_description' = ANY (v_keys)
    AND 'public_instructions' = ANY (v_keys)
    AND 'contact_email' = ANY (v_keys)
    AND 'contact_phone' = ANY (v_keys)
    AND 'branding_theme' = ANY (v_keys)
  ) THEN
    RAISE EXCEPTION 'PHASE9 FAIL: missing expected public keys: %', v_keys;
  END IF;

  -- Owner can update settings; slug stays stable
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_updated
  FROM public.update_my_business_settings(
    'Phase 9 Clinic Renamed',
    'Walk-in dental clinic.',
    'Please arrive within 10 minutes when called.',
    'hello@clinic.example',
    '+1 555 0199',
    'warm'
  );

  IF v_updated.name IS DISTINCT FROM 'Phase 9 Clinic Renamed' THEN
    RAISE EXCEPTION 'PHASE9 FAIL: owner update did not change name';
  END IF;
  IF v_updated.slug IS DISTINCT FROM v_slug THEN
    RAISE EXCEPTION 'PHASE9 FAIL: slug changed after rename';
  END IF;
  IF v_updated.branding_theme IS DISTINCT FROM 'warm' THEN
    RAISE EXCEPTION 'PHASE9 FAIL: theme not saved';
  END IF;
  IF v_updated.email IS DISTINCT FROM 'private-a@example.com' THEN
    RAISE EXCEPTION 'PHASE9 FAIL: onboarding email should remain untouched';
  END IF;
  IF v_updated.contact_email IS DISTINCT FROM 'hello@clinic.example' THEN
    RAISE EXCEPTION 'PHASE9 FAIL: contact email not saved';
  END IF;

  -- Invalid theme rejected
  denied := false;
  BEGIN
    PERFORM public.update_my_business_settings(
      'Phase 9 Clinic Renamed', NULL, NULL, NULL, NULL, '<script>alert(1)</script>'
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE9 FAIL: invalid theme accepted';
  END IF;

  -- Staff cannot update
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
    PERFORM public.update_my_business_settings(
      'Staff Escalation', NULL, NULL, NULL, NULL, 'minimal'
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE9 FAIL: staff could update settings';
  END IF;

  -- Cross-tenant: owner B cannot change business A (primary is B)
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_business_b
  FROM public.create_business(
    'Phase 9 Clinic B',
    'phase-9-b-' || substr(v_owner_b::text, 1, 8),
    'Clinic', NULL, NULL, NULL
  );

  PERFORM public.update_my_business_settings(
    'Phase 9 Clinic B Updated', NULL, NULL, NULL, NULL, 'minimal'
  );

  IF EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = v_business_a.id AND name = 'Phase 9 Clinic B Updated'
  ) THEN
    RAISE EXCEPTION 'PHASE9 FAIL: owner B updated business A';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = v_business_a.id AND name = 'Phase 9 Clinic Renamed' AND slug = v_slug
  ) THEN
    RAISE EXCEPTION 'PHASE9 FAIL: business A settings corrupted';
  END IF;

  -- Public retrieval shows only configured public fields
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  SELECT * INTO v_public
  FROM public.get_public_queues(v_slug)
  LIMIT 1;

  IF v_public.business_name IS DISTINCT FROM 'Phase 9 Clinic Renamed' THEN
    RAISE EXCEPTION 'PHASE9 FAIL: public name not updated';
  END IF;
  IF v_public.business_slug IS DISTINCT FROM v_slug THEN
    RAISE EXCEPTION 'PHASE9 FAIL: public slug unstable';
  END IF;
  IF v_public.public_description IS DISTINCT FROM 'Walk-in dental clinic.' THEN
    RAISE EXCEPTION 'PHASE9 FAIL: public description missing';
  END IF;
  IF v_public.branding_theme IS DISTINCT FROM 'warm' THEN
    RAISE EXCEPTION 'PHASE9 FAIL: public theme missing';
  END IF;
  IF v_public.contact_email IS DISTINCT FROM 'hello@clinic.example' THEN
    RAISE EXCEPTION 'PHASE9 FAIL: public contact email missing';
  END IF;
  IF v_public.contact_phone IS DISTINCT FROM '+1 555 0199' THEN
    RAISE EXCEPTION 'PHASE9 FAIL: public contact phone missing';
  END IF;

  RAISE NOTICE 'PHASE9 PASS: business settings checks succeeded';
END;
$$;
