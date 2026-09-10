# QueueLess — Architecture & Implementation Plan

**Product:** QueueLess — virtual queue management SaaS  
**Stage:** Architecture only (no application code yet)  
**Stack:** Next.js · TypeScript · Tailwind CSS · Supabase (Auth, PostgreSQL, Realtime) · Vercel · GitHub  
**Date:** 2026-09-06

---

## 1. Product Requirements Document

### 1.1 Vision

QueueLess replaces physical waiting lines with digital queues. Businesses create services and queues, publish a QR code, and manage customers from a staff dashboard. Customers join from their phone camera with no app install and no account.

### 1.2 Problem

Physical queues create crowding, uncertainty, and poor customer experience. Many existing solutions require apps, loyalty accounts, or SMS opt-in before joining — friction that kills adoption for walk-in businesses.

### 1.3 Solution (V1)

A multi-tenant platform where:

1. A business owner signs up, creates a business, services, and at least one active queue.
2. The system generates a public join URL and QR code scoped to that business (or a specific queue).
3. A customer scans, picks a service, enters name (+ optional phone), and receives a queue number.
4. The customer page shows live position and estimated wait.
5. Staff call the next customer; the customer page updates in real time.

### 1.4 Goals (V1)

| Goal | Success signal |
|------|----------------|
| Zero-friction join | Customer joins in &lt; 30 seconds without auth |
| Real-time awareness | Position/status updates within ~1–2s of staff action |
| Tenant isolation | Business A never reads/writes Business B data |
| Staff simplicity | Call next / skip / complete with minimal UI |
| Portfolio quality | Clean TypeScript, RLS, migrations, tests, deployable on Vercel |

### 1.5 Non-goals (V1)

See Section 12. Explicitly out of scope: payments, SMS notifications, appointments, native apps, analytics suites, multi-location enterprise IAM, and customer accounts.

### 1.6 Personas

| Persona | Needs |
|---------|--------|
| Business owner | Sign up, configure business/services/queues, invite staff, get QR, view queue health |
| Staff | See waiting list, call next, mark serving/completed/skipped/no-show |
| Customer | Join quickly, know position and ETA, know when called |
| Super admin | Platform ops (support, suspend tenants) — minimal V1 surface |

### 1.7 Functional requirements

**FR-1 Auth & tenancy**

- Owners/staff authenticate via Supabase Auth (email/password for V1).
- Every business-scoped row carries `business_id`.
- Customers are anonymous; access is tokenized (see Section 7).

**FR-2 Business setup**

- Owner creates one business on signup (V1: 1 business per owner account is enough; schema allows future multi-business).
- Owner CRUD services (name, description, estimated duration minutes, active flag).
- Owner creates queues bound to a business; queues can accept one or more services.
- Owner generates/downloads QR for the public join page.

**FR-3 Customer join**

- Public route: `/q/[slug]` (business slug) or `/q/[slug]/[queueSlug]`.
- Select service → name (required) → phone (optional) → join.
- System assigns monotonic queue number per queue/day (or per queue session).
- Redirect to `/ticket/[entryPublicId]?t=[accessToken]` (or cookie-bound token).

**FR-4 Live ticket**

- Shows queue number, status, people ahead, ETA.
- Updates via Supabase Realtime when entry or queue changes.
- Handles closed queue / paused queue / completed ticket gracefully.

**FR-5 Staff dashboard**

- Authenticated routes under `/dashboard`.
- Live waiting list for selected queue.
- Actions: Call next, Call specific, Mark serving, Complete, Skip, No-show.
- Optional: pause/resume queue, reset daily counter (owner).

**FR-6 Realtime**

- Staff list and customer ticket both subscribe to relevant changes.
- No polling as primary mechanism.

### 1.8 Non-functional requirements

| Area | Requirement |
|------|-------------|
| Performance | Customer join page LCP &lt; 2.5s on mid mobile; ticket updates &lt; 2s perceived |
| Accessibility | WCAG 2.1 AA for customer + staff primary flows |
| Security | RLS on all tenant tables; no service-role in client; HTTPS only |
| Reliability | Idempotent join/call actions; clear error states |
| Maintainability | Feature folders, typed DB layer, SQL migrations in repo |
| Mobile-first | Customer UX designed phone-first; staff usable on tablet/desktop |

### 1.9 Constraints

