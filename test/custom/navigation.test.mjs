import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installTravelPilot } from "../../src/custom/travel-pilot.mjs";
import { createReadLedger } from "../../src/custom/travel-state.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture(t, ownerName = "agentStatus") {
  const root = mkdtempSync(join(tmpdir(), "streamdex-navigation-"));
  let now = 1800000000000,
    focus = "task-b",
    order = ["task-a", "task-b"];
  const completed = { "task-a": now - 500, "task-b": now - 1000 };
  const acknowledged = {},
    calls = [],
    images = new Map(),
    logs = [];
  const snapshot = (id) => ({
    id,
    displayTitle: id === "task-a" ? "Design a garden" : "Review a recipe",
    status: (acknowledged[id] ?? 0) >= completed[id] ? "read" : "unread",
    completedAt: completed[id],
    lastEventAt: completed[id],
  });
  const store = {
    sessions: () => order.map(snapshot),
    focusedThread: () => snapshot(focus),
    invalidate() {},
    acknowledge(id, at) {
      acknowledged[id] = Math.max(acknowledged[id] ?? 0, at);
    },
  };
  const ledger = createReadLedger(join(root, "read.json"));
  let read = async () => ({ ok: false, appRunning: true, reason: "no-focus" });
  let navigate = async (id) => {
    focus = id;
    return { ok: true, threadId: id, windowId: "window-a" };
  };
  const owners = { agentStatus: {}, workdesk: {}, commandHandler: {} };
  const pilot = installTravelPilot({
    ...owners,
    store,
    settingsTargets: {},
    requestFor: () => undefined,
    readLedger: ledger,
    projectName: () => "Example",
    svgDataUrl: (s) => s,
    renderKey: async (action, svg) => images.set(action.id, svg),
    logger: { info: (s) => logs.push(s), warn: (s) => logs.push(s) },
    now: () => now,
    openThread: async () => {
      throw Error("Full composer opener must not be used for task keys");
    },
    nativeCall: async (command, id) => {
      calls.push({ command, id });
      if (command === "read") return read(id);
      if (command === "confirm")
        return { ok: focus === id, threadId: focus, windowId: "window-a" };
      if (command === "navigate") return navigate(id);
      throw Error("Unexpected helper command");
    },
  });
  pilot.setVoiceObserver(() => "off");
  const action = { id: "key-1", isKey: () => true, showAlert: async () => {} };
  const settings = { travelPilot: true, slot: 1 };
  t.after(() => {
    pilot.stop();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    pilot,
    calls,
    acknowledged,
    ledger,
    images,
    logs,
    mount: async () => {
      await owners[ownerName].draw(action, settings);
      await pilot.poll();
    },
    press: () => owners[ownerName].onKeyDown({ action, payload: { settings } }),
    advance: () => {
      now += 4000;
    },
    read: (fn) => {
      read = fn;
    },
    navigate: (fn) => {
      navigate = fn;
    },
    focus: (id) => {
      focus = id;
    },
    reorder: () => {
      order.reverse();
    },
    completeAgain: () => {
      completed["task-a"] += 5000;
    },
    snapshot: () => snapshot("task-a"),
    root,
  };
}
for (const owner of ["agentStatus", "workdesk", "commandHandler"]) {
  test(`${owner} task key opens the displayed task and persists SEEN only after confirmation`, async (t) => {
    const f = fixture(t, owner);
    await f.mount();
    assert.match(f.images.get("key-1"), /Design a<.*>garden/);
    f.reorder(); // Store order changes before the key is redrawn.
    await f.press();
    assert.equal(f.calls.find((c) => c.command === "navigate").id, "task-a");
    assert.equal(f.snapshot().status, "read");
    const restored = createReadLedger(join(f.root, "read.json"));
    assert.equal(restored.seenAt("task-a"), f.snapshot().completedAt);
    assert.equal(restored.seenAt("task-b"), 0);
  });
}
test("failed or mismatched navigation never marks any response SEEN", async (t) => {
  for (const response of [
    { ok: false, reason: "helper-timeout" },
    { ok: true, threadId: "task-b", windowId: "window-b" },
    { ok: true, threadId: "task-a" },
  ]) {
    const f = fixture(t);
    await f.mount();
    f.navigate(async () => response);
    await f.press();
    assert.deepEqual(f.acknowledged, {});
    assert.equal(f.ledger.seenAt("task-a"), 0);
    assert.match(f.images.get("key-1"), /OPEN<.*>CODEX/);
  }
});
test("a response completed during navigation remains unread", async (t) => {
  const f = fixture(t);
  await f.mount();
  const previous = f.snapshot().completedAt;
  f.navigate(async (id) => {
    f.completeAgain();
    f.focus(id);
    return { ok: true, threadId: id, windowId: "window-a" };
  });
  await f.press();
  assert.equal(f.ledger.seenAt("task-a"), previous);
  assert.equal(f.snapshot().status, "unread");
});
test("navigation waits for an existing observation and suppresses new reads until it completes", async (t) => {
  const f = fixture(t);
  await f.mount();
  f.advance();
  const observation = deferred(),
    opening = deferred();
  f.read(() => observation.promise);
  f.navigate(() => opening.promise);
  const poll = f.pilot.poll();
  await tick();
  const press = f.press();
  await tick();
  assert.equal(f.calls.filter((c) => c.command === "confirm").length, 0);
  assert.equal(
    f.calls.some((c) => c.command === "navigate"),
    false,
  );
  const readCount = f.calls.filter((c) => c.command === "read").length;
  await f.pilot.poll();
  assert.equal(f.calls.filter((c) => c.command === "read").length, readCount);
  observation.resolve({ ok: false, reason: "helper-timeout" });
  await poll;
  await tick();
  assert.equal(f.calls.filter((c) => c.command === "navigate").length, 1);
  await f.pilot.poll();
  assert.equal(f.calls.filter((c) => c.command === "read").length, readCount);
  f.focus("task-a");
  f.read(async () => ({ ok: false, reason: "no-focus" }));
  opening.resolve({ ok: true, threadId: "task-a", windowId: "window-a" });
  await press;
  assert.equal(f.snapshot().status, "read");
});
test("an already confirmed task records SEEN without opening another task", async (t) => {
  const f = fixture(t);
  f.focus("task-a");
  await f.mount();
  await f.press();
  assert.equal(
    f.calls.some((c) => c.command === "navigate"),
    false,
  );
  assert.equal(f.snapshot().status, "read");
});
