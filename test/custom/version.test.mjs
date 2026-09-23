import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseVersion, setVersion } from "../../scripts/version.mjs";
import { checkVersion } from "../../scripts/check-version.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "streamdex-version-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), JSON.stringify(value));
  };
  const version = "2.3.4-beta.8";
  write("package.json", { version });
  write("package-lock.json", { version, packages: { "": { version } } });
  write("io.streamdex.plugin.sdPlugin/manifest.json", { Version: "2.3.4.8" });
  write("payload.json", { version });
  write("profile-src/example/manifest.json", {
    actions: [{ Plugin: { UUID: "io.streamdex.plugin", Version: "2.3.4.8" } }],
  });
  writeFileSync(join(root, "CHANGELOG.md"), "## [2.3.4-beta.8]\n");
  return { root, write };
}

test("beta candidates precede stable versions in Stream Deck's numeric ordering", () => {
  assert.equal(parseVersion("2.3.4-beta.9").pluginVersion, "2.3.4.9");
  assert.equal(parseVersion("2.3.4-beta.65534").pluginVersion, "2.3.4.65534");
  assert.equal(parseVersion("2.3.4").pluginVersion, "2.3.4.65535");
  assert.equal(
    parseVersion("2.3.4-beta.9").archiveName,
    "streamdex-2.3.4-beta.9-macos-arm64.zip",
  );
  for (const value of [
    "01.2.3",
    "1.2",
    "1.2.3-beta.0",
    "1.2.3-beta.01",
    "1.2.3-beta.65535",
    "65536.0.0",
    "1.2.3-rc.1",
    "1.2.3+build",
    "1.2.3\n",
    "1.2.3-beta.2\n",
    "../other",
  ])
    assert.throws(() => parseVersion(value));
});

test("version preparation updates source metadata and rejects reuse or decreases", (t) => {
  const { root } = fixture(t);
  setVersion(root, "2.3.4-beta.9");
  const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
  assert.equal(read("package-lock.json").packages[""].version, "2.3.4-beta.9");
  assert.equal(
    read("io.streamdex.plugin.sdPlugin/manifest.json").Version,
    "2.3.4.9",
  );
  assert.throws(() => setVersion(root, "2.3.4-beta.9"), /increase/);
  assert.throws(() => setVersion(root, "2.3.3"), /increase/);
  setVersion(root, "2.3.4");
  assert.throws(() => setVersion(root, "2.3.4-beta.10"), /increase/);
  setVersion(root, "2.3.5-beta.1");
  // Generated artifacts must be rebuilt, not silently claimed to be current.
  assert.throws(() => checkVersion(root), /payload version mismatch/);
});

test("CI rejects drift in lockfile, payload, profiles, manifest, or changelog", (t) => {
  const { root, write } = fixture(t);
  assert.equal(checkVersion(root).version, "2.3.4-beta.8");
  for (const [path, value, message] of [
    [
      "package-lock.json",
      {
        version: "2.3.4-beta.7",
        packages: { "": { version: "2.3.4-beta.8" } },
      },
      /package-lock/,
    ],
    ["payload.json", { version: "2.3.4-beta.7" }, /payload/],
    [
      "io.streamdex.plugin.sdPlugin/manifest.json",
      { Version: "2.3.4.7" },
      /plugin manifest/,
    ],
    [
      "profile-src/example/manifest.json",
      {
        actions: [
          { Plugin: { UUID: "io.streamdex.plugin", Version: "2.3.4.7" } },
        ],
      },
      /profile action/,
    ],
  ]) {
    const original = readFileSync(join(root, path));
    write(path, value);
    assert.throws(() => checkVersion(root), message);
    writeFileSync(join(root, path), original);
  }
  writeFileSync(join(root, "CHANGELOG.md"), "## [Unreleased]\n");
  assert.throws(() => checkVersion(root), /CHANGELOG/);
});