- Customers have no Auth users in V1.
- No SMS/email notifications in V1 (UI-only “you’re called”).
- Single-region Vercel + Supabase (default).
- English-only UI copy in V1 (i18n-ready structure optional).

---

## 2. User Roles and Permissions

### 2.1 Roles

| Role | Auth | Scope |
|------|------|--------|
| `super_admin` | Supabase Auth + `profiles.role` | Platform-wide |
| `business_owner` | Supabase Auth | Own `business_id`(s) via membership |
| `staff` | Supabase Auth | Assigned `business_id`(s) via membership |
| `customer` | None (anonymous) | Single queue entry via secret access token |

### 2.2 Capability matrix

| Capability | super_admin | owner | staff | customer |
|------------|:-----------:|:-----:|:-----:|:--------:|
| Create business | ✓ (ops) | ✓ (signup) | — | — |
| Update business settings | ✓ | ✓ | — | — |
| Manage services | ✓ | ✓ | read | — |
| Manage queues | ✓ | ✓ | read / pause if granted | — |
| Invite/remove staff | ✓ | ✓ | — | — |
| View live queue | ✓ | ✓ | ✓ | own entry only |
| Call / skip / complete / no-show | ✓ | ✓ | ✓ | — |
| Join queue | — | — | — | ✓ (public) |
| View own ticket | — | — | — | ✓ (token) |
| Leave / cancel own ticket | — | — | — | ✓ (while waiting) |
| Impersonate / suspend tenant | ✓ | — | — | — |

### 2.3 Membership model

Do **not** put `business_id` only on `auth.users`. Use:

- `profiles` — 1:1 with `auth.users` (display name, global role flag for super_admin)
- `business_members` — `(user_id, business_id, role)` where `role ∈ {owner, staff}`

An owner is a member with `role = owner`. Staff are members with `role = staff`. Super admin is `profiles.role = super_admin` and bypasses tenant checks in RLS via a secure helper.

### 2.4 Customer authorization model

Customers never get JWT roles. Authorization for ticket pages:

1. On join, create `queue_entries` row and a high-entropy `access_token` (stored hashed or as opaque secret).
2. Return `public_id` (UUID) + `access_token` to the client.
3. Client stores token in `httpOnly` cookie scoped to `/ticket/*` **or** passes `?t=` once and exchanges for cookie via Route Handler.
4. Server/RLS validates token for that entry only (prefer Edge/Route Handler with service role **only** for token verify + scoped select, or use Postgres RPC `SECURITY DEFINER` that checks token hash).

**Recommended V1 approach:** Postgres RPC + anon key:

- `join_queue(...)` → returns entry public fields + access token once
- `get_my_entry(public_id, access_token)`
- `cancel_my_entry(public_id, access_token)`
- Staff mutations go through authenticated client + RLS

Realtime for customers: subscribe to `queue_entries` filtered by `id = entry_id` using a channel authorized via a short-lived Realtime token minted by a Route Handler after verifying the access token (see Section 8).

---

## 3. Core User Journeys

### 3.1 Owner onboarding

1. Land on marketing `/` → Sign up.
2. Email/password via Supabase Auth.
3. Create profile + create business (name, slug, timezone) + owner membership (transaction/RPC).
4. Create first service(s).
5. Create first queue; attach services.
6. View QR + join link; print/download.
7. Invite staff (email invite link or add existing user — V1: owner creates staff account credentials or magic invite).

### 3.2 Staff daily flow

1. Sign in → `/dashboard`.
2. Select business (if multi) → select active queue.
3. See waiting list (Realtime).
4. **Call next** → entry `waiting → called`; customer ticket updates.
5. Customer arrives → **Serving** → `called → serving`.
6. Done → **Complete** → `serving → completed`.
7. Alternate: **Skip** or **No-show** from `called`/`waiting`.

### 3.3 Customer join (happy path)

1. Scan QR → `/q/{businessSlug}`.
2. If multiple queues/services, pick service (and queue if needed).
3. Enter name, optional phone → Submit.
4. Receive ticket page with number, position, ETA.
5. Keep page open (or bookmark); watch live updates.
6. Status becomes `called` → prominent “You’re up” UI.
7. Later `completed` → thank-you / closed state.

### 3.4 Customer cancel

