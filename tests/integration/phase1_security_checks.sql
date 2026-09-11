-- Phase 1 privilege / grant invariants (local).
-- Run: npx supabase db query --local -f tests/integration/phase1_security_checks.sql

DO $$
DECLARE
  t text;
BEGIN
  -- Anon must not have SELECT on any tenant table
  FOREACH t IN ARRAY ARRAY[
    'profiles',
    'businesses',
    'business_members',
    'services',
    'queues',
    'queue_entries'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.role_table_grants
      WHERE grantee = 'anon'
        AND table_schema = 'public'
        AND table_name = t
        AND privilege_type = 'SELECT'
    ) THEN
      RAISE EXCEPTION 'SECURITY FAIL: anon has SELECT on %', t;
    END IF;
  END LOOP;

  -- Authenticated must not have INSERT on businesses (use create_business RPC)
  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name = 'businesses'
      AND privilege_type = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'SECURITY FAIL: authenticated still has INSERT on businesses';
  END IF;

  -- Authenticated must not have INSERT/UPDATE/DELETE on queue_entries
  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name = 'queue_entries'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'SECURITY FAIL: authenticated can write queue_entries directly';
  END IF;

  -- access_token_hash must not be granted to authenticated or anon
  IF EXISTS (
    SELECT 1
    FROM information_schema.column_privileges
    WHERE grantee IN ('authenticated', 'anon')
      AND table_schema = 'public'
      AND table_name = 'queue_entries'
      AND column_name = 'access_token_hash'
      AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'SECURITY FAIL: client role can SELECT access_token_hash';
  END IF;

  -- Privileged functions must not be executable by anon
  IF HAS_FUNCTION_PRIVILEGE('anon', 'public.transition_entry(uuid, public.entry_status)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon can EXECUTE transition_entry';
  END IF;

  IF HAS_FUNCTION_PRIVILEGE('anon', 'public.is_business_member(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon can EXECUTE is_business_member';
  END IF;

  IF HAS_FUNCTION_PRIVILEGE('anon', 'public.is_business_owner(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon can EXECUTE is_business_owner';
  END IF;

  IF HAS_FUNCTION_PRIVILEGE('anon', 'public.hash_access_token(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon can EXECUTE hash_access_token';
  END IF;

  IF HAS_FUNCTION_PRIVILEGE('anon', 'public.generate_access_token()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon can EXECUTE generate_access_token';
  END IF;

  IF HAS_FUNCTION_PRIVILEGE('anon', 'public.handle_new_business()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon can EXECUTE handle_new_business';
  END IF;

  IF HAS_FUNCTION_PRIVILEGE('authenticated', 'public.handle_new_business()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: authenticated can EXECUTE handle_new_business';
  END IF;

  -- Customer RPCs must be executable by anon
  IF NOT HAS_FUNCTION_PRIVILEGE('anon', 'public.join_queue(uuid, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon missing join_queue EXECUTE';
  END IF;

  IF NOT HAS_FUNCTION_PRIVILEGE('anon', 'public.get_ticket(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon missing get_ticket EXECUTE';
  END IF;

  IF NOT HAS_FUNCTION_PRIVILEGE('anon', 'public.cancel_ticket(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon missing cancel_ticket EXECUTE';
  END IF;

  -- transition_entry must be executable by authenticated
  IF NOT HAS_FUNCTION_PRIVILEGE('authenticated', 'public.transition_entry(uuid, public.entry_status)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: authenticated missing transition_entry EXECUTE';
  END IF;

  IF HAS_FUNCTION_PRIVILEGE('anon', 'public.create_business(text, text, text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon can EXECUTE create_business';
  END IF;

  IF NOT HAS_FUNCTION_PRIVILEGE('authenticated', 'public.create_business(text, text, text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: authenticated missing create_business EXECUTE';
  END IF;

  -- Redundant indexes must be gone (UNIQUE already covers them)
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND c.relname IN (
        'queue_entries_public_id_idx',
        'queue_entries_queue_id_idx',
        'business_members_business_id_idx'
      )
  ) THEN
    RAISE EXCEPTION 'AUDIT FAIL: redundant index still present';
  END IF;

  RAISE NOTICE 'Phase 1 privilege checks passed';
END
$$;
