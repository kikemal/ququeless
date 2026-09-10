/**
 * Build canonical public URLs for QueueLess.
 * Origin comes from server env — never from client-supplied arbitrary hosts.
 */

function normalizeOrigin(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function getAppOrigin(): string | null {
  return normalizeOrigin(
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL,
  );
}

/**
 * Public queue page for a business slug: /q/[slug]
 * Returns null if origin or slug is invalid.
 */
export function buildPublicQueuePath(slug: string): string | null {
  const cleaned = slug.trim();
  if (!cleaned) {
    return null;
  }

  // Reject path traversal / absolute URLs in slug.
  if (
    cleaned.includes("/") ||
    cleaned.includes("\\") ||
    cleaned.includes("..") ||
    cleaned.includes(":") ||
    cleaned.includes("?") ||
    cleaned.includes("#")
  ) {
    return null;
  }

  return `/q/${encodeURIComponent(cleaned)}`;
}

export function buildPublicQueueUrl(
  slug: string,
  origin: string | null = getAppOrigin(),
): string | null {
  const safeOrigin =
    typeof origin === "string" ? normalizeOrigin(origin) : origin;

  if (!safeOrigin) {
    return null;
  }

  const path = buildPublicQueuePath(slug);
  if (!path) {
    return null;
  }

  return `${safeOrigin}${path}`;
}

export function isPublicQueueUrlForSlug(
  url: string,
  slug: string,
  origin: string | null = getAppOrigin(),
): boolean {
  const expected = buildPublicQueueUrl(slug, origin);
  return expected !== null && url === expected;
}