While `waiting`, customer taps Leave queue → confirm → `cancelled` **or** soft-delete via status `skipped` with reason `customer_cancel`. Prefer explicit status `cancelled` if added; for V1 stick to provided states and map cancel → `skipped` with `skip_reason = customer_cancelled`, **or** extend enum with `cancelled`. **Decision: add `cancelled` to entry states for clarity** (see schema). If product must keep exact six states, map cancel to `skipped`.

**V1 decision:** Keep the six required states; customer leave sets `skipped` with metadata `skip_reason = customer_left`.

### 3.5 Error / edge journeys

- Queue paused → join blocked with clear message.
- Queue closed / outside hours (optional V1: manual pause only).
- Duplicate rapid submit → idempotency key / disable button + unique constraint where needed.
- Stale ticket (completed) → read-only history view.
- Staff calls when empty → no-op toast.
- Realtime disconnect → show reconnecting; optional light refetch on focus.

---

## 4. Application Route Structure

### 4.1 Public (unauthenticated)

| Route | Purpose |
|-------|---------|
| `/` | Marketing landing |
| `/login` | Owner/staff login |
| `/signup` | Owner signup |
| `/q/[businessSlug]` | Customer join entry (pick service/queue) |
| `/q/[businessSlug]/[queueSlug]` | Direct queue join |
| `/ticket/[publicId]` | Customer live ticket (token gated) |

### 4.2 Authenticated app

| Route | Purpose | Roles |
|-------|---------|-------|
| `/dashboard` | Home overview (counts, active queues) | owner, staff |
| `/dashboard/queues` | Queue list | owner, staff |
| `/dashboard/queues/[queueId]` | Live queue console | owner, staff |
| `/dashboard/services` | Service CRUD | owner (staff read-only) |
| `/dashboard/qr` | QR codes & links | owner, staff |
| `/dashboard/team` | Members invite/remove | owner |
| `/dashboard/settings` | Business settings | owner |
| `/dashboard/account` | Profile/password | owner, staff |

### 4.3 Platform (super admin)

| Route | Purpose |
|-------|---------|
| `/admin` | Tenant list |
| `/admin/businesses/[id]` | Tenant detail / suspend |

### 4.4 API Route Handlers (Next.js App Router)

| Route | Purpose |
|-------|---------|
| `/api/realtime/customer-token` | Mint Realtime auth after verifying entry access token |
| `/api/qr/[businessSlug]` | Optional QR PNG generation |
| `/auth/callback` | Supabase auth callback |

Prefer Supabase RPCs + client for most CRUD; use Route Handlers only where secrets or cookie setting are required.

### 4.5 Middleware

- Protect `/dashboard/**` and `/admin/**`.
- Redirect authed users away from `/login`/`/signup`.
- Do **not** globally block `/q/**` or `/ticket/**`.

---

## 5. Database Schema

### 5.1 Conventions

- UUIDs (`gen_random_uuid()`) for PKs.
- `business_id uuid not null` on all tenant data.
- `created_at` / `updated_at` timestamptz.
- Soft flags: `is_active`, not hard deletes for services/queues.
- Enums via Postgres `create type`.

### 5.2 Enums

```sql
create type member_role as enum ('owner', 'staff');
create type global_role as enum ('user', 'super_admin');
create type queue_status as enum ('open', 'paused', 'closed');
create type entry_status as enum (
  'waiting',
  'called',
  'serving',
  'completed',
  'skipped',
  'no_show'
);
```

### 5.3 Tables

#### `profiles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | FK → `auth.users.id` |
| `full_name` | text | |
| `role` | global_role | default `user` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

#### `businesses`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text not null | |
| `slug` | citext unique not null | public join path |
| `timezone` | text not null | e.g. `America/Los_Angeles` |
| `is_active` | boolean | default true; suspend flag |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

#### `business_members`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `business_id` | uuid FK | → businesses |
| `user_id` | uuid FK | → profiles |
| `role` | member_role | |
| `created_at` | timestamptz | |
| UNIQUE | `(business_id, user_id)` | |

#### `services`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `business_id` | uuid FK | |
| `name` | text | |
| `description` | text null | |
| `estimated_minutes` | int | &gt; 0; used for ETA |
| `is_active` | boolean | |
| `sort_order` | int | |
| `created_at` / `updated_at` | timestamptz | |

#### `queues`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `business_id` | uuid FK | |
| `name` | text | |
| `slug` | citext | unique per business |
| `status` | queue_status | default `open` |
| `is_active` | boolean | |
| `current_number` | int | last issued number (counter) |
| `avg_service_minutes` | int null | optional override/blend |
| `created_at` / `updated_at` | timestamptz | |
| UNIQUE | `(business_id, slug)` | |

