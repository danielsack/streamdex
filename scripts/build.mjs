import { build } from "esbuild";
import {
  existsSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, ".."),
  plugin = join(root, "io.streamdex.plugin.sdPlugin"),
  bin = join(plugin, "bin");
process.chdir(root);
mkdirSync(bin, { recursive: true });
function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      DEVELOPER_DIR:
        process.env.DEVELOPER_DIR || "/Library/Developer/CommandLineTools",
    },
  });
  if (r.error || r.status !== 0) throw r.error || Error(cmd + " failed");
}
run(process.execPath, ["scripts/generate-profiles.mjs"]);
run(process.execPath, ["scripts/generate-icons.mjs"]);
for (const [name, dir] of [
  ["codex-ui-control", "native"],
  ["travel-ui-control", "native/travel"],
  ["voice-control", "native/voice"],
  ["sidebar-control", "native/sidebar"],
  ["sidebar-fixtures", "native/sidebar"],
  ["streamdex-setup", "native/setup"],
  ["codex-ui-fixtures", "native"],
]) {
  const sources = readdirSync(dir)
    .filter(
      (f) =>
        f.endsWith(".swift") &&
        (name === "codex-ui-fixtures" || f !== "Fixtures.swift"),
    )
    .sort()
    .map((f) => join(dir, f));
  const target =
    name === "streamdex-setup"
      ? join(root, name)
      : name === "sidebar-fixtures"
        ? join(root, ".build/test-bin/sidebar-control")
        : name === "codex-ui-fixtures"
          ? join(root, ".build/test-bin/codex-ui-control")
          : join(bin, name);
  if (["codex-ui-fixtures", "sidebar-fixtures"].includes(name))
    mkdirSync(join(root, ".build/test-bin"), { recursive: true });
  run("/usr/bin/xcrun", [
    "swiftc",
    ...sources,
    ...(["codex-ui-fixtures", "sidebar-fixtures"].includes(name)
      ? ["-D", "STREAMDEX_TESTING"]
      : []),
    "-target",
    "arm64-apple-macos13.0",
    "-O",
    "-file-prefix-map",
    root + "=/streamdex",
    "-framework",
    "AppKit",
    "-framework",
    "ApplicationServices",
    "-o",
    target,
  ]);
  run("/usr/bin/codesign", ["--force", "--sign", "-", target]);
}
await build({
  entryPoints: ["src/plugin.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner: {
    js: 'import {createRequire} from "node:module"; const require=createRequire(import.meta.url);',
  },
  define: {
    __STREAMDECK_CODEX_BUILD__: JSON.stringify({
      schemaVersion: 1,
      pluginVersion: "0.1.0.1",
      commit: "local-candidate",
      treeState: "dirty",
    }),
  },
  sourcemap: false,
  outfile: join(bin, "plugin.js"),
});
for (const f of ["icons.json", "font-metrics.json"])
  copyFileSync(join(root, "src/custom", f), join(bin, f));
const license = readFileSync("LICENSE", "utf8");
writeFileSync(join(plugin, "LICENSE.txt"), license);
const names = [
  "@elgato/streamdeck",
  "@elgato/schemas",
  "@elgato/utils",
  "ws",
  "zod",
  "lucide-static",
];
writeFileSync(
  join(plugin, "THIRD_PARTY_LICENSES.txt"),
  names
    .map(
      (n) =>
        n + "\n\n" + readFileSync(join("node_modules", n, "LICENSE"), "utf8"),
    )
    .join("\n\n"),
);
for (const name of ["streamdex-plus", "streamdex-mobile"]) {
  const temp = join(root, ".build", name + ".sdProfile");
  rmSync(temp, { recursive: true, force: true });
  cpSync(join(root, "profile-src", name), temp, { recursive: true });
  run("/usr/bin/ditto", [
    "-c",
    "-k",
    "--norsrc",
    "--keepParent",
    temp,
    join(plugin, name + ".streamDeckProfile"),
  ]);
}
console.log("Built Streamdex candidate. No installed plugin was changed.");
