import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const result = spawnSync(
  "npx",
  ["supabase", "gen", "types", "typescript", "--local"],
  {
    encoding: "utf8",
    shell: true,
  },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || "Failed to generate database types\n");
  process.exit(result.status ?? 1);
}

const outPath = resolve("types/database.ts");
writeFileSync(outPath, result.stdout, { encoding: "utf8" });
process.stdout.write(`Wrote ${outPath}\n`);