#### `queue_services`

Join table: which services a queue accepts.

| Column | Type |
|--------|------|
| `queue_id` | uuid FK |
| `service_id` | uuid FK |
| `business_id` | uuid FK (denormalized for RLS) |
| PRIMARY KEY | `(queue_id, service_id)` |

#### `queue_entries`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | internal |
| `public_id` | uuid unique | customer URL id |
| `business_id` | uuid FK | |
| `queue_id` | uuid FK | |
| `service_id` | uuid FK | |
| `queue_number` | int | assigned at join |
| `customer_name` | text | |
| `customer_phone` | text null | |
| `status` | entry_status | |
| `access_token_hash` | text | sha256 of token |
| `party_size` | int | default 1 (future) |
| `skip_reason` | text null | |
| `called_at` | timestamptz null | |
| `serving_at` | timestamptz null | |
| `completed_at` | timestamptz null | |
| `created_at` / `updated_at` | timestamptz | |

Indexes:

- `(queue_id, status, created_at)` for waiting list
- `(business_id, created_at)`
- `(public_id)` unique
- partial unique optional: one active waiting entry per phone per queue (defer if phone optional)

#### `queue_daily_counters` (optional but recommended)

For resetting numbers per business day in timezone:

| Column | Type |
|--------|------|
| `queue_id` | uuid |
| `business_date` | date |
| `last_number` | int |
| PRIMARY KEY | `(queue_id, business_date)` |

Alternatively keep `queues.current_number` and reset via scheduled job / owner action.

#### `audit_logs` (lightweight V1)

| Column | Type |
|--------|------|
| `id` | uuid |
| `business_id` | uuid |
| `actor_user_id` | uuid null |
| `action` | text |
| `entity_type` | text |
| `entity_id` | uuid |
| `metadata` | jsonb |
| `created_at` | timestamptz |

### 5.4 Status transition rules

```
waiting  → called | skipped
called   → serving | skipped | no_show | waiting (undo, owner only, optional V1)
serving  → completed | no_show
completed, skipped, no_show → terminal
```

Enforce in RPC `transition_entry(entry_id, new_status)` to prevent illegal updates from the client.

### 5.5 ETA calculation (application rule)

```
ETA minutes ≈ (people_ahead) * coalesce(service.estimated_minutes, queue.avg_service_minutes, 10)
```

People ahead = count of entries in same queue with status `waiting` created earlier, plus currently `called`/`serving` weighted as 1 (simple V1). Refine later with rolling averages.

---

## 6. Database Relationships

```
auth.users 1──1 profiles
profiles 1──* business_members *──1 businesses
businesses 1──* services
businesses 1──* queues
queues *──* services          (via queue_services)
queues 1──* queue_entries
services 1──* queue_entries
businesses 1──* queue_entries
businesses 1──* audit_logs
```

**Cardinality notes**

- One business has many queues (e.g. “Walk-ins”, “Color appointments”).
- One queue accepts many services; one service may appear on many queues.
- Each entry belongs to exactly one queue and one service.
- Members link users to businesses with a role; owners typically have one business in V1.

**Integrity**

- FK cascades: deleting a business cascades members/services/queues/entries (prefer soft-deactivate business instead).
- `queue_services`: both queue and service must share the same `business_id` (CHECK via trigger).
- Entry insert must verify service is linked to queue and queue is `open`.

---

## 7. Supabase Row Level Security Strategy

### 7.1 Principles

1. RLS enabled on **every** public table.
2. Anon key is safe to ship; service role **only** on server (Route Handlers / trusted RPCs), never in client bundles.
3. Tenant isolation key: `business_id`.
4. Customers do not get broad table SELECT; they use RPCs or narrowly scoped policies.

### 7.2 Helper functions (`security definer`, `stable`)

```sql
is_super_admin() returns boolean
-- profiles.role = 'super_admin' where id = auth.uid()

is_business_member(bid uuid) returns boolean
-- exists business_members where user_id = auth.uid() and business_id = bid

is_business_owner(bid uuid) returns boolean
-- member with role owner

has_business_role(bid uuid, roles member_role[]) returns boolean
```

