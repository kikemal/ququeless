"""Generate QueueLess Phase 1 PDF documentation without third-party packages."""

from __future__ import annotations

from pathlib import Path


def escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )


def wrap(text: str, width: int = 92) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if len(trial) <= width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


class PDF:
    def __init__(self) -> None:
        self.pages: list[list[str]] = []
        self.lines: list[str] = []
        self.max_lines = 58

    def add_page(self) -> None:
        if self.lines:
            self.pages.append(self.lines)
        self.lines = []

    def ensure_space(self, count: int = 1) -> None:
        if len(self.lines) + count > self.max_lines:
            self.add_page()

    def blank(self, n: int = 1) -> None:
        for _ in range(n):
            self.ensure_space()
            self.lines.append("")

    def heading(self, text: str, level: int = 1) -> None:
        self.ensure_space(2 if level == 1 else 1)
        if level == 1 and self.lines:
            self.blank()
        prefix = "" if level == 1 else "  "
        self.lines.append(f"{prefix}{text}")
        if level == 1:
            self.lines.append(prefix + ("=" * min(len(text), 72)))
        else:
            self.lines.append(prefix + ("-" * min(len(text), 68)))

    def para(self, text: str, indent: str = "") -> None:
        for line in wrap(text):
            self.ensure_space()
            self.lines.append(f"{indent}{line}")

    def bullet(self, text: str) -> None:
        wrapped = wrap(text, width=88)
        self.ensure_space(len(wrapped))
        self.lines.append(f"  • {wrapped[0]}")
        for line in wrapped[1:]:
            self.lines.append(f"    {line}")

    def code(self, text: str) -> None:
        for line in text.splitlines() or [""]:
            self.ensure_space()
            self.lines.append(f"    {line}")

    def finish(self) -> None:
        if self.lines:
            self.pages.append(self.lines)
            self.lines = []

    def build(self) -> bytes:
        self.finish()
        objects: list[bytes] = []

        def add_obj(payload: bytes) -> int:
            objects.append(payload)
            return len(objects)

        font = add_obj(
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        )
        font_bold = add_obj(
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
        )

        page_obj_nums: list[int] = []
        content_obj_nums: list[int] = []

        for page_lines in self.pages:
            # Build content stream with simple text positioning
            commands = ["BT", "/F1 10 Tf", "50 792 Td", "14 TL"]
            first = True
            for raw in page_lines:
                line = escape(raw)
                is_heading = (
                    raw.startswith("=")
                    or raw.startswith("-")
                    or (
                        raw
                        and not raw.startswith(" ")
                        and not raw.startswith("  •")
                        and not raw.startswith("    ")
                        and len(raw) < 80
                        and raw[:1].isupper()
                    )
                )
                # Simpler: bold for short title-like lines without leading spaces
                use_bold = (
                    bool(raw)
                    and not raw.startswith(" ")
                    and not raw.startswith("=")
                    and not raw.startswith("-")
                    and len(raw) < 70
                )
                if not first:
                    commands.append("T*")
                first = False
                if use_bold and not raw.startswith("=") and not raw.startswith("-"):
                    commands.append("/F2 11 Tf")
                    commands.append(f"({line}) Tj")
                    commands.append("/F1 10 Tf")
                else:
                    commands.append(f"({line}) Tj")
            commands.append("ET")
            stream = "\n".join(commands).encode("latin-1", errors="replace")
            content = (
                f"<< /Length {len(stream)} >>\nstream\n".encode()
                + stream
                + b"\nendstream"
            )
            content_no = add_obj(content)
            content_obj_nums.append(content_no)

        # Placeholder page objects; we'll fill kids after knowing numbers
        # Add pages now
        for content_no in content_obj_nums:
            page_dict = (
                f"<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 792] "
                f"/Resources << /Font << /F1 {font} 0 R /F2 {font_bold} 0 R >> >> "
                f"/Contents {content_no} 0 R >>"
            ).encode()
            page_obj_nums.append(add_obj(page_dict))

        kids = " ".join(f"{n} 0 R" for n in page_obj_nums)
        pages = add_obj(
            f"<< /Type /Pages /Count {len(page_obj_nums)} /Kids [{kids}] >>".encode()
        )

        # Patch parent references in page objects
        for idx, page_no in enumerate(page_obj_nums):
            content_no = content_obj_nums[idx]
            objects[page_no - 1] = (
                f"<< /Type /Page /Parent {pages} 0 R /MediaBox [0 0 612 792] "
                f"/Resources << /Font << /F1 {font} 0 R /F2 {font_bold} 0 R >> >> "
                f"/Contents {content_no} 0 R >>"
            ).encode()

        catalog = add_obj(f"<< /Type /Catalog /Pages {pages} 0 R >>".encode())

        out = bytearray(b"%PDF-1.4\n")
        offsets = [0]
        for i, obj in enumerate(objects, start=1):
            offsets.append(len(out))
            out.extend(f"{i} 0 obj\n".encode())
            out.extend(obj)
            out.extend(b"\nendobj\n")

        xref_pos = len(out)
        out.extend(f"xref\n0 {len(objects) + 1}\n".encode())
        out.extend(b"0000000000 65535 f \n")
        for off in offsets[1:]:
            out.extend(f"{off:010d} 00000 n \n".encode())
        out.extend(
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog} 0 R >>\n".encode()
        )
        out.extend(b"startxref\n")
        out.extend(f"{xref_pos}\n".encode())
        out.extend(b"%%EOF\n")
        return bytes(out)


