/**
 * Invite-specific re-exports kept for Phase 6 call sites.
 * Implementation lives in lib/email/address.ts.
 */

export {
  normalizeEmail as normalizeInviteEmail,
  isValidEmail as isValidInviteEmail,
} from "@/lib/email/address";
