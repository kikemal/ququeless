/**
 * Read an environment variable at runtime.
 * Direct `process.env.NEXT_PUBLIC_*` access is frozen at build time, so a
 * value added in the host after the build would stay empty.
 */
export function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
