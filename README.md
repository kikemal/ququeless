# QueueLess

Multi-tenant virtual queue management SaaS. Customers join via QR / public link
without an app or account. Staff manage queues from a protected dashboard.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Supabase Auth + PostgreSQL + RLS + SECURITY DEFINER RPCs
- Optional Resend for customer email notifications
- Intended production host: **Render** (Node web service)

Architecture notes: [`docs/architecture.md`](./docs/architecture.md).

## Getting started (local)

Requirements: **Node.js 20+**, npm, Docker Desktop (local Supabase).

```bash
npm install
npx supabase start
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from:
#   npx supabase status -o env
# Set NEXT_PUBLIC_APP_URL=http://localhost:3000
npm run db:types
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Never run `npx supabase db reset` against a production database.** That command
destroys and recreates local data only.

## Environment variables

### Browser-safe (`NEXT_PUBLIC_*`)

| Name | Required | Purpose |
|------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon/publishable key |
| `NEXT_PUBLIC_APP_URL` | yes (prod) | Public origin for QR, invites, auth email redirects |
| `NEXT_PUBLIC_SITE_URL` | optional | Alias for `NEXT_PUBLIC_APP_URL` |

### Server-only (never `NEXT_PUBLIC_`)

| Name | Required | Purpose |
|------|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | optional* | Trusted admin client only; unused by default app path |
| `QUEUELESS_EMAIL_PROVIDER` | optional | `console` (default) or `resend` |
| `RESEND_API_KEY` | if Resend | Email provider API key |
| `QUEUELESS_EMAIL_FROM` | if Resend | From address |
| `QUEUELESS_EMAIL_FORCE_FAIL` | never in prod | Test-only forced email failure |

\*Keep service-role server-only. Prefer SECURITY DEFINER RPCs + user JWT.

Copy `.env.example` → `.env.local` for development. Do not commit secrets.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve production build (`PORT` / hostname `0.0.0.0`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests |
| `npm run db:start` / `db:stop` / `db:status` | Local Supabase lifecycle |
| `npm run db:reset` | **Local only** — reset DB + re-apply migrations |
| `npm run db:types` | Regenerate `types/database.ts` |
| `npm run db:security-check` … `db:phase19-check` | Integration SQL checks |

## Production (Render)

Recommended Web Service:

```text
Build:  npm ci && npm run build
Start:  npm start
```

Set production env vars in Render (names above). Point `NEXT_PUBLIC_APP_URL` at
the public Render URL (or custom domain). Configure matching Supabase Auth
**Site URL** and redirect allowlist entries for `/auth/callback` (and invite
login redirects as needed).

Apply database migrations to the production Supabase project with your normal
migration process — **do not** use `db reset` in production.

## Route map

| Route | Role |
|-------|------|
| `/` | Marketing |
| `/signup`, `/login` | Staff auth |
| `/auth/callback` | Auth code exchange |
| `/onboarding` | Create first business |
| `/dashboard/*` | Staff app (queues, services, history, analytics, QR, team, settings) |
| `/q/[slug]` | Public join |
| `/ticket/[publicId]` | Customer ticket (credential in sessionStorage) |
| `/invite/[token]` | Staff invitation accept |

## V1 limitations

- One primary business per user (oldest membership)
- No anon rate limits on join/ticket RPCs
- Ticket access token stored in `sessionStorage` (not URL / localStorage)
- Email ticket links omit the access token (same-device requirement)
- No holidays, overnight hours, multi-counter, or payments
