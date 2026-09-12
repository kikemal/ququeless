export const BRANDING_THEMES = [
  "default",
  "minimal",
  "warm",
  "professional",
] as const;

export type BrandingTheme = (typeof BRANDING_THEMES)[number];

export const BUSINESS_NAME_MAX = 100;
export const PUBLIC_DESCRIPTION_MAX = 500;
export const PUBLIC_INSTRUCTIONS_MAX = 1000;
export const CONTACT_PHONE_MAX = 40;

/** Mirrors lib/email/address.ts for Node unit-test importability (no path alias). */
function normalizeContactEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidContactEmail(email: string): boolean {
  const normalized = normalizeContactEmail(email);
  if (!normalized || normalized.includes(" ")) {
    return false;
  }
  if (normalized.length > 254) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export type BusinessSettingsInput = {
  name: string;
  publicDescription: string;
  publicInstructions: string;
  contactEmail: string;
  contactPhone: string;
  brandingTheme: string;
};

export type NormalizedBusinessSettings = {
  name: string;
  publicDescription: string | null;
  publicInstructions: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  brandingTheme: BrandingTheme;
};

export type BusinessSettingsValidationError = {
  field?: keyof BusinessSettingsInput;
  message: string;
};

/** Strip ASCII control characters (keep printable text). */
export function stripControlChars(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/** Strip control chars but preserve newlines/tabs for multiline instructions. */
export function stripUnsafeControls(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function isBrandingTheme(value: string): value is BrandingTheme {
  return (BRANDING_THEMES as readonly string[]).includes(value);
}

export function normalizeOptionalText(
  value: string,
  options?: { multiline?: boolean; max?: number },
): string | null {
  const cleaned = (options?.multiline ? stripUnsafeControls : stripControlChars)(
    value,
  ).trim();
  if (!cleaned) {
    return null;
  }
  if (options?.max !== undefined && cleaned.length > options.max) {
    return cleaned.slice(0, options.max);
  }
  return cleaned;
}

export function validateBusinessSettings(
  input: BusinessSettingsInput,
):
  | { ok: true; value: NormalizedBusinessSettings }
  | { ok: false; error: BusinessSettingsValidationError } {
  const name = stripControlChars(input.name).trim();
  if (!name) {
    return {
      ok: false,
      error: { field: "name", message: "Business name is required." },
    };
  }
  if (name.length > BUSINESS_NAME_MAX) {
    return {
      ok: false,
      error: {
        field: "name",
        message: `Business name must be at most ${BUSINESS_NAME_MAX} characters.`,
      },
    };
  }

  const publicDescription = stripControlChars(input.publicDescription).trim();
  if (publicDescription.length > PUBLIC_DESCRIPTION_MAX) {
    return {
      ok: false,
      error: {
        field: "publicDescription",
        message: `Description must be at most ${PUBLIC_DESCRIPTION_MAX} characters.`,
      },
    };
  }

  const publicInstructions = stripUnsafeControls(
    input.publicInstructions,
  ).trim();
  if (publicInstructions.length > PUBLIC_INSTRUCTIONS_MAX) {
    return {
      ok: false,
      error: {
        field: "publicInstructions",
        message: `Instructions must be at most ${PUBLIC_INSTRUCTIONS_MAX} characters.`,
      },
    };
  }

  const emailRaw = input.contactEmail.trim();
  let contactEmail: string | null = null;
  if (emailRaw) {
    if (!isValidContactEmail(emailRaw)) {
      return {
        ok: false,
        error: {
          field: "contactEmail",
          message: "Enter a valid public email, or leave it blank.",
        },
      };
    }
    contactEmail = normalizeContactEmail(emailRaw);
  }

  const phoneRaw = stripControlChars(input.contactPhone).trim();
  if (phoneRaw.length > CONTACT_PHONE_MAX) {
    return {
      ok: false,
      error: {
        field: "contactPhone",
        message: `Phone must be at most ${CONTACT_PHONE_MAX} characters.`,
      },
    };
  }

  const theme = input.brandingTheme.trim().toLowerCase();
  if (!isBrandingTheme(theme)) {
    return {
      ok: false,
      error: {
        field: "brandingTheme",
        message: "Choose a valid branding theme.",
      },
    };
  }

  return {
    ok: true,
    value: {
      name,
      publicDescription: publicDescription || null,
      publicInstructions: publicInstructions || null,
      contactEmail,
      contactPhone: phoneRaw || null,
      brandingTheme: theme,
    },
  };
}

/** Allowlisted fields for anonymous public queue presentation. */
export type PublicBusinessProfile = {
  businessName: string;
  businessSlug: string;
  publicDescription: string | null;
  publicInstructions: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  brandingTheme: BrandingTheme;
};

export type PublicQueueRpcRow = {
  business_name: string;
  business_slug: string;
  public_description: string | null;
  public_instructions: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  branding_theme: string | null;
};

/**
 * Map RPC row → public profile. Rejects unknown themes to the default appearance.
 * Does not pass through private business columns.
 */
export function mapPublicBusinessProfile(
  row: PublicQueueRpcRow,
): PublicBusinessProfile {
  const theme =
    row.branding_theme && isBrandingTheme(row.branding_theme)
      ? row.branding_theme
      : "default";

  return {
    businessName: row.business_name,
    businessSlug: row.business_slug,
    publicDescription: row.public_description ?? null,
    publicInstructions: row.public_instructions ?? null,
    contactEmail: row.contact_email ?? null,
    contactPhone: row.contact_phone ?? null,
    brandingTheme: theme,
  };
}

export function brandingThemeLabel(theme: BrandingTheme): string {
  switch (theme) {
    case "default":
      return "Default";
    case "minimal":
      return "Minimal";
    case "warm":
      return "Warm";
    case "professional":
      return "Professional";
    default: {
      const _exhaustive: never = theme;
      return _exhaustive;
    }
  }
}

export function publicQueueThemeClass(theme: BrandingTheme): string {
  switch (theme) {
    case "minimal":
      return "pq-theme-minimal";
    case "warm":
      return "pq-theme-warm";
    case "professional":
      return "pq-theme-professional";
    case "default":
    default:
      return "pq-theme-default";
  }
}
