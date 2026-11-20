import { projectAccountState } from "../../src/custom/codex-account-state.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

// Account fixtures are fictional. The renderer owner and read identity are
// deliberately different hashes, matching the app's current persistence schema.
const hash = (parts) =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const accountA = { accountId: "account-a", userId: "user-a" },
  accountB = { accountId: "account-b", userId: "user-b" };
const owner = (a) => hash([a.userId, a.accountId]),
  identity = (a) => hash(["chatgpt", a.accountId, a.userId]);
const multi = {
  "electron-renderer-content-owner": owner(accountA),
  ["electron-owner-atoms:" + owner(accountA)]: {
    "primary-aeon-selection-v1": accountA,
  },
  ["electron-owner-atoms:" + owner(accountB)]: {
    "primary-aeon-selection-v1": accountB,
  },
  "electron-thread-read-state-v1": {
    version: 1,
    unreadByIdentity: {
      [identity(accountA)]: {
        "local:fixture": ["new"],
        "durable:fixture": ["viewed"],
        "local:other": ["viewed"],
      },
      [identity(accountB)]: { "local:fixture": ["viewed"] },
    },
    legacyMigration: {
      identityKey: identity(accountA),
      adoptedHostIds: { local: "local:fixture" },
    },
  },
};
assert.equal(
  projectRead(task, localUnread(multi), 3000, 5000).status,
  "read",
  "other account and host unread flags cannot affect the active account",
);
assert.equal(
  projectRead(
    { ...task, id: "new", status: "read" },
    localUnread(multi),
    3000,
    5000,
  ).status,
  "unread",
  "active unread remains READY",
);
const switched = structuredClone(multi);
switched["electron-renderer-content-owner"] = owner(accountB);
assert.equal(
  projectRead(task, localUnread(switched), 3000, 5000).status,
  "unread",
  "switch uses current account, not legacy migration account",
);
for (const change of [
  (s) => (s["electron-renderer-content-owner"] = "signed-out"),
  (s) => (s["electron-renderer-content-owner"] = null),
  (s) => (s["electron-renderer-content-owner"] = hash(["unknown"])),
  (s) => delete s["electron-owner-atoms:" + owner(accountA)],
  (s) =>
    (s["electron-owner-atoms:" + owner(accountA)]["primary-aeon-selection-v1"] =
      accountB),
  (s) =>
    (s["electron-owner-atoms:" + owner(accountA)][
      "primary-aeon-selection-v1"
    ].accountId = ""),
  (s) =>
    delete s["electron-thread-read-state-v1"].unreadByIdentity[
      identity(accountA)
    ],
  (s) =>
    delete s["electron-thread-read-state-v1"].unreadByIdentity[
      identity(accountA)
    ]["local:fixture"],
  (s) =>
    (s["electron-thread-read-state-v1"].unreadByIdentity[identity(accountA)][
      "local:fixture"
    ] = [null]),
  (s) =>
    (s["electron-thread-read-state-v1"].legacyMigration.adoptedHostIds.local =
      "remote:fixture"),
]) {
  const copy = structuredClone(multi);
  change(copy);
  assert.equal(
    localUnread(copy),
    undefined,
    "unproven current owner or host fails closed",
  );
}
const olderOwner = structuredClone(multi);
delete olderOwner["electron-renderer-content-owner"];
olderOwner["electron-account-renderer-state-v1"] = { owner: owner(accountA) };
olderOwner["electron-persisted-atom-state"] = {
  "primary-aeon-selection-v1": accountA,
};
assert.equal(
  projectRead(task, localUnread(olderOwner), 3000, 5000).status,
  "read",
);
const cleared = structuredClone(state);
cleared["electron-thread-read-state-v1"].legacyMigration.cleared = true;
assert.equal(localUnread(cleared), undefined);
let current = multi,
  clock = 10000,
  version = 1,
  accountReads = 0;
const accounts = createCodexReadResolver("/fixture", {
  now: () => clock,
  stat: () => ({ size: 2000, mtimeMs: version, ctimeMs: version }),
  read: () => {
    accountReads++;
    return JSON.stringify(current);
  },
});
const finished = { ...task, completedAt: 1 };
assert.equal(accounts(finished).status, "read");
clock += 1001;
assert.equal(accounts(finished).status, "read");
assert.equal(accountReads, 1);
current = switched;
clock += 1001;
version++;
assert.equal(accounts(finished).status, "unread");
current = { ...multi, "electron-renderer-content-owner": "signed-out" };
clock += 1001;
version++;
assert.equal(
  accounts(finished).status,
  "unread",
  "sign-out invalidates the previous account cache",
);
console.log(
  "PASS: active account selection, account switches, host isolation, signed-out and mismatched ownership, and cache invalidation.",
);

// Activity consumers can reuse the same verified scope without selecting a
// different account or stale legacy data. No companion-specific state is shipped.
const activity = structuredClone(multi);
activity["electron-owner-atoms:" + owner(accountA)].activityAt = 1000;
activity["electron-owner-atoms:" + owner(accountB)].activityAt = 2000;
activity["electron-persisted-atom-state"] = { activityAt: 3000 };
assert.equal(projectAccountState(activity).atoms.activityAt, 1000);
activity["electron-renderer-content-owner"] = owner(accountB);
assert.equal(projectAccountState(activity).atoms.activityAt, 2000);
activity["electron-renderer-content-owner"] = "signed-out";
assert.equal(projectAccountState(activity), undefined);
console.log(
  "PASS: reusable account projection isolates current activity metadata.",
);
