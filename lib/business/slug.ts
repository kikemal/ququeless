/**
 * Convert a business name into a URL-safe slug base.
 * Uniqueness suffixes are applied separately when collisions occur.
 */
export function slugifyBusinessName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (slug.length >= 2) {
    return slug.slice(0, 64).replace(/-+$/g, "");
  }

  return "business";
}

export function slugWithSuffix(base: string, attempt: number): string {
  if (attempt <= 1) {
    return base.slice(0, 64);
  }

  const suffix = `-${attempt}`;
  const maxBaseLength = Math.max(1, 64 - suffix.length);
  return `${base.slice(0, maxBaseLength).replace(/-+$/g, "")}${suffix}`;
}
