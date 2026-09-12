# Supabase clients (Phase 1)

| Module | Runtime | Key |
|--------|---------|-----|
| `lib/supabase/client.ts` | Browser | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `lib/supabase/server.ts` | Server Components / Route Handlers | `NEXT_PUBLIC_SUPABASE_ANON_KEY` + cookies |
| `lib/supabase/admin.ts` | Server only | `SUPABASE_SERVICE_ROLE_KEY` |

Never import `admin.ts` from Client Components. Never prefix the service role key with `NEXT_PUBLIC_`.

Browser-safe env vars are only `NEXT_PUBLIC_*` (URL, anon key, app/site URL). Email provider keys (`RESEND_API_KEY`) and the service role key are server-only.

Database types live in `types/database.ts` (generated).