### 7.3 Policy sketch

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `profiles` | self or super_admin | self (trigger on signup) | self | — |
| `businesses` | members + super_admin; **public** limited columns via view/RPC for join page | owner/super via RPC | owner/super | super only |
| `business_members` | members of same business | owner/super | owner/super | owner/super |
| `services` | members; public active list via RPC for slug | owner | owner | owner (soft) |
| `queues` | members; public via RPC | owner | owner/staff (status pause) | owner |
| `queue_services` | members; public via RPC | owner | owner | owner |
| `queue_entries` | members of business | **deny direct**; `join_queue` RPC | **deny direct**; `transition_entry` / staff RPC | — |
| `audit_logs` | owner/super | insert via trigger/RPC only | — | — |

### 7.4 Public join without leaking tenants

Do **not** allow `anon` to `SELECT * FROM businesses`. Expose:

- View or RPC `get_public_business(slug)` returning `{ name, slug, services[], queues[] }` for `is_active` businesses only.
- RPC `join_queue(business_slug, queue_id, service_id, name, phone)` with rate limiting considerations.

### 7.5 Customer ticket access

- Store only `access_token_hash`.
- RPCs require `(public_id, access_token)` and compare hash.
- Never return `access_token_hash` to clients.
- Staff SELECT policies allow full entry rows for their `business_id` (phone visible to staff — document privacy).

### 7.6 Realtime RLS

Supabase Realtime respects RLS for postgres changes. Staff subscriptions work with user JWT. Customer subscriptions need either:

- Authenticated custom JWT claiming `entry_id`, or
- Broadcast from server after mutations (see Section 8).

---

## 8. Realtime Architecture

### 8.1 Goals

- Staff console: live list as entries insert/update.
- Customer ticket: live status/position without refresh.
- Minimal fan-out; no cross-tenant leakage.

### 8.2 Channels

| Channel | Subscribers | Payload |
|---------|-------------|---------|
| `queue:{queueId}` | Staff (auth) | postgres_changes on `queue_entries` filtered `queue_id=eq.{id}` |
| `entry:{entryId}` | Customer | postgres_changes on that row **or** broadcast |

### 8.3 Recommended V1 design

**Staff path (straightforward)**

1. Staff client uses Supabase JS with user session.
2. `channel.queue` → `postgres_changes` on `queue_entries` where `queue_id = …`.
3. RLS ensures only members receive events for their business.
4. On event: patch local state or refetch waiting list query.

**Customer path (tokenized)**

Option A — **Broadcast (simpler isolation):**

1. After staff RPC transitions entry, RPC or Edge Function `realtime.send` broadcast on topic `entry:{public_id}`.
2. Customer page subscribes to broadcast channel (public topic name is unguessable UUID).
3. Still verify initial load via RPC with access token.
4. Position/ETA: either include in broadcast payload or customer refetches RPC on event.

Option B — **Private Realtime channel with minted JWT:**

1. Next Route Handler verifies access token, signs short-lived JWT with claim `entry_id`.
2. Customer uses that JWT for Realtime auth; RLS policy allows SELECT on that single row.

**V1 recommendation:** Option A (Broadcast) for customer; postgres_changes for staff. Fewer moving parts; public_id is already a secret capability URL when combined with token for mutations.

### 8.4 Position updates for people behind

When entry #5 completes, entries #6+ need new “people ahead”. Strategies:

1. Customer on event refetches `get_my_entry` (computes position server-side) — **V1**.
2. Later: broadcast queue-level position map (heavier).

### 8.5 Connection UX

- Show “Live” / “Reconnecting…” indicator.
- On `visibilitychange` → refetch.
- Debounce bursts when calling next rapidly.

---

## 9. Component Architecture

### 9.1 Layers

```
app/                        # routes only: composition + data wiring
components/
  ui/                       # primitives (Button, Input, Dialog, …)
  marketing/
  auth/
  dashboard/
  queue/                    # staff queue console widgets
  ticket/                   # customer ticket widgets
  join/                     # public join flow
lib/
  supabase/                 # browser, server, middleware clients
  auth/
  queue/                    # domain helpers: ETA, status labels
  validators/               # zod schemas
hooks/                      # useQueueRealtime, useTicketRealtime
types/                      # DB types generated + domain types
```

### 9.2 Key components (not giant pages)

