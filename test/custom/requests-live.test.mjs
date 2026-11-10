import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  createLiveInputObserver,
  inputSnapshot,
  inputPatches,
  pendingLiveInput,
} from "../../src/custom/codex-live-input.mjs";
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const state = (requests = [], flags = []) => ({
  id,
  hostId: "local",
  requests,
  threadRuntimeStatus: { type: "active", activeFlags: flags },
  turns: [{ privateText: "Do not retain" }],
});
const approval = {
  id: "a",
  method: "mcpServer/elicitation/request",
  params: { secret: "Do not retain" },
};
class Socket extends EventEmitter {
  writable = true;
  writableLength = 0;
  writes = [];
  write(bytes) {
    this.writes.push(JSON.parse(bytes.subarray(4)));
  }
  destroy() {
    this.writable = false;
    this.emit("close");
  }
}
function harness() {
  let time = 100000,
    changes = 0;
  const sockets = [];
  const observer = createLiveInputObserver("/fixture", {
    now: () => time,
    secure: () => true,
    connect: () => {
      const s = new Socket();
      sockets.push(s);
      return s;
    },
    onChange: () => changes++,
  });
  observer.update([id]);
  let sock = sockets[0];
  sock.emit("connect");
  function emit(m, split = false) {
    const b = Buffer.from(JSON.stringify(m)),
      h = Buffer.alloc(4);
    h.writeUInt32LE(b.length);
    const all = Buffer.concat([h, b]);
    if (split) for (const byte of all) sock.emit("data", Buffer.from([byte]));
    else sock.emit("data", all);
  }
  emit({
    type: "response",
    requestId: "streamdex-initialize",
    method: "initialize",
    resultType: "success",
    result: { clientId: "observer" },
  });
  function owner(thread = id, value = "owner") {
    const q = sock.writes.findLast(
      (m) =>
        m.method === "thread-owner-discovery" &&
        m.params.conversationId === thread,
    );
    assert(q);
    emit({
      type: "response",
      requestId: q.requestId,
      resultType: "success",
      handledByClientId: value,
    });
  }
  owner();
  function snapshot(s = state([approval]), extra = {}) {
    emit({
      type: "broadcast",
      sourceClientId: "owner",
      targetClientIds: ["observer"],
      method: "thread-stream-state-changed",
      version: 11,
      params: {
        hostId: "local",
        conversationId: id,
        change: { type: "snapshot", revision: 1, conversationState: s },
      },
      ...extra,
    });
  }
  function patches(p, revision = 2, baseRevision = 1) {
    emit({
      type: "broadcast",
      sourceClientId: "owner",
      method: "thread-stream-state-changed",
      version: 11,
      params: {
        hostId: "local",
        conversationId: id,
        change: { type: "patches", baseRevision, revision, patches: p },
      },
    });
  }
  return {
    observer,
    sock,
    emit,
    owner,
    snapshot,
    patches,
    sockets,
    advance: (n) => {
      time += n;
    },
    changes: () => changes,
  };
}

