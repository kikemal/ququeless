import nodeProcess from "node:process";

let probed = false;

/**
 * Read an environment variable at runtime.
 * Next inlines `process.env.NEXT_PUBLIC_*` at build time, and a dynamic
 * lookup on that same `process.env` object can miss values the host injects
 * only when the function starts. `node:process` is the live environment.
 */
export function readEnv(name: string): string | undefined {
  const fromRuntime = nodeProcess.env[name]?.trim() ?? "";
  const fromBundled = process.env[name]?.trim() ?? "";

  if (!probed && name.startsWith("NEXT_PUBLIC_SUPABASE")) {
    probed = true;
    console.error(
      "env-probe",
      process.version,
      "runtime",
      fromRuntime.length,
      "bundled",
      fromBundled.length,
      "listed",
      Object.prototype.hasOwnProperty.call(nodeProcess.env, name),
    );
  }

  const value = fromRuntime || fromBundled;
  return value ? value : undefined;
}