| Component | Responsibility |
|-----------|----------------|
| `JoinWizard` | Steps: service → details → submit |
| `ServicePicker` | List active services for queue |
| `TicketStatusCard` | Number, status, accessibility live region |
| `TicketPosition` | People ahead + ETA |
| `QueueBoard` | Staff list of waiting/called/serving |
| `QueueEntryRow` | Single entry + actions menu |
| `CallNextButton` | Primary staff action |
| `QueueStatusBadge` | open/paused/closed |
| `QrPanel` | Image + copy link + download |
| `BusinessSwitcher` | If multi-membership |
| `RoleGate` | UI guard (never replace RLS) |

### 9.3 State management

- Server Components for initial dashboard shells where possible.
- Client components for Realtime and interactive consoles.
- TanStack Query **optional** for V1; start with server fetch + client Realtime local state. Add React Query only if caching complexity grows.
- Zod for form validation on client and shared with RPC inputs.

### 9.4 Accessibility

- `aria-live="polite"` on ticket status/position.
- Focus management in join wizard.
- Sufficient contrast; large tap targets on customer UI.
- Do not rely on color alone for status (include text).

---

## 10. Recommended Folder Structure

```
QueueLess/
├── apps/  (optional — V1 keep single Next app at root)
├── app/
│   ├── (marketing)/
│   │   ├── page.tsx
│   │   └── layout.tsx
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (public)/
│   │   ├── q/[businessSlug]/page.tsx
│   │   ├── q/[businessSlug]/[queueSlug]/page.tsx
│   │   └── ticket/[publicId]/page.tsx
│   ├── (app)/
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   ├── queues/
│   │   │   ├── services/
│   │   │   ├── qr/
│   │   │   ├── team/
│   │   │   ├── settings/
│   │   │   └── account/
│   │   └── layout.tsx
│   ├── (admin)/
│   │   └── admin/...
│   ├── api/
│   ├── auth/callback/route.ts
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/
│   ├── join/
│   ├── ticket/
│   ├── queue/
│   ├── dashboard/
│   └── marketing/
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   ├── middleware.ts
│   │   └── admin.ts          # service role — server only
│   ├── auth/
│   ├── queue/
│   └── utils.ts
├── hooks/
├── types/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── config.toml
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   └── architecture.md
├── public/
├── middleware.ts
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

---

## 11. MVP Feature List (V1)

1. Owner signup/login (Supabase Auth email/password).
2. Auto-provision profile + business + owner membership.
3. Business settings: name, slug, timezone.
4. Services CRUD (active/inactive, estimated minutes).
5. Queues CRUD; attach services; open/pause/closed.
6. Public join via `/q/[slug]` (+ optional queue slug).
7. Customer join form (name, optional phone) → queue number.
8. Customer ticket page with status, position, ETA.
9. Customer leave while waiting.
10. Staff/owner live queue console.
11. Call next + transition to serving/completed/skipped/no-show.
12. Realtime updates (staff list + customer ticket).
13. QR code + copyable join link.
14. Team: owner adds staff members (email invite or create).
15. RLS + RPC-enforced transitions.
16. Basic marketing landing.
17. Super-admin minimal tenant list (optional stretch if time; else stub role only).
18. Deploy to Vercel + Supabase project; GitHub CI for typecheck/lint/test.

---

## 12. Features That Should NOT Be Included in V1

| Feature | Why defer |
|---------|-----------|
| Customer accounts / social login | Contradicts no-account principle |
| Native iOS/Android apps | QR web is the product |
| SMS / WhatsApp / email push when called | Cost, compliance (TCPA), complexity |
| Online payments / deposits | Different product surface |
| Appointment booking / calendars | Queue ≠ scheduling |
| Multi-branch org hierarchy | Premature tenancy complexity |
| Advanced analytics / BI exports | Needs volume first |
| AI wait-time predictions | Simple ETA sufficient |
| Walk-up kiosk mode hardware | Later vertical |
| Loyalty points / CRM sync | Out of scope |
| Custom branding themes per tenant | Nice-to-have |
| i18n (multi-language) | Structure later |
| Webhooks / public REST API | After stable domain |
| Voice calling / display TV party mode | Phase 2 |
| Geofencing / must-be-nearby to join | Privacy + GPS friction |
| Hard delete GDPR automation suite | Manual export/delete process first |

Discuss before building any of the above.

---

## 13. Security Considerations

1. **Multi-tenant isolation:** RLS + `business_id` on every row; tests that prove cross-tenant denial.
2. **No service-role in browser:** only `NEXT_PUBLIC_SUPABASE_ANON_KEY` + URL publicly.
3. **Customer tokens:** 32+ bytes CSPRNG; store SHA-256 hash; single display of raw token; Prefer httpOnly cookie.
4. **IDOR prevention:** `public_id` alone is insufficient for mutations; always require token. Staff actions require membership.
5. **Slug enumeration:** public RPC returns only active businesses; constant-time-ish 404 messages.
6. **Rate limiting:** join RPC / anon endpoints (Supabase rate limits + middleware / Upstash later).
7. **PII:** phone numbers visible to staff only; encrypt at rest is Supabase default disk encryption; minimize logging of PII.
8. **XSS:** React escaping; sanitize any markdown; CSP headers on Vercel.
9. **CSRF:** cookie-based ticket auth with SameSite; Supabase session cookies per SSR guidance.
10. **Illegal status jumps:** only via `transition_entry` RPC.
11. **Invite security:** staff invite links expire; owners cannot escalate to super_admin.
12. **Admin role:** tightly controlled; separate `/admin` + RLS bypass helper audited.
13. **Dependencies:** lockfile; Dependabot; no unnecessary libs.
14. **Secrets:** GitHub Actions + Vercel env; never commit `.env.local`.
15. **QR target:** HTTPS only join URLs.

---

## 14. Testing Strategy

### 14.1 Unit

- ETA calculation
- Status transition graph (allowed/denied)
- Slug validation
- Token hash helpers

### 14.2 Database / integration

- RLS policies with two businesses, three users (owner A, staff A, owner B)
- Assert B cannot SELECT A’s entries/services
- `join_queue` only when queue open
- `transition_entry` rejects illegal paths
- Use Supabase local (`supabase start`) + pgTAP or Jest hitting PostgREST

### 14.3 Component

- Join form validation (React Testing Library)
- Ticket live region announcements (basic)

### 14.4 E2E (Playwright)

1. Owner signup → create service/queue → open join URL.
2. Customer joins → sees number.
3. Staff calls next → customer status updates (Realtime or refetch assertion).
4. Cross-tenant: user B cannot open A’s dashboard queue by ID.

### 14.5 CI gates

- `tsc --noEmit`
- ESLint
- Unit tests
- (Optional on PR) Supabase migration drift check
- E2E on main / nightly if local Supabase in CI is heavy

---

## 15. Deployment Strategy

### 15.1 Environments

| Env | Purpose |
|-----|---------|
| Local | Next dev + Supabase CLI |
| Preview | Vercel preview per PR + shared or branched Supabase (start with one staging project) |
| Production | Vercel prod + Supabase prod |

### 15.2 Pipeline

1. GitHub repo; branch protection on `main`.
2. PR → Vercel preview + CI (types, lint, unit).
3. Merge → production deploy.
4. Migrations: run via `supabase db push` / GitHub Action with service role **against the correct project**; never from the Next.js app at runtime.

### 15.3 Vercel config

- Framework: Next.js
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `NEXT_PUBLIC_APP_URL`
- Region close to Supabase region

### 15.4 Supabase

- Enable Realtime for `queue_entries`
- Auth email templates
- Database backups enabled (Pro when needed)
- Separate staging/prod projects

### 15.5 Observability (lightweight V1)

- Vercel Analytics / basic logs
- Sentry (optional) for exception tracking
- Supabase dashboard for DB/Auth metrics

### 15.6 Rollout order (implementation phases)

| Phase | Deliverable |
|-------|-------------|
| 0 | Repo bootstrap, Tailwind, Supabase project, CI skeleton |
| 1 | Migrations + RLS + RPCs + generated types |
| 2 | Auth + business provisioning |
| 3 | Services/queues dashboard CRUD |
| 4 | Public join + ticket page |
| 5 | Staff console + transitions |
| 6 | Realtime (staff + customer) |
| 7 | QR + team invites |
| 8 | E2E hardening, a11y pass, production deploy |

---

## Architecture Decisions (summary)

| Decision | Choice |
|----------|--------|
| Tenancy | `business_id` on all tenant rows + `business_members` |
| Customer auth | Opaque access token + hash; no Auth user |
| Mutations | Prefer Postgres RPCs for join/transitions |
| Staff realtime | `postgres_changes` on `queue_entries` |
| Customer realtime | Broadcast on `entry:{public_id}` + RPC refetch |
| ETA | `people_ahead * estimated_minutes` |
| Hosting | Vercel + Supabase + GitHub Actions |

---

## Next step

Phase 0–2 are implemented (bootstrap, database, auth + onboarding).
Next: **Phase 3** — Services/queues dashboard CRUD.

---

## 16. Phase 1 — Implemented database architecture

**Status:** Complete (schema, RLS, RPCs, typed clients). No dashboard/customer/QR/realtime UI in this phase.

### 16.1 Final schema (as migrated)

| Table | Purpose | Tenant key |
|-------|---------|------------|
| `profiles` | 1:1 with `auth.users` | n/a (user-scoped) |
| `businesses` | Tenant root; public `slug` | `id` |
| `business_members` | `business_owner` / `staff` membership | `business_id` |
| `services` | Offered services + `average_service_minutes` | `business_id` |
| `queues` | One queue bound to one `service_id` | `business_id` |
| `queue_entries` | Anonymous customer tickets | `business_id` (denormalized) |

**Assumption:** `queue_entries.business_id` is denormalized (not only derived via join) so RLS can filter without recursive policies. Triggers enforce consistency with `queues.business_id`.

**Roles:** `member_role` enum = `business_owner` | `staff`  
**Queue status:** `open` | `paused` | `closed`  
**Entry status:** `waiting` | `called` | `serving` | `completed` | `skipped` | `no_show`

### 16.2 Queue state machine (enforced in `transition_entry`)

```
waiting  → called | skipped
called   → serving | skipped | no_show
serving  → completed | no_show
completed / skipped / no_show → terminal (rejected)
```

Customer `cancel_ticket` maps leave-while-waiting → `skipped`.

### 16.3 RLS model

- RLS **enabled + forced** on all application tables.
- Helpers `is_business_member(uuid)` / `is_business_owner(uuid)` are `SECURITY DEFINER` with fixed `search_path`, executable by `authenticated` only (avoids recursive RLS on `business_members`).
- Owners: manage business, services, queues, team members.
- Staff: read business, services, queues, entries; **no** direct entry writes.
- `queue_entries`: SELECT for members only; **no** INSERT/UPDATE/DELETE policies for `anon`/`authenticated`.
- Column privilege: `access_token_hash` is **not** granted to `authenticated` or `anon`.

### 16.4 RPC list

| Function | Caller | Purpose |
|----------|--------|---------|
| `create_business(name, slug, type, ...)` | authenticated | Owner onboarding; attaches `business_owner` membership via trigger |
| `join_queue(queue_id, name, phone?)` | anon, authenticated | Create entry; return `public_id`, raw `access_token`, `queue_number`, `status` |
| `get_ticket(public_id, access_token)` | anon, authenticated | Ticket view + people_ahead + ETA |
| `cancel_ticket(public_id, access_token)` | anon, authenticated | waiting → skipped |
| `transition_entry(entry_id, new_status)` | authenticated only | Staff/owner state machine |

**Onboarding note:** Direct `INSERT` on `businesses` is revoked for `authenticated` because `INSERT ... RETURNING` evaluates SELECT RLS before the AFTER INSERT membership trigger runs. Use `create_business`.

Token hashing: `extensions.digest(token, 'sha256')` via `pgcrypto`. Raw token never stored.

Queue numbers: `SELECT … FOR UPDATE` on queue row, then `current_number = current_number + 1` (not `MAX+1`).

ETA: `people_ahead × services.average_service_minutes`.

### 16.5 Environment variables

| Variable | Client? | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Safe with RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | `lib/supabase/admin.ts` only |

### 16.6 Migration instructions

```bash
npx supabase start          # local Docker stack
npx supabase db reset       # apply migrations + seed.sql (empty Phase 1)
npm run db:types            # generate types/database.ts from local DB
npm run db:security-check   # privilege invariants
```

Remote:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase gen types typescript --linked > types/database.ts
```

Migrations live in `supabase/migrations/`. Do not edit the database outside migrations.

### 16.7 Security decisions (Phase 1)

1. Customers never get `auth.users` rows.
2. Direct anonymous table access to `queue_entries` is denied; RPCs only.
3. Cross-tenant reads blocked by membership helpers + `business_id`.
4. Staff cannot bypass transitions: no UPDATE policy on entries; only `transition_entry`.
5. Creating a business auto-adds the creator as `business_owner` via `SECURITY DEFINER` trigger.
