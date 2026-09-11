"use client";

import { useActionState } from "react";

import { logoutAction } from "@/app/(auth)/actions";
import {
  acceptInvitationAction,
  type TeamActionState,
} from "@/app/(app)/dashboard/team/actions";
import { Button } from "@/components/ui/button";

const initialState: TeamActionState = {};

type InviteAcceptClientProps = {
  token: string;
  businessName: string;
  email: string;
  expiresAt: string;
  status: string;
  isAuthenticated: boolean;
  userEmail: string | null;
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function InviteAcceptClient({
  token,
  businessName,
  email,
  expiresAt,
  status,
  isAuthenticated,
  userEmail,
}: InviteAcceptClientProps) {
  const [state, formAction, pending] = useActionState(
    acceptInvitationAction,
    initialState,
  );

  const invitePath = `/invite/${token}`;
  const loginHref = `/login?next=${encodeURIComponent(invitePath)}`;
  const signupHref = `/signup?next=${encodeURIComponent(invitePath)}&email=${encodeURIComponent(email)}`;

  const canAccept = status === "pending" && isAuthenticated;

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 py-10">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted">
          Team invitation
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
          {businessName}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          You were invited as staff for this business.
        </p>
      </div>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-muted">Invited email</dt>
          <dd className="mt-1 font-medium text-foreground">{email}</dd>
        </div>
        <div>
          <dt className="text-muted">Expires</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatDate(expiresAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Status</dt>
          <dd className="mt-1 font-medium capitalize text-foreground">{status}</dd>
        </div>
      </dl>

      {state.error ? (
        <p
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      {status !== "pending" ? (
        <p className="text-sm text-muted">
          This invitation cannot be accepted. Ask the business owner for a new
          invite if you still need access.
        </p>
      ) : !isAuthenticated ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button href={loginHref}>Log in to accept</Button>
          <Button href={signupHref} variant="secondary">
            Create account
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {userEmail &&
          userEmail.trim().toLowerCase() !== email.trim().toLowerCase() ? (
            <div className="space-y-3">
              <p className="text-sm text-danger" role="alert">
                You are signed in as {userEmail}. This invitation belongs to{" "}
                {email}. Sign out and use the invited account.
              </p>
              <form action={logoutAction}>
                <Button type="submit" variant="secondary">
                  Sign out
                </Button>
              </form>
            </div>
          ) : (
            <form action={formAction}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit" disabled={pending || !canAccept}>
                {pending ? "Accepting…" : "Accept invitation"}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
