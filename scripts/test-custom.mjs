import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const group = process.argv[2] ?? "all";
const selectors = {
  all: () => true,
  fast: (name) => name !== "installer.test.mjs",
  tasks: (name) =>
    /^(controls|navigation|polling|request.*)\.test\.mjs$/.test(name),
  voice: (name) => name === "voice.test.mjs",
  install: (name) => /^(installer|profiles|version)\.test\.mjs$/.test(name),
};
if (!Object.hasOwn(selectors, group))
  throw new Error("Unknown custom test group");
const files = readdirSync(resolve(root, "test/custom"))
  .filter((name) => name.endsWith(".test.mjs") && selectors[group](name))
  .sort()
  .map((name) => `test/custom/${name}`);
if (!files.length) throw new Error("No tests selected");
const result = spawnSync(
  process.execPath,
  ["--test", ...process.argv.slice(3), ...files],
  {
    cwd: root,
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
