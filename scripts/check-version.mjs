import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readVersion, repositoryRoot, pluginId } from "./version.mjs";

export function checkVersion(root = repositoryRoot) {
  const { version, pluginVersion } = readVersion(root);
  const json = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  const equal = (actual, expected, label) => {
    if (actual !== expected)
      throw Error(`${label} version mismatch: expected ${expected}`);
  };
  const lock = json("package-lock.json");
  equal(lock.version, version, "package-lock");
  equal(lock.packages?.[""].version, version, "package-lock root");
  equal(
    json(`${pluginId}.sdPlugin/manifest.json`).Version,
    pluginVersion,
    "plugin manifest",
  );
  equal(json("payload.json").version, version, "payload");
  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
  if (
    !changelog
      .split("\n")
      .some(
        (line) =>
          line === `## [${version}]` || line.startsWith(`## [${version}] - `),
      )
  )
    throw Error("The current version needs a CHANGELOG.md entry");
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (value.Plugin?.UUID === pluginId)
      equal(value.Plugin.Version, pluginVersion, "profile action");
    Object.values(value).forEach(visit);
  }
  function walk(directory) {
    for (const entry of readdirSync(resolve(root, directory), {
      withFileTypes: true,
    })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name === "manifest.json") visit(json(path));
    }
  }
  walk("profile-src");
  return { version, pluginVersion };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = checkVersion();
  console.log(
    `Version checks passed: ${result.version} / Stream Deck ${result.pluginVersion}`,
  );
}
