-- Phase 18 UX polish smoke check (local).
-- Phase 18 has no schema/RPC changes. This verifies critical UX-facing RPCs
-- still exist after earlier phases so the UX layer is not shipping against a
-- broken database surface.
-- Run: npm run db:phase18-check

DO $$
BEGIN
  IF to_regprocedure('public.join_queue(uuid, text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'PHASE18 FAIL: join_queue missing';
  END IF;

  IF to_regprocedure('public.get_ticket(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'PHASE18 FAIL: get_ticket missing';
  END IF;

  IF to_regprocedure('public.call_next_entry(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PHASE18 FAIL: call_next_entry missing';
  END IF;

  IF to_regprocedure('public.transition_entry(uuid, public.entry_status)') IS NULL THEN
    RAISE EXCEPTION 'PHASE18 FAIL: transition_entry missing';
  END IF;

  IF to_regprocedure(
    'public.get_my_business_queue_history(timestamptz, timestamptz, uuid, text, integer, integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'PHASE18 FAIL: queue history RPC missing';
  END IF;

  IF to_regprocedure('public.claim_customer_notifications_for_entry(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PHASE18 FAIL: notification claim RPC missing';
  END IF;

  -- Anonymous cannot call staff claim (auth boundary still present)
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  BEGIN
    PERFORM * FROM public.claim_customer_notifications_for_entry(gen_random_uuid());
    RAISE EXCEPTION 'PHASE18 FAIL: anon claimed notifications';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN others THEN
      IF SQLERRM ILIKE '%Authentication required%'
         OR SQLERRM ILIKE '%not a member%'
         OR SQLERRM ILIKE '%permission%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
  END;

  RAISE NOTICE 'PHASE18 PASS (UX smoke)';
END;
$$;
