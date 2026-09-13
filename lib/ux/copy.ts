/**
 * Shared customer/staff UX copy helpers (Phase 18).
 * Pure — unit-testable without React.
 */

export function publicJoinStatusMessage(
  businessIsOpen: boolean,
  queueStatus: "open" | "paused" | "closed",
  isFull: boolean,
): string {
  if (!businessIsOpen) {
    return "This business is closed. Joining is unavailable until opening hours.";
  }
  if (queueStatus === "open" && isFull) {
    return "This queue is full. Please try again later.";
  }
  switch (queueStatus) {
    case "open":
      return "This queue is open. Enter your details to join.";
    case "paused":
      return "This queue is paused. Joining is temporarily unavailable.";
    case "closed":
      return "This queue is closed and not accepting customers.";
    default: {
      const _exhaustive: never = queueStatus;
      return _exhaustive;
    }
  }
}

export function removeStaffConfirmMessage(displayName: string): string {
  const name = displayName.trim() || "this staff member";
  return `Remove ${name} from your team? They will lose access to this business.`;
}

export function revokeInvitationConfirmMessage(email: string): string {
  const value = email.trim() || "this invitation";
  return `Revoke the invitation to ${value}? The invite link will stop working.`;
}

export const DASHBOARD_GET_STARTED_DESCRIPTION =
  "Create a service, open a queue, then share your QR code or public link so customers can join.";
