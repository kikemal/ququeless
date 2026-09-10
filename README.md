# QueueLess

A multi-tenant virtual queue management SaaS where customers join queues using a QR code without installing an app or creating an account.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Supabase Auth + PostgreSQL + RLS
- Vercel
- GitHub

## Current phase

**Phase 2 — Authentication + business onboarding**

- Real Supabase Auth signup/login/logout
- Session refresh via Next.js `proxy.ts`
- `/onboarding` creates a business through `create_business` RPC
- Protected dashboard shell with the authenticated user's business
- Placeholder pages for services/queues/QR/team (no queue functionality yet)

Architecture notes: [`docs/architecture.md`](./docs/architecture.md).

## Getting started

Requirements: Node.js 20+, npm, Docker Desktop (for local Supabase).

```bash
npm install
npx supabase start
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from `npx supabase status -o env`
npm run db:types
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Unit tests |
| `npm run db:start` | Start local Supabase |
| `npm run db:stop` | Stop local Supabase |
| `npm run db:reset` | Reset DB and re-apply migrations |
| `npm run db:types` | Generate `types/database.ts` from local DB |
| `npm run db:security-check` | Phase 1 privilege invariants |
| `npm run db:behavior-check` | Phase 1 isolation / transitions |
| `npm run db:phase2-check` | Phase 2 onboarding ownership checks |

## Route map

| Route | Status |
|-------|--------|
| `/` | Marketing landing |
| `/signup`, `/login` | Real Supabase Auth |
| `/onboarding` | Create first business (authenticated) |
| `/dashboard/*` | Protected app shell + placeholders |
| `/q/[slug]`, `/ticket/[publicId]` | Public placeholders (Phase 4+) |
| `/admin` | Admin placeholder |

## Phase 2 assumptions

- A user may belong to multiple businesses in the schema, but the app currently uses the **oldest membership** as the primary business. Business switching comes later.
- Business creation uses the Phase 1 `create_business` RPC (not a client-supplied role).
