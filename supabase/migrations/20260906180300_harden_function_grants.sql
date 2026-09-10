-- Ensure privileged RPCs are not executable by anonymous clients.
-- Supabase may grant EXECUTE on public functions broadly; tighten explicitly.

REVOKE ALL ON FUNCTION public.transition_entry(uuid, public.entry_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_entry(uuid, public.entry_status) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_entry(uuid, public.entry_status) TO authenticated;

REVOKE ALL ON FUNCTION public.is_business_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_business_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_business_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_business_owner(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_business_owner(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.hash_access_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hash_access_token(text) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.generate_access_token() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_access_token() FROM anon, authenticated;

-- Customer RPCs remain available to anon + authenticated
GRANT EXECUTE ON FUNCTION public.join_queue(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ticket(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_ticket(uuid, text) TO anon, authenticated;
