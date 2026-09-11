"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  inviteStaffAction,
  removeStaffAction,
  revokeInvitationAction,
  type TeamActionState,
} from "@/app/(app)/dashboard/team/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invitationStatus } from "@/lib/team/invitation";
import type { Enums } from "@/types/database";

export type TeamMemberRow = {
  membershipId: string;
  userId: string;
  role: Enums<"member_role">;
  createdAt: string;
  email: string | null;
  fullName: string | null;
  isCurrentUser: boolean;
};

export type PendingInvitationRow = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

type TeamManagerProps = {
  isOwner: boolean;
  members: TeamMemberRow[];
  invitations: PendingInvitationRow[];
};

const initialInviteState: TeamActionState = {};

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

function roleLabel(role: Enums<"member_role">) {
  return role === "business_owner" ? "Owner" : "Staff";
}

export function TeamManager({
  isOwner,
  members,
  invitations,
}: TeamManagerProps) {
  const router = useRouter();
  const [rowBanner, setRowBanner] = useState<TeamActionState>({});
  const [copied, setCopied] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [inviteState, inviteFormAction, invitePending] = useActionState(
    async (prev: TeamActionState, formData: FormData) => {
      const result = await inviteStaffAction(prev, formData);
      if (result.success) {
        router.refresh();
      }
      setCopied(false);
      return result;
    },
    initialInviteState,
  );

  const banner =
    inviteState.success || inviteState.error || inviteState.invitationUrl
      ? inviteState
      : rowBanner;

  function runAction(
    id: string,
    action: (formData: FormData) => Promise<TeamActionState>,
    formData: FormData,
  ) {
    setPendingId(id);
    startTransition(async () => {
      const result = await action(formData);
      setPendingId(null);
      setRowBanner(result);
      if (result.success) {
        router.refresh();
      }
    });
  }

  async function copyInviteUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
      setRowBanner({
        error: "Could not copy automatically. Select the link and copy it manually.",
        invitationUrl: url,
      });
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Team
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
          {isOwner
            ? "Invite staff and manage who can operate your queues."
            : "People with access to this business."}
        </p>
      </div>

      {banner.error ? (
        <p
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {banner.error}
        </p>
      ) : null}

      {banner.success && banner.message ? (
        <div
          className="rounded-lg border border-border bg-accent-soft/40 px-4 py-3 text-sm text-foreground"
          role="status"
        >
          <p>{banner.message}</p>
          {banner.invitationUrl ? (
            <div className="mt-3 space-y-2">
              <p className="break-all font-mono text-xs text-muted">
                {banner.invitationUrl}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => copyInviteUrl(banner.invitationUrl!)}
              >
                {copied ? "Copied" : "Copy invitation link"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-foreground">
          Team members
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted">No members found.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {members.map((member) => (
              <li
                key={member.membershipId}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {member.fullName?.trim() || member.email || "Team member"}
                    {member.isCurrentUser ? (
                      <span className="ml-2 text-sm font-normal text-muted">
                        (you)
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {member.email ?? "No email on profile"} · {roleLabel(member.role)} ·
                    joined {formatDate(member.createdAt)}
                  </p>
                </div>
                {isOwner &&
                member.role === "staff" &&
                !member.isCurrentUser ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending && pendingId === member.membershipId}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("membershipId", member.membershipId);
                      runAction(member.membershipId, removeStaffAction, fd);
                    }}
                  >
                    {isPending && pendingId === member.membershipId
                      ? "Removing…"
                      : "Remove"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner ? (
        <>
          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Invite staff
            </h2>
            <form
              action={inviteFormAction}
              className="flex max-w-lg flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  name="email"
                  type="email"
                  required
                  disabled={invitePending}
                  placeholder="staff@example.com"
                  autoComplete="off"
                />
              </div>
              <Button type="submit" disabled={invitePending}>
                {invitePending ? "Creating…" : "Create invitation"}
              </Button>
            </form>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Pending invitations
            </h2>
            {invitations.length === 0 ? (
              <p className="text-sm text-muted">No pending invitations.</p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {invitations.map((invite) => {
                  const status = invitationStatus({
                    acceptedAt: invite.acceptedAt,
                    revokedAt: invite.revokedAt,
                    expiresAt: invite.expiresAt,
                  });
                  return (
                    <li
                      key={invite.id}
                      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-foreground">{invite.email}</p>
                        <p className="mt-1 text-sm text-muted">
                          Invited {formatDate(invite.createdAt)} · Expires{" "}
                          {formatDate(invite.expiresAt)} · {status}
                        </p>
                      </div>
                      {status === "pending" ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isPending && pendingId === invite.id}
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("invitationId", invite.id);
                            runAction(invite.id, revokeInvitationAction, fd);
                          }}
                        >
                          {isPending && pendingId === invite.id
                            ? "Revoking…"
                            : "Revoke"}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-muted">
          Only the business owner can invite or remove team members.
        </p>
      )}
    </div>
  );
}