test("recognizes explicit approvals and input; ignores ordinary slow tools", () => {
  for (const method of [
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
    "item/permissions/requestApproval",
    "mcpServer/elicitation/request",
  ])
    assert.equal(
      pendingLiveInput(inputSnapshot(state([{ id: "a", method }]), id)).kind,
      "approval",
    );
  assert.equal(
    pendingLiveInput(
      inputSnapshot(
        state([{ id: "q", method: "item/tool/requestUserInput" }]),
        id,
      ),
    ).kind,
    "question",
  );
  assert.equal(
    pendingLiveInput(
      inputSnapshot(state([{ id: "run", method: "item/tool/call" }]), id),
    ),
    undefined,
  );
  assert.equal(
    pendingLiveInput(inputSnapshot(state([], ["waitingOnApproval"]), id)).kind,
    "approval",
  );
  assert.equal(
    pendingLiveInput(inputSnapshot(state([], ["waitingOnUserInput"]), id)).kind,
    "question",
  );
});
test("stores only minimal metadata and resolves individual requests", () => {
  const original = inputSnapshot(
    state([approval, { id: "q", method: "item/tool/requestUserInput" }]),
    id,
  );
  assert(!JSON.stringify(original).includes("Do not retain"));
  const next = inputPatches(original, [
    { op: "remove", path: ["requests", 0] },
  ]);
  assert.equal(pendingLiveInput(next).kind, "question");
  assert.equal(original.requests.length, 2);
  assert.equal(
    pendingLiveInput(
      inputPatches(next, [{ op: "remove", path: ["requests", 0] }]),
    ),
    undefined,
  );
});
test("validates exact host, identity, bounds, and unknown status patches", () => {
  assert.throws(() => inputSnapshot(state(), other));
  assert.throws(() => inputSnapshot({ ...state(), hostId: "remote" }, id));
  assert.throws(() => inputSnapshot(state(Array(65).fill(approval)), id));
  assert.throws(() =>
    inputPatches(inputSnapshot(state(), id), [
      {
        op: "replace",
        path: ["threadRuntimeStatus", "activeFlags"],
        value: [],
      },
    ]),
  );
});
test("subscription receives and clears approval without sending control requests", () => {
  const h = harness();
  try {
    h.snapshot();
    assert.equal(h.observer.requestFor({ id }).kind, "approval");
    assert.equal(h.observer.requestFor({ id: other }), undefined);
    h.patches([
      { op: "replace", path: ["requests"], value: [] },
      { op: "replace", path: ["threadRuntimeStatus"], value: { type: "idle" } },
    ]);
    assert.equal(h.observer.requestFor({ id }), undefined);
    assert(
      h.sock.writes.every((m) =>
        [
          "initialize",
          "thread-owner-discovery",
          "thread-stream-following-changed",
        ].includes(m.method),
      ),
    );
    h.observer.update([]);
    assert.equal(h.sock.writes.at(-1).params.following, false);
  } finally {
    h.observer.stop();
  }
});
test("foreign sender, host, and untargeted broadcasts cannot set INPUT", () => {
  const h = harness();
  try {
    h.snapshot(state([approval]), { sourceClientId: "foreign" });
    h.snapshot(state([approval]), { targetClientIds: ["other-client"] });
    assert.equal(h.observer.requestFor({ id }), undefined);
    h.snapshot({ ...state([approval]), hostId: "remote" });
    assert.equal(h.observer.requestFor({ id }), undefined);
  } finally {
    h.observer.stop();
  }
});
test("a revision gap or unknown version clears stale INPUT", () => {
  for (const kind of ["gap", "version"]) {
    const h = harness();
    try {
      h.snapshot();
      assert(h.observer.requestFor({ id }));
      if (kind === "gap")
        h.patches([{ op: "replace", path: ["requests"], value: [] }], 4, 3);
      else h.snapshot(state([approval]), { version: 12 });
      assert.equal(h.observer.requestFor({ id }), undefined);
    } finally {
      h.observer.stop();
    }
  }
});
test("disconnect and owner exit clear status immediately", () => {
  for (const kind of ["socket", "owner"]) {
    const h = harness();
    try {
      h.snapshot();
      if (kind === "socket") h.sock.destroy();
      else
        h.emit({
          type: "broadcast",
          method: "client-status-changed",
          params: { clientId: "owner", status: "disconnected" },
        });
      assert.equal(h.observer.requestFor({ id }), undefined);
    } finally {
      h.observer.stop();
    }
  }
});
test("ordinary history patches do not retain content or change pending state", () => {
  const h = harness();
  try {
    h.snapshot();
    h.patches([
      {
        op: "add",
        path: ["turnHistory", "items", 0],
        value: { text: "Private message" },
      },
    ]);
    assert.equal(h.observer.requestFor({ id }).kind, "approval");
  } finally {
    h.observer.stop();
  }
});
test("bounds subscriptions, declines ownership discovery, and rejects large frames", () => {
  const h = harness();
  try {
    h.observer.update(
      Array.from(
        { length: 20 },
        (_, n) =>
          String(n + 10).padStart(8, "0") + "-1111-4111-8111-111111111111",
      ),
    );
    assert(
      h.sock.writes.filter((m) => m.method === "thread-owner-discovery")
        .length <= 10,
    );
    h.emit({
      type: "client-discovery-request",
      requestId: "foreign-request",
      request: { method: "thread-follower-start-turn" },
    });
    assert.deepEqual(h.sock.writes.at(-1), {
      type: "client-discovery-response",
      requestId: "foreign-request",
      response: { canHandle: false },
    });
    const size = Buffer.alloc(4);
    size.writeUInt32LE(256 * 1024 * 1024 + 1);
    h.sock.emit("data", size);
    assert.equal(h.sock.writable, false);
  } finally {
    h.observer.stop();
  }
});
test("partial frames are decoded once and shutdown is final", () => {
  const h = harness();
  try {
    h.emit(
      {
        type: "broadcast",
        sourceClientId: "owner",
        method: "thread-stream-state-changed",
        version: 11,
        params: {
          hostId: "local",
          conversationId: id,
          change: {
            type: "snapshot",
            revision: 1,
            conversationState: state([approval]),
          },
        },
      },
      true,
    );
    assert(h.observer.requestFor({ id }));
    h.observer.stop();
    h.advance(20000);
    h.observer.update([id]);
    assert.equal(h.sockets.length, 1);
  } finally {
    h.observer.stop();
  }
});

