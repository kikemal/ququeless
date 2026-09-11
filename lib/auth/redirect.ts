/**
 * Safe post-auth redirects. Only allow same-origin relative paths we own.
 */
export function getSafeAuthRedirect(
  nextPath: string | null | undefined,
): string | null {
  if (!nextPath) {
    return null;
  }

  const trimmed = nextPath.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  if (trimmed.startsWith("/invite/")) {
    const raw = trimmed.slice("/invite/".length).split(/[?#]/)[0] ?? "";
    if (!raw || raw.includes("/") || raw.includes("..") || raw.includes("\\")) {
      return null;
    }
    let token: string;
    try {
      token = decodeURIComponent(raw);
    } catch {
      return null;
    }
    // Invitation tokens are hex from gen_random_bytes
    if (!/^[a-f0-9]+$/i.test(token) || token.length < 32) {
      return null;
    }
    return `/invite/${token}`;
  }

  if (trimmed === "/dashboard" || trimmed.startsWith("/dashboard/")) {
    return trimmed;
  }

  return null;
}
