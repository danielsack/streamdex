import assert from "node:assert/strict";
import {
  localUnread,
  projectRead,
  createCodexReadResolver,
} from "../../src/custom/codex-read-state.mjs";
const state = {
  "electron-thread-read-state-v1": {
    version: 1,
    unreadByIdentity: { account: { "local:fixture": ["new"] } },
    legacyMigration: {
      identityKey: "account",
      adoptedHostIds: { local: "local:fixture" },
    },
  },
};
const unread = localUnread(state),
  task = { id: "viewed", status: "unread", completedAt: 1000 };
assert.equal(projectRead(task, unread, 3000, 5000).status, "read");
assert.equal(
  projectRead({ ...task, id: "new", status: "read" }, unread, 3000, 5000)
    .status,
  "unread",
);
for (const status of ["running", "thinking", "needs-input", "error"])
  assert.equal(
    projectRead({ ...task, status }, unread, 3000, 5000).status,
    status,
  );
assert.equal(projectRead(task, unread, 999, 5000).status, "unread");
assert.equal(projectRead(task, unread, 3000, 2000).status, "unread");
for (const change of [
  (s) => (s.version = 2),
  (s) => (s.legacyMigration.identityKey = "other"),
  (s) => (s.legacyMigration.adoptedHostIds.local = "remote:fixture"),
  (s) => (s.unreadByIdentity.other = {}),
  (s) => (s.unreadByIdentity.account["local:fixture"] = null),
]) {
  const copy = structuredClone(state);
  change(copy["electron-thread-read-state-v1"]);
  assert.equal(localUnread(copy), undefined);
}
let time = 5000,
  fail = false,
  reads = 0,
  mtime = 3000;
const resolver = createCodexReadResolver("/fixture", {
  now: () => time,
  stat: () => ({ mtimeMs: mtime, size: 100 }),
  read: () => {
    reads++;
    if (fail) throw Error("fixture unreadable");
    return JSON.stringify(state);
  },
});
assert.equal(resolver(task).status, "read");
time += 1001;
assert.equal(resolver(task).status, "read");
assert.equal(reads, 1, "unchanged state is not reparsed");
fail = true;
mtime++;
time += 1001;
assert.equal(resolver(task).status, "unread");
assert.equal(task.status, "unread", "does not mutate store or ledger");
console.log(
  "PASS: native read/unread parity, account/host/schema guards, new completion, running/input precedence, failed reads, no ledger mutation.",
);

let oversizedReads = 0;
const oversized = createCodexReadResolver("/fixture", {
  now: () => 5000,
  stat: () => ({ mtimeMs: 3000, size: 9 * 1024 * 1024 }),
  read: () => {
    oversizedReads++;
    return "{}";
  },
});
assert.equal(oversized(task).status, "unread");
assert.equal(oversizedReads, 0);
console.log("PASS: unchanged-file caching and oversized-state refusal.");
