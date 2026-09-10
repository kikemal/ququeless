import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Team",
};

export default function TeamPage() {
  return (
    <main>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
        Team
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
        Invite your staff members here.
      </p>
    </main>
  );
}
