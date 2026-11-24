import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  statSync,
  rmSync,
  unlinkSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createSqliteStateReader } from "../../src/custom/codex-global-state.mjs";
import { createCodexReadResolver } from "../../src/custom/codex-read-state.mjs";

const hash = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const account = { userId: "fixture-user", accountId: "fixture-account" };
const owner = hash([account.userId, account.accountId]);
const identity = hash(["chatgpt", account.accountId, account.userId]);
const scope = "electron-owner-atoms:" + owner;
const task = { id: "fixture-viewed", status: "unread", completedAt: 1000 };
const state = (ids) => ({
  "electron-renderer-content-owner": owner,
  [scope]: { "primary-aeon-selection-v1": account },
  "electron-thread-read-state-v1": {
    version: 1,
    unreadByIdentity: { [identity]: { "local:fixture": ids } },
    legacyMigration: {
      identityKey: identity,
      adoptedHostIds: { local: "local:fixture" },
    },
  },
});
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "streamdex-state-fixture-"));
  const json = join(dir, ".codex-global-state.json"),
    path = join(dir, ".codex-global-state.sqlite");
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE settings (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(scope,key)) WITHOUT ROWID; PRAGMA user_version=1",
  );
  const put = (s, k, value) =>
    db
      .prepare("INSERT OR REPLACE INTO settings VALUES (?,?,?)")
      .run(s, k, JSON.stringify(value));
  put("global", "electron-renderer-content-owner", owner);
  put(
    "global",
    "electron-thread-read-state-v1",
    state([])["electron-thread-read-state-v1"],
  );
  put(scope, "primary-aeon-selection-v1", account);
  writeFileSync(json, JSON.stringify(state([task.id])));
  t.after(() => {
    if (db.isOpen) db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { db, json, path, put };
}

test("SQLite supersedes stale JSON; older versions still use JSON when the database is absent", (t) => {
  const f = fixture(t),
    now = Date.now();
  const resolve = createCodexReadResolver(f.json, { now: () => now });
  const before = readFileSync(f.path),
    legacy = readFileSync(f.json);
  assert.equal(resolve(task).status, "read");
  assert.deepEqual(
    readFileSync(f.path),
    before,
    "reading does not change the database",
  );
  assert.deepEqual(
    readFileSync(f.json),
    legacy,
    "reading does not change the legacy store",
  );
  for (const status of ["running", "thinking", "needs-input", "error"])
    assert.equal(resolve({ ...task, status }).status, status);
  assert.equal(
    resolve({ ...task, completedAt: now - 1000 }).status,
    "unread",
    "new completion grace is retained",
  );
  f.db.close();
  unlinkSync(f.path);
  assert.equal(createCodexReadResolver(f.json)(task).status, "unread");
  writeFileSync(f.json, JSON.stringify(state([])));
  assert.equal(createCodexReadResolver(f.json)(task).status, "read");
});

test("WAL-only updates refresh SEEN/READY and account/host changes invalidate the projection", (t) => {
  const f = fixture(t);
  f.db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
  let clock = Date.now();
  const resolve = createCodexReadResolver(f.json, { now: () => clock });
  assert.equal(resolve(task).status, "read");
  const mainMtime = statSync(f.path).mtimeMs;
  f.put(
    "global",
    "electron-thread-read-state-v1",
    state([task.id])["electron-thread-read-state-v1"],
  );
  assert.equal(
    statSync(f.path).mtimeMs,
    mainMtime,
    "fixture writes only to WAL",
  );
  clock += 1001;
  assert.equal(resolve(task).status, "unread");
  f.put(
    "global",
    "electron-thread-read-state-v1",
    state([])["electron-thread-read-state-v1"],
  );
  clock += 1001;
  assert.equal(resolve(task).status, "read");
  f.put("global", "electron-renderer-content-owner", "signed-out");
  clock += 1001;
  assert.equal(
    resolve(task).status,
    "unread",
    "cannot retain previous account after sign out",
  );
  f.put("global", "electron-renderer-content-owner", owner);
  const wrongHost = state([])["electron-thread-read-state-v1"];
  wrongHost.legacyMigration.adoptedHostIds.local = "local:other";
  f.put("global", "electron-thread-read-state-v1", wrongHost);
  clock += 1001;
  assert.equal(resolve(task).status, "unread", "must use exact adopted host");
  f.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  f.put(
    "global",
    "electron-thread-read-state-v1",
    state([])["electron-thread-read-state-v1"],
  );
  clock += 1001;
  assert.equal(
    resolve(task).status,
    "read",
    "recovers after checkpoint and WAL truncation",
  );
});

test("a locked, corrupt, unsupported, or incomplete database never revives stale JSON", (t) => {
  const f = fixture(t);
  writeFileSync(f.json, JSON.stringify(state([])));
  const read = createSqliteStateReader(f.json);
  f.db.exec("BEGIN EXCLUSIVE");
  const start = performance.now();
  assert.throws(() => read());
  assert.ok(performance.now() - start < 250, "no multi-second busy wait");
  assert.equal(createCodexReadResolver(f.json)(task).status, "unread");
  f.db.exec("ROLLBACK");
  assert.ok(read());
  f.db.exec("PRAGMA user_version=2");
  assert.equal(createCodexReadResolver(f.json)(task).status, "unread");
  f.db.exec("PRAGMA user_version=1; DELETE FROM settings");
  assert.equal(createCodexReadResolver(f.json)(task).status, "unread");
  f.db.exec(
    "DROP TABLE settings; CREATE TABLE settings(scope TEXT, key TEXT, value TEXT)",
  );
  assert.equal(createCodexReadResolver(f.json)(task).status, "unread");
  f.db.close();
  writeFileSync(f.path, "invalid sqlite");
  assert.equal(createCodexReadResolver(f.json)(task).status, "unread");
});

test("oversized selected values are rejected; unrelated history values are never parsed", (t) => {
  const f = fixture(t);
  const read = createSqliteStateReader(f.json);
  f.db
    .prepare("INSERT INTO settings VALUES (?,?,?)")
    .run(scope, "unrelated-history", "not JSON");
  assert.ok(read());
  f.db
    .prepare("UPDATE settings SET value=zeroblob(?) WHERE scope=? AND key=?")
    .run(4 * 1024 * 1024 + 1, "global", "electron-thread-read-state-v1");
  assert.throws(() => read());
  assert.equal(createCodexReadResolver(f.json)(task).status, "unread");
});

test("legacy atom scope inside SQLite retains verified account compatibility", (t) => {
  const f = fixture(t);
  f.db.exec("DELETE FROM settings WHERE key='electron-renderer-content-owner'");
  f.put("global", "electron-account-renderer-state-v1", { owner });
  f.put("atom", "primary-aeon-selection-v1", account);
  assert.equal(createCodexReadResolver(f.json)(task).status, "read");
});

test("a completion newer than the abandoned JSON can still be SEEN from current SQLite evidence", (t) => {
  const f = fixture(t),
    now = Date.now();
  writeFileSync(f.json, JSON.stringify(state([])));
  utimesSync(f.json, 1, 1);
  const recent = { ...task, completedAt: now - 5000 };
  assert.equal(
    createCodexReadResolver(f.json, { now: () => now })(recent).status,
    "read",
  );
  f.db.close();
  unlinkSync(f.path);
  assert.equal(
    createCodexReadResolver(f.json, { now: () => now })(recent).status,
    "unread",
    "old file cannot prove a newer completion has been read",
  );
});
