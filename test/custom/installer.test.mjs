import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  cpSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
const tool = resolve("streamdex-setup");
test("installer verifies integrity, repeats safely, upgrades with backup, and rolls back without touching unrelated setup", () => {
  const dir = mkdtempSync(join(tmpdir(), "streamdex-install-"));
  try {
    writeFileSync(join(dir, ".streamdex-test-root"), "fixture");
    const base = join(dir, "Library/Application Support"),
      deck = join(base, "com.elgato.StreamDeck"),
      other = join(deck, "Plugins/other.sdPlugin");
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, "keep"), "unchanged");
    const call = (cmd, extra = []) => {
      const r = spawnSync(tool, [cmd, "--test-root", dir, ...extra], {
        encoding: "utf8",
      });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      return r.stdout;
    };
    assert.match(call("inspect"), /"changesMade" : false/);
    call("install");
    call("verify");
    assert.match(call("install"), /No profiles or settings changed/);
    assert.equal(readFileSync(join(other, "keep"), "utf8"), "unchanged");
    call("rollback");
    assert.equal(
      existsSync(join(deck, "Plugins/io.streamdex.plugin.sdPlugin")),
      false,
    );
    assert.equal(readFileSync(join(other, "keep"), "utf8"), "unchanged");
    const installed = join(
      deck,
      "Plugins/io.streamdex.plugin.sdPlugin",
    );
    mkdirSync(installed, { recursive: true });
    writeFileSync(join(installed, "previous"), "prior build");
    call("install", ["--light", "demo-light.local"]);
    call("verify");
    call("rollback");
    assert.equal(
      readFileSync(join(installed, "previous"), "utf8"),
      "prior build",
    );
    assert.equal(readFileSync(join(other, "keep"), "utf8"), "unchanged");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("installer refuses unmarked test roots and invalid lighting hosts", () => {
  const r = spawnSync(tool, ["install", "--test-root", "/tmp"], {
    encoding: "utf8",
  });
  assert.notEqual(r.status, 0);
  const invalid = spawnSync(tool, ["install", "--light", "bad/host"], {
    encoding: "utf8",
  });
  assert.notEqual(invalid.status, 0);
});


test("tampered prebuilt files fail installation before any local settings change", () => {
 const dir=mkdtempSync(join(tmpdir(),'streamdex-integrity-'));
 try {
  const kit=join(dir,'kit'),home=join(dir,'home');mkdirSync(kit);mkdirSync(home);writeFileSync(join(home,'.streamdex-test-root'),'fixture');
  for(const f of ['streamdex-setup','payload.json','io.streamdex.plugin.streamDeckPlugin','io.streamdex.plugin.sdPlugin'])cpSync(resolve(f),join(kit,f),{recursive:true});
  writeFileSync(join(kit,'io.streamdex.plugin.sdPlugin/bin/plugin.js'),'tampered');
  const result=spawnSync(join(kit,'streamdex-setup'),['install','--test-root',home],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/integrity check failed/);assert.equal(existsSync(join(home,'Library/Application Support/Streamdex/install.json')),false);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
