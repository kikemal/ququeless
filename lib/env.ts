import nodeProcess from "node:process";

/**
 * Read an environment variable at runtime.
 * Next inlines `process.env.NEXT_PUBLIC_*` at build time, and a dynamic
 * lookup on that same `process.env` object can miss values the host injects
 * only when the function starts. `node:process` is the live environment.
 */
export function readEnv(name: string): string | undefined {
  const value = (nodeProcess.env[name] ?? process.env[name])?.trim();
  return value ? value : undefined;
}