test("same approval repaints after reconnect and incompatible streams back off", async () => {
  const h = harness();
  try {
    h.snapshot();
    await Promise.resolve();
    const initial = h.changes();
    h.snapshot(state([approval]), { version: 12 });
    await Promise.resolve();
    assert.equal(h.observer.requestFor({ id }), undefined);
    const discoveries = () =>
      h.sock.writes.filter((m) => m.method === "thread-owner-discovery").length;
    const before = discoveries();
    h.advance(20000);
    h.observer.update([id]);
    assert.equal(discoveries(), before);
    h.advance(40000);
    h.observer.update([id]);
    assert.equal(discoveries(), before + 1);
    h.owner();
    h.snapshot();
    await Promise.resolve();
    assert.equal(h.observer.requestFor({ id }).kind, "approval");
    assert.equal(h.changes(), initial + 2);
  } finally {
    h.observer.stop();
  }
});
test("removed subscriptions ignore late discovery replies when a task returns", () => {
  const h = harness();
  try {
    h.observer.update([id, other]);
    const old = h.sock.writes.findLast(
      (m) =>
        m.method === "thread-owner-discovery" &&
        m.params.conversationId === other,
    );
    h.observer.update([id]);
    h.observer.update([id, other]);
    const before = h.sock.writes.length;
    h.emit({
      type: "response",
      requestId: old.requestId,
      resultType: "success",
      handledByClientId: "old-owner",
    });
    assert.equal(h.sock.writes.length, before);
    h.owner(other, "current-owner");
    assert.equal(h.sock.writes.at(-1).targetClientIds[0], "current-owner");
  } finally {
    h.observer.stop();
  }
});

test("a large history snapshot does not clear another chat approval", () => {
  const h = harness();
  try {
    h.snapshot();
    h.observer.update([id, other]);
    h.owner(other);
    const large = {
      ...state(),
      id: other,
      turns: [{ text: "x".repeat(20 * 1024 * 1024) }],
    };
    h.emit({
      type: "broadcast",
      sourceClientId: "owner",
      method: "thread-stream-state-changed",
      version: 11,
      params: {
        hostId: "local",
        conversationId: other,
        change: { type: "snapshot", revision: 1, conversationState: large },
      },
    });
    assert.equal(h.observer.requestFor({ id }).kind, "approval");
    assert.equal(h.sock.writable, true);
    h.patches([{ op: "replace", path: ["requests"], value: [] }]);
    assert.equal(h.observer.requestFor({ id }), undefined);
  } finally {
    h.observer.stop();
  }
});
test("oversized metadata isolates only its chat and backs off", () => {
  const h = harness();
  try {
    h.snapshot();
    h.observer.update([id, other]);
    h.owner(other);
    h.emit({
      type: "broadcast",
      sourceClientId: "owner",
      method: "thread-stream-state-changed",
      version: 11,
      params: {
        hostId: "local",
        conversationId: other,
        change: {
          type: "snapshot",
          revision: 1,
          conversationState: {
            ...state(),
            id: other,
            requests: [{ id: "x", method: "x".repeat(5000) }],
          },
        },
      },
    });
    assert.equal(h.observer.requestFor({ id }).kind, "approval");
    assert.equal(h.sock.writable, true);
    const count = () =>
      h.sock.writes.filter(
        (m) =>
          m.method === "thread-owner-discovery" &&
          m.params.conversationId === other,
      ).length;
    const before = count();
    h.advance(60000);
    h.observer.update([id, other]);
    assert.equal(count(), before);
  } finally {
    h.observer.stop();
  }
});

test("a snapshot above the wire budget is drained without resetting other chats", () => {
  const h = harness();
  try {
    h.snapshot();
    h.observer.update([id, other]);
    h.owner(other);
    const prefix = Buffer.from(
      JSON.stringify({
        type: "broadcast",
        sourceClientId: "owner",
        method: "thread-stream-state-changed",
        version: 11,
        params: { hostId: "local", conversationId: other, change: {} },
      }).slice(0, -3) + '"conversationState":{"turns":["',
    );
    const suffix = Buffer.from('"]}}}}'),
      size = 65 * 1024 * 1024,
      header = Buffer.alloc(4);
    header.writeUInt32LE(prefix.length + size + suffix.length);
    h.sock.emit("data", Buffer.concat([header, prefix]));
    const filler = Buffer.alloc(65536, 120);
    for (let i = 0; i < size; i += filler.length) h.sock.emit("data", filler);
    h.sock.emit("data", suffix);
    assert.equal(h.sock.writable, true);
    assert.equal(h.observer.requestFor({ id }).kind, "approval");
    h.patches([{ op: "replace", path: ["requests"], value: [] }]);
    assert.equal(h.observer.requestFor({ id }), undefined);
  } finally {
    h.observer.stop();
  }
});
