/**
 * Normalize invitation emails consistently (trim + lowercase).
 */
export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidInviteEmail(email: string): boolean {
  const normalized = normalizeInviteEmail(email);
  if (!normalized || normalized.includes(" ")) {
    return false;
  }
  // Practical check — not a full RFC parser.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}