def build_document() -> PDF:
    doc = PDF()
    doc.heading("QueueLess — Phase 1 Documentation", 1)
    doc.para("Virtual Queue Management SaaS")
    doc.blank()
    doc.para(
        "This document describes what was implemented in Phase 1: "
        "Supabase database architecture, migrations, Row Level Security (RLS), "
        "RPC foundations, and generated TypeScript database types."
    )
    doc.blank()
    doc.para("Scope boundary: Phase 1 does NOT include dashboard UI, customer join UI, "
             "QR generation, realtime subscriptions, notifications, payments, or analytics.")
    doc.blank()
    doc.para("Stack: Next.js, TypeScript, Supabase, PostgreSQL, Supabase Auth, RLS, RPCs.")

    doc.heading("1. Phase 1 goals", 1)
    doc.bullet("Create a reproducible PostgreSQL schema via Supabase migrations.")
    doc.bullet("Enforce multi-tenant isolation with business_id and RLS.")
    doc.bullet("Provide secure customer RPCs without customer Auth accounts.")
    doc.bullet("Enforce queue entry state transitions in the database.")
    doc.bullet("Generate accurate TypeScript types from the live schema.")
    doc.bullet("Add typed Supabase clients (browser, server, admin).")

    doc.heading("2. Project files added or updated", 1)
    doc.heading("2.1 Supabase", 2)
    doc.bullet("supabase/config.toml — local Supabase project configuration")
    doc.bullet("supabase/seed.sql — empty non-production seed placeholder")
    doc.bullet("supabase/migrations/*.sql — four ordered migration files (see section 3)")

    doc.heading("2.2 Application / library", 2)
    doc.bullet("lib/supabase/client.ts — browser client (anon key)")
    doc.bullet("lib/supabase/server.ts — server client with cookies (anon key)")
    doc.bullet("lib/supabase/admin.ts — server-only service-role client")
    doc.bullet("lib/supabase/README.md — usage and secret-handling notes")
    doc.bullet("types/database.ts — generated Database types")
    doc.bullet("scripts/gen-db-types.mjs — regenerates types from local Supabase")
    doc.bullet(".env.example — NEXT_PUBLIC_SUPABASE_URL / ANON_KEY (+ documented service role)")
    doc.bullet("package.json — db:* scripts and @supabase dependencies")
    doc.bullet("docs/architecture.md — section 16 Phase 1 architecture notes")
    doc.bullet("README.md — Phase 1 setup instructions")

    doc.heading("2.3 Validation scripts", 2)
    doc.bullet("tests/integration/phase1_security_checks.sql — privilege invariants")
    doc.bullet("tests/integration/phase1_behavior_checks.sql — isolation, transitions, numbering")

    doc.heading("3. Migration files (what each one does)", 1)

    doc.heading("3.1 20260906180000_init_schema.sql", 2)
    doc.para("Creates the foundation schema.")
    doc.bullet("Enables pgcrypto (extensions schema) for secure token hashing.")
    doc.bullet("Creates enums: member_role, queue_status, entry_status.")
    doc.bullet("Creates tables: profiles, businesses, business_members, services, queues, queue_entries.")
    doc.bullet("Adds constraints (unique slug, positive service minutes, non-negative counters, valid statuses/roles).")
    doc.bullet("Adds indexes for membership, services, queues, and queue_entries query patterns.")
    doc.bullet("Adds updated_at triggers and integrity triggers (queue/service same business; entry/queue same business).")
    doc.bullet("Adds handle_new_user trigger (auth.users -> profiles).")
    doc.bullet("Adds handle_new_business trigger (creator becomes business_owner).")
    doc.para("Design note: queue_entries.business_id is denormalized for efficient RLS without recursive joins.")

    doc.heading("3.2 20260906180100_rls_policies.sql", 2)
    doc.para("Implements tenant isolation and access control.")
    doc.bullet("Defines SECURITY DEFINER helpers: is_business_member(business_id), is_business_owner(business_id).")
    doc.bullet("Enables and forces RLS on every application table.")
    doc.bullet("profiles: users can select/update only their own row.")
    doc.bullet("businesses: members can read; authenticated can insert; owners can update/delete.")
    doc.bullet("business_members: peers can read; owners manage memberships.")
    doc.bullet("services / queues: members read; owners write.")
    doc.bullet("queue_entries: members may SELECT only; no direct INSERT/UPDATE/DELETE for anon or authenticated.")
    doc.bullet("Column grants hide access_token_hash from authenticated/anon clients.")

    doc.heading("3.3 20260906180200_rpc_functions.sql", 2)
    doc.para("Creates secure RPC foundations for customers and staff.")
    doc.bullet("join_queue(queue_id, customer_name, customer_phone?) — validates open queue, locks queue row, increments current_number safely, stores SHA-256 token hash only, returns public_id + raw token + queue_number + status.")
    doc.bullet("get_ticket(public_id, access_token) — verifies token hash; returns status, people_ahead, estimated_wait_minutes (people_ahead x average_service_minutes), service/business/queue names. Never returns token hash.")
    doc.bullet("cancel_ticket(public_id, access_token) — waiting -> skipped only.")
    doc.bullet("transition_entry(entry_id, new_status) — authenticated members only; enforces state machine.")
    doc.para("Allowed transitions:")
    doc.code("waiting  -> called | skipped\ncalled   -> serving | skipped | no_show\nserving  -> completed | no_show\nterminal -> completed | skipped | no_show")

    doc.heading("3.4 20260906180300_harden_function_grants.sql", 2)
    doc.para(
        "Tightens EXECUTE privileges because Supabase may broadly grant execute on public functions."
    )
    doc.bullet("Revokes transition_entry and membership helpers from anon.")
    doc.bullet("Keeps join_queue / get_ticket / cancel_ticket available to anon + authenticated.")
    doc.bullet("Keeps internal hash/token helpers non-executable by clients.")

    doc.heading("4. Database objects summary", 1)
    doc.heading("4.1 Tables", 2)
    doc.bullet("profiles — id (FK auth.users), full_name, email, created_at")
    doc.bullet("businesses — id, name, slug (unique), business_type, phone, email, logo_url, timestamps")
    doc.bullet("business_members — business_id, user_id, role (business_owner|staff), unique(business_id,user_id)")
    doc.bullet("services — business_id, name, description, average_service_minutes (>0), is_active")
    doc.bullet("queues — business_id, service_id, name, status (open|paused|closed), current_number (>=0)")
    doc.bullet("queue_entries — public_id, business_id, queue_id, customer fields, queue_number, status, access_token_hash, timestamps")

    doc.heading("4.2 Security model", 2)
    doc.bullet("Customers have no auth.users accounts.")
    doc.bullet("Customer access is token-based (raw token once; hash stored).")
    doc.bullet("Business A cannot read Business B data (membership + business_id RLS).")
    doc.bullet("Staff cannot directly mutate queue_entries; must use transition_entry.")
    doc.bullet("SUPABASE_SERVICE_ROLE_KEY must never be exposed to the browser.")

    doc.heading("5. How to apply and validate", 1)
    doc.code(
        "npx supabase start\n"
        "npx supabase db reset     # or: npx supabase migration up --local\n"
        "npm run db:types\n"
        "npm run db:security-check\n"
        "npm run db:behavior-check\n"
        "npm run lint\n"
        "npm run typecheck\n"
        "npm run build"
    )

    doc.heading("6. Environment variables", 1)
    doc.bullet("NEXT_PUBLIC_SUPABASE_URL — public project URL")
    doc.bullet("NEXT_PUBLIC_SUPABASE_ANON_KEY — public anon key (safe with RLS)")
    doc.bullet("SUPABASE_SERVICE_ROLE_KEY — server only (lib/supabase/admin.ts)")

    doc.heading("7. Out of scope (later phases)", 1)
    doc.bullet("Phase 2: Auth + business provisioning UI")
    doc.bullet("Phase 3: Services/queues dashboard CRUD")
    doc.bullet("Phase 4: Public join + ticket pages")
    doc.bullet("Phase 5-6: Staff console + realtime")
    doc.bullet("Phase 7+: QR codes, team invites, hardening")

    doc.blank(2)
    doc.para("Document generated for QueueLess Phase 1 — database architecture and migrations.")
    doc.para("Source of truth for SQL remains supabase/migrations/.")
    return doc


def main() -> None:
    out_dir = Path("docs")
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "QueueLess-Phase-1-Migrations.pdf"
    pdf = build_document()
    out_path.write_bytes(pdf.build())
    print(out_path.resolve())


if __name__ == "__main__":
    main()
