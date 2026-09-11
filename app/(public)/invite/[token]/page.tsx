import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { InviteAcceptClient } from "@/components/team/invite-accept-client";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Accept invitation",
};

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken ?? "").trim();

  if (!token || !/^[a-f0-9]+$/i.test(token) || token.length < 32) {
    notFound();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_invitation_preview", {
    p_token: token,
  });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-16 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Invitation unavailable
        </h1>
        <p className="mt-3 text-base text-muted">
          This invitation is invalid.
        </p>
      </main>
    );
  }

  const preview = Array.isArray(data) ? data[0] : data;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto w-full max-w-lg px-5 sm:px-6">
      <InviteAcceptClient
        token={token}
        businessName={preview.business_name}
        email={preview.email}
        expiresAt={preview.expires_at}
        status={preview.status}
        isAuthenticated={Boolean(user)}
        userEmail={user?.email ?? null}
      />
    </main>
  );
}
