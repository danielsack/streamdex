import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(import.meta.dirname, "..");
export const pluginId = "io.streamdex.plugin";

// Stream Deck accepts four numeric components, not SemVer prerelease labels.
// Reserve the final revision for stable so beta -> stable always upgrades.
export function parseVersion(value) {
  if (typeof value !== "string") throw Error("Version must be a string");
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.([1-9]\d*))?$/.exec(
      value,
    );
  if (!match || match[0] !== value)
    throw Error("Use MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-beta.N");
  const parts = match.slice(1, 4).map(Number);
  const revision = match[4] === undefined ? 65535 : Number(match[4]);
  if (
    parts.some((part) => part > 65535) ||
    revision > (match[4] ? 65534 : 65535)
  )
    throw Error("Version exceeds Stream Deck's numeric range");
  return {
    version: value,
    pluginVersion: [...parts, revision].join("."),
    order: [...parts, revision],
    archiveName: `streamdex-${value}-macos-arm64.zip`,
  };
}

export function readVersion(root = repositoryRoot) {
  return parseVersion(
    JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version,
  );
}

export function setVersion(root, next) {
  const current = readVersion(root);
  const parsed = parseVersion(next);
  const difference = parsed.order
    .map((part, index) => part - current.order[index])
    .find((part) => part !== 0);
  if (!(difference > 0)) throw Error("The next version must increase");
  const paths = [
    "package.json",
    "package-lock.json",
    `${pluginId}.sdPlugin/manifest.json`,
  ];
  // Read and validate all input files before writing anything.
  const values = paths.map((path) =>
    JSON.parse(readFileSync(resolve(root, path), "utf8")),
  );
  if (!values[1].packages?.[""]) throw Error("Missing root package-lock entry");
  values[0].version = values[1].version = values[1].packages[""].version = next;
  values[2].Version = parsed.pluginVersion;
  paths.forEach((path, index) =>
    writeFileSync(
      resolve(root, path),
      JSON.stringify(values[index], null, 2) + "\n",
    ),
  );
  return parsed;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 3)
    throw Error("Usage: npm run version:set -- VERSION");
  const result = setVersion(repositoryRoot, process.argv[2]);
  console.log(
    `Set ${result.version} (Stream Deck ${result.pluginVersion}). Update CHANGELOG.md, then build, package, check, and audit. No commit, tag, push, or release was created.`,
  );
}
