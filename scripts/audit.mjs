import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const result = spawnSync(
  "python3",
  [resolve(root, "scripts/audit.py"), ...process.argv.slice(2)],
  { cwd: root, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
