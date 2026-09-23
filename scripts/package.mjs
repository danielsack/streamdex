import { readVersion } from "./version.mjs";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, ".."),
  id = "io.streamdex.plugin",
  plugin = id + ".sdPlugin";
process.chdir(root);
const { version, archiveName } = readVersion(root);
function run(file, args, opts = {}) {
  const r = spawnSync(file, args, { stdio: "inherit", ...opts });
  if (r.error || r.status !== 0) throw r.error || Error(file + " failed");
}
run(process.execPath, [
  "node_modules/@elgato/cli/bin/streamdeck.mjs",
  "validate",
  plugin,
]);
run(process.execPath, [
  "node_modules/@elgato/cli/bin/streamdeck.mjs",
  "pack",
  plugin,
  "--output",
  root,
  "--force",
]);
const sha = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) throw Error("Symlink in payload");
    return e.isDirectory() ? walk(p) : [p];
  });
}
const payloadFiles = [
  ...walk(plugin),
  id + ".streamDeckPlugin",
  "streamdex-setup",
].sort();
writeFileSync(
  "payload.json",
  JSON.stringify(
    {
      version,
      files: Object.fromEntries(payloadFiles.map((f) => [f, sha(f)])),
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  "SHA256SUMS",
  [...payloadFiles, "payload.json"].map((f) => sha(f) + "  " + f).join("\n") +
    "\n",
);
if (!existsSync("release-files.json"))
  throw Error(
    "Review and create release-files.json before packaging the setup ZIP",
  );
const files = JSON.parse(readFileSync("release-files.json", "utf8")).files;
for (const f of files) {
  if (
    f.startsWith("/") ||
    f.split("/").includes("..") ||
    !lstatSync(f).isFile() ||
    lstatSync(f).isSymbolicLink()
  )
    throw Error("Unsafe release entry: " + f);
}
mkdirSync(".dist", { recursive: true });
run("/usr/bin/zip", ["-q", "-X", "-FS", `.dist/${archiveName}`, "-@"], {
  input: files.join("\n") + "\n",
  stdio: ["pipe", "inherit", "inherit"],
});
writeFileSync(
  ".dist/SHA256SUMS",
  sha(`.dist/${archiveName}`) + `  ${archiveName}\n`,
);
console.log("Packaged local release kit; nothing uploaded.");
