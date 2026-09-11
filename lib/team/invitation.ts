export type InvitationStatus =
  | "pending"
  | "expired"
  | "revoked"
  | "accepted";

export function invitationStatus(input: {
  acceptedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
  now?: Date;
}): InvitationStatus {
  if (input.acceptedAt) {
    return "accepted";
  }
  if (input.revokedAt) {
    return "revoked";
  }
  const now = input.now ?? new Date();
  if (new Date(input.expiresAt).getTime() <= now.getTime()) {
    return "expired";
  }
  return "pending";
}

export function isInvitationAcceptable(status: InvitationStatus): boolean {
  return status === "pending";
}

/**
 * Build /invite/[token] path. Token must be opaque; never log it.
 */
export function buildInvitePath(token: string): string | null {
  const cleaned = token.trim();
  if (!cleaned) {
    return null;
  }
  if (
    cleaned.includes("/") ||
    cleaned.includes("\\") ||
    cleaned.includes("..") ||
    cleaned.includes("?") ||
    cleaned.includes("#")
  ) {
    return null;
  }
  return `/invite/${encodeURIComponent(cleaned)}`;
}

export function buildInviteUrl(
  token: string,
  origin: string | null,
): string | null {
  if (!origin) {
    return null;
  }
  const path = buildInvitePath(token);
  if (!path) {
    return null;
  }
  return `${origin}${path}`;
}
