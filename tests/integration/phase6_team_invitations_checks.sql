-- Phase 6 team invitations security checks (local).
-- Run: npx supabase db query --local -f tests/integration/phase6_team_invitations_checks.sql

DO $$
DECLARE
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_invitee uuid := gen_random_uuid();
  v_attacker uuid := gen_random_uuid();
  v_business_a public.businesses%ROWTYPE;
  v_business_b public.businesses%ROWTYPE;
  v_invite record;
  v_invite_b record;
  v_preview record;
  v_accept record;
  v_member public.business_members%ROWTYPE;
  v_hash text;
  v_raw_present boolean;
  v_count integer;
  denied boolean;
  v_staff_email text;
  v_invitee_email text;
  v_attacker_email text;
BEGIN
  v_staff_email := 'phase6-staff-' || substr(v_staff::text, 1, 8) || '@example.com';
  v_invitee_email := 'phase6-invitee-' || substr(v_invitee::text, 1, 8) || '@example.com';
  v_attacker_email := 'phase6-attacker-' || substr(v_attacker::text, 1, 8) || '@example.com';

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
  (
    v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase6-a-' || substr(v_owner_a::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner A"}'::jsonb, now(), now()
  ),
  (
    v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'phase6-b-' || substr(v_owner_b::text, 1, 8) || '@example.com',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Owner B"}'::jsonb, now(), now()
  ),
  (
    v_staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_staff_email, crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Staff A"}'::jsonb, now(), now()
  ),
  (
    v_invitee, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_invitee_email, crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Invitee"}'::jsonb, now(), now()
  ),
  (
    v_attacker, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_attacker_email, crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Attacker"}'::jsonb, now(), now()
  );

  -- Owner A business
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_owner_a::text,
      'role', 'authenticated',
      'email', 'phase6-a-' || substr(v_owner_a::text, 1, 8) || '@example.com'
    )::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT * INTO v_business_a
  FROM public.create_business(
    'Phase 6 Salon A',
    'phase-6-a-' || substr(v_owner_a::text, 1, 8),
    'Salon',
    NULL, NULL, NULL
  );

  -- Owner B business
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_owner_b::text,
      'role', 'authenticated',
      'email', 'phase6-b-' || substr(v_owner_b::text, 1, 8) || '@example.com'
    )::text,
    true
  );

  SELECT * INTO v_business_b
  FROM public.create_business(
    'Phase 6 Salon B',
    'phase-6-b-' || substr(v_owner_b::text, 1, 8),
    'Salon',
    NULL, NULL, NULL
  );

  -- Owner A invites staff
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_owner_a::text,
      'role', 'authenticated',
      'email', 'phase6-a-' || substr(v_owner_a::text, 1, 8) || '@example.com'
    )::text,
    true
  );

  SELECT * INTO v_invite
  FROM public.create_business_invitation(upper(v_invitee_email));

  IF v_invite.invitation_token IS NULL OR length(v_invite.invitation_token) < 32 THEN
    RAISE EXCEPTION 'PHASE6 FAIL: invitation token missing';
  END IF;

  -- Raw token must not be stored (verify as table owner; clients cannot read token_hash)
  RESET ROLE;
  SELECT bi.token_hash INTO v_hash
  FROM public.business_invitations bi
  WHERE bi.id = v_invite.invitation_id;

  IF v_hash IS NULL OR v_hash = v_invite.invitation_token THEN
    RAISE EXCEPTION 'PHASE6 FAIL: raw token stored or hash equals token';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.business_invitations bi
    WHERE bi.id = v_invite.invitation_id
      AND bi.token_hash = v_invite.invitation_token
  ) INTO v_raw_present;

  IF v_raw_present THEN
    RAISE EXCEPTION 'PHASE6 FAIL: raw token found in token_hash column';
  END IF;

  IF encode(extensions.digest(v_invite.invitation_token, 'sha256'), 'hex') IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'PHASE6 FAIL: token hash mismatch';
  END IF;

  -- Email normalized
  IF v_invite.email IS DISTINCT FROM lower(v_invitee_email) THEN
    RAISE EXCEPTION 'PHASE6 FAIL: invitation email not normalized';
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_owner_a::text,
      'role', 'authenticated',
      'email', 'phase6-a-' || substr(v_owner_a::text, 1, 8) || '@example.com'
    )::text,
    true
  );

  -- Owner cannot select token_hash column
  denied := false;
  BEGIN
    PERFORM token_hash FROM public.business_invitations WHERE id = v_invite.invitation_id;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE6 FAIL: authenticated could read token_hash';
  END IF;

  -- Anon cannot select invitations
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    true
  );

  denied := false;
  BEGIN
    SELECT count(*) INTO v_count FROM public.business_invitations;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    denied := true;
  END;
  IF NOT denied AND v_count > 0 THEN
    RAISE EXCEPTION 'PHASE6 FAIL: anon could read invitations';
  END IF;

  -- Anon can preview with token (minimal)
  SELECT * INTO v_preview
  FROM public.get_invitation_preview(v_invite.invitation_token);

  IF v_preview.status IS DISTINCT FROM 'pending'
     OR v_preview.email IS DISTINCT FROM lower(v_invitee_email) THEN
    RAISE EXCEPTION 'PHASE6 FAIL: preview mismatch';
  END IF;

  -- Wrong token fails
  denied := false;
  BEGIN
    PERFORM * FROM public.get_invitation_preview(v_invite.invitation_token || 'dead');
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE6 FAIL: wrong token preview succeeded';
  END IF;

  -- Owner B cannot revoke A invitation / list A invites
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_owner_b::text,
      'role', 'authenticated',
      'email', 'phase6-b-' || substr(v_owner_b::text, 1, 8) || '@example.com'
    )::text,
    true
  );

  denied := false;
  BEGIN
    PERFORM public.revoke_business_invitation(v_invite.invitation_id);
  EXCEPTION WHEN insufficient_privilege OR others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE6 FAIL: owner B revoked A invitation';
  END IF;

  -- Owner B cannot create invitation for A by inserting with A's business_id
  denied := false;
  BEGIN
    INSERT INTO public.business_invitations (
      business_id, email, token_hash, invited_by, expires_at
    ) VALUES (
      v_business_a.id, 'x@example.com', encode(extensions.gen_random_bytes(16), 'hex'),
      v_owner_b, now() + interval '1 day'
    );
  EXCEPTION WHEN insufficient_privilege OR others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE6 FAIL: owner B inserted invitation into A';
  END IF;

  -- Wrong email cannot accept
  PERFORM set_config('request.jwt.claim.sub', v_attacker::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_attacker::text,
      'role', 'authenticated',
      'email', v_attacker_email
    )::text,
    true
  );

  denied := false;
  BEGIN
    PERFORM * FROM public.accept_business_invitation(v_invite.invitation_token);
  EXCEPTION WHEN insufficient_privilege OR others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE6 FAIL: wrong email accepted invitation';
  END IF;

  -- Matching invitee accepts as staff only
  PERFORM set_config('request.jwt.claim.sub', v_invitee::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_invitee::text,
      'role', 'authenticated',
      'email', v_invitee_email
    )::text,
    true
  );

  SELECT * INTO v_accept
  FROM public.accept_business_invitation(v_invite.invitation_token);

  IF v_accept.role IS DISTINCT FROM 'staff' THEN
    RAISE EXCEPTION 'PHASE6 FAIL: acceptance did not create staff role';
  END IF;

  IF v_accept.business_id IS DISTINCT FROM v_business_a.id THEN
    RAISE EXCEPTION 'PHASE6 FAIL: acceptance wrong business';
  END IF;

  SELECT * INTO v_member
  FROM public.business_members
  WHERE business_id = v_business_a.id AND user_id = v_invitee;

  IF v_member.role IS DISTINCT FROM 'staff' THEN
    RAISE EXCEPTION 'PHASE6 FAIL: membership role not staff';
  END IF;

  -- Reuse fails
  denied := false;
  BEGIN
    PERFORM * FROM public.accept_business_invitation(v_invite.invitation_token);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE6 FAIL: accepted token reused';
  END IF;

  -- Duplicate membership prevented
  denied := false;
  BEGIN
    INSERT INTO public.business_members (business_id, user_id, role)
    VALUES (v_business_a.id, v_invitee, 'staff');
  EXCEPTION WHEN unique_violation OR others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE6 FAIL: duplicate membership allowed';
  END IF;

  -- Staff cannot invite / list pending / revoke / remove
  PERFORM set_config('request.jwt.claim.sub', v_invitee::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_invitee::text,
      'role', 'authenticated',
      'email', v_invitee_email
    )::text,
    true
  );

  denied := false;
  BEGIN
    PERFORM * FROM public.create_business_invitation('another-' || v_staff_email);
  EXCEPTION WHEN insufficient_privilege OR others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE6 FAIL: staff created invitation';
  END IF;

  denied := false;
  BEGIN
    PERFORM * FROM public.list_pending_invitations();
  EXCEPTION WHEN insufficient_privilege OR others THEN
    denied := true;
  END;
  IF NOT denied THEN
    -- empty result is OK only for owners; staff should error
    RAISE EXCEPTION 'PHASE6 FAIL: staff listed pending invitations';
  END IF;

  -- Owner cannot remove self
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_owner_a::text,
      'role', 'authenticated',
      'email', 'phase6-a-' || substr(v_owner_a::text, 1, 8) || '@example.com'
    )::text,
    true
  );

  SELECT bm.id INTO v_member
  FROM public.business_members bm
  WHERE bm.business_id = v_business_a.id AND bm.user_id = v_owner_a;

  denied := false;
  BEGIN
    PERFORM public.remove_staff_member(v_member.id);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE6 FAIL: owner removed themselves';
  END IF;

  -- Owner can remove staff
  SELECT bm.id INTO v_member
  FROM public.business_members bm
  WHERE bm.business_id = v_business_a.id AND bm.user_id = v_invitee;

  PERFORM public.remove_staff_member(v_member.id);

  SELECT count(*) INTO v_count
  FROM public.business_members
  WHERE business_id = v_business_a.id AND user_id = v_invitee;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PHASE6 FAIL: staff not removed';
  END IF;

  -- Expired invitation fails
  SELECT * INTO v_invite
  FROM public.create_business_invitation(v_staff_email);

  RESET ROLE;
  UPDATE public.business_invitations
  SET
    created_at = now() - interval '2 days',
    expires_at = now() - interval '1 day'
  WHERE id = v_invite.invitation_id;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_staff::text,
      'role', 'authenticated',
      'email', v_staff_email
    )::text,
    true
  );

  denied := false;
  BEGIN
    PERFORM * FROM public.accept_business_invitation(v_invite.invitation_token);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE6 FAIL: expired invitation accepted';
  END IF;

  -- Revoked invitation fails
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_owner_a::text,
      'role', 'authenticated',
      'email', 'phase6-a-' || substr(v_owner_a::text, 1, 8) || '@example.com'
    )::text,
    true
  );

  SELECT * INTO v_invite
  FROM public.create_business_invitation(v_staff_email);

  PERFORM public.revoke_business_invitation(v_invite.invitation_id);

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_staff::text,
      'role', 'authenticated',
      'email', v_staff_email
    )::text,
    true
  );

  denied := false;
  BEGIN
    PERFORM * FROM public.accept_business_invitation(v_invite.invitation_token);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE6 FAIL: revoked invitation accepted';
  END IF;

  -- Owner B cannot remove A members
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_owner_a::text,
      'role', 'authenticated',
      'email', 'phase6-a-' || substr(v_owner_a::text, 1, 8) || '@example.com'
    )::text,
    true
  );

  SELECT * INTO v_invite
  FROM public.create_business_invitation(v_invitee_email);

  -- Create staff membership for cross-business remove test via accept
  PERFORM set_config('request.jwt.claim.sub', v_invitee::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_invitee::text,
      'role', 'authenticated',
      'email', v_invitee_email
    )::text,
    true
  );
  PERFORM * FROM public.accept_business_invitation(v_invite.invitation_token);

  SELECT bm.id INTO v_member
  FROM public.business_members bm
  WHERE bm.business_id = v_business_a.id AND bm.user_id = v_invitee;

  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_owner_b::text,
      'role', 'authenticated',
      'email', 'phase6-b-' || substr(v_owner_b::text, 1, 8) || '@example.com'
    )::text,
    true
  );

  denied := false;
  BEGIN
    PERFORM public.remove_staff_member(v_member.id);
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PHASE6 FAIL: owner B removed A staff';
  END IF;

  -- Cross-business invite create via owner B invite returns B business only
  SELECT * INTO v_invite_b
  FROM public.create_business_invitation('b-only-' || v_staff_email);

  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_invitations bi
    WHERE bi.id = v_invite_b.invitation_id AND bi.business_id = v_business_b.id
  ) THEN
    RAISE EXCEPTION 'PHASE6 FAIL: owner B invite not bound to B';
  END IF;

  RAISE NOTICE 'PHASE6 PASS: team invitation security checks';
END;
$$;
