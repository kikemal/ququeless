# Supabase clients (Phase 1)

| Module | Runtime | Key |
|--------|---------|-----|
| `lib/supabase/client.ts` | Browser | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `lib/supabase/server.ts` | Server Components / Route Handlers | `NEXT_PUBLIC_SUPABASE_ANON_KEY` + cookies |
| `lib/supabase/admin.ts` | Server only | `SUPABASE_SERVICE_ROLE_KEY` |

Never import `admin.ts` from Client Components. Never prefix the service role key with `NEXT_PUBLIC_`.

Database types live in `types/database.ts` (generated).
