import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installTravelPilot,
  contextPair,
} from "../../src/custom/travel-pilot.mjs";
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
  let render = async (action, svg) => images.set(action.id, svg);
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
    renderKey: (action, svg) => render(action, svg),
    logger: { info: (s) => logs.push(s), warn: (s) => logs.push(s) },
    now: () => now,
    monotonicNow: () => now,
    openThread: async () => {
      throw Error("Full composer opener must not be used for task keys");
    },
    nativeCall: async (command, id, _operation, _token, options) => {
      calls.push({ command, id });
      if (command === "read" || command === "globals")
        return read(id, options, command);
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
    render: (fn) => {
      render = fn;
    },
    frame: () => pilot.inspect().frame,
    pair: () => contextPair(pilot.inspect().frame, now),
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
test("a press cancels the observation, waits for its exit and suppresses competing reads", async (t) => {
  const f = fixture(t);
  await f.mount();
  f.advance();
  const observation = deferred(),
    opening = deferred();
  let aborted = false;
  f.read((_id, options) => {
    options.signal.addEventListener(
      "abort",
      () => {
        aborted = true;
      },
      { once: true },
    );
    return observation.promise;
  });
  f.navigate(() => opening.promise);
  const poll = f.pilot.poll();
  await tick();
  const press = f.press();
  await tick();
  assert.equal(aborted, true);
  assert.equal(
    f.calls.some((c) => c.command === "navigate"),
    false,
  );
  assert.match(f.images.get("key-1"), /Opening…/);
  assert.equal(f.ledger.seenAt("task-a"), 0);
  const readCount = f.calls.filter((c) => c.command === "read").length;
  await f.pilot.poll();
  await f.press(); // A rapid repeated press cannot create a second navigation.
  assert.equal(f.calls.filter((c) => c.command === "read").length, readCount);
  // Simulate an already-completing stale reply after cancellation.
  observation.resolve({
    ok: true,
    threadId: "task-b",
    windowId: "old-window",
    kind: "approval",
    choices: [{ action: "allow", token: "old-token" }],
  });
  await poll;
  await tick();
  assert.equal(f.calls.filter((c) => c.command === "navigate").length, 1);
  assert.notEqual(f.pair().left.operation, "native");
  assert.equal(
    f.calls.some((c) => c.command === "confirm"),
    false,
  );
  f.focus("task-a");
  f.read(async () => ({ ok: false, reason: "no-focus" }));
  opening.resolve({ ok: true, threadId: "task-a", windowId: "window-a" });
  await press;
  assert.equal(f.snapshot().status, "read");
});

test("SEEN and selected feedback do not wait for the next full native scan", async (t) => {
  const f = fixture(t),
    observation = deferred();
  await f.mount();
  f.read(() => observation.promise);
  await f.press();
  assert.equal(f.snapshot().status, "read");
  assert.match(f.images.get("key-1"), /SEEN/);
  assert.match(f.images.get("key-1"), /width="23" height="23"/);
  assert.doesNotMatch(f.images.get("key-1"), /Opening…/);
  assert.equal(f.pair().verified, false);
  assert.equal(f.pair().left.operation, "open");
  assert.equal(f.calls.filter((c) => c.command === "navigate").length, 1);
  // A second press preempts this scan as well, without waiting a poll interval.
  const next = f.press();
  await tick();
  observation.resolve({ ok: false, reason: "superseded" });
  await next;
  assert.equal(f.calls.filter((c) => c.command === "navigate").length, 2);
});

test("a selected marker expires and never authorizes controls or follows another task", async (t) => {
  const f = fixture(t);
  await f.mount();
  await f.press();
  await tick();
  assert.equal(f.pair().verified, false);
  f.advance();
  f.advance();
  await f.pilot.poll({ localOnly: true });
  assert.doesNotMatch(f.images.get("key-1"), /width="23" height="23"/);
  await f.press();
  f.focus("task-b");
  await f.pilot.poll({ localOnly: true });
  assert.equal(f.frame().selection, undefined);
  assert.doesNotMatch(f.images.get("key-1"), /width="23" height="23"/);
});

test("slow image feedback does not postpone navigation", async (t) => {
  const f = fixture(t),
    rendering = deferred(),
    opening = deferred();
  await f.mount();
  f.render((_action, svg) => {
    if (svg.includes("Opening…")) return rendering.promise;
  });
  f.navigate(() => opening.promise);
  const press = f.press();
  await tick();
  assert.equal(f.calls.filter((c) => c.command === "navigate").length, 1);
  assert.equal(f.ledger.seenAt("task-a"), 0);
  rendering.resolve();
  f.focus("task-a");
  opening.resolve({ ok: true, threadId: "task-a", windowId: "window-a" });
  await press;
});

test("timing logs contain only fixed outcomes and numeric durations", async (t) => {
  const f = fixture(t);
  await f.mount();
  await f.press();
  const lines = f.logs.filter((s) => s.startsWith("Travel navigation timing:"));
  assert.equal(lines.length, 1);
  assert.match(
    lines[0],
    /^Travel navigation timing: outcome=confirmed waitMs=\d+ navigationMs=\d+ displayMs=\d+ totalMs=\d+$/,
  );
});

test("the same single helper verifies an already open task", async (t) => {
  const f = fixture(t);
  f.focus("task-a");
  await f.mount();
  await f.press();
  assert.equal(f.calls.filter((c) => c.command === "navigate").length, 1);
  assert.equal(
    f.calls.some((c) => c.command === "confirm"),
    false,
  );
  assert.equal(f.snapshot().status, "read");
});

test("a press can cancel a fallback global Voice scan without accepting its result", async (t) => {
  const f = fixture(t),
    observation = deferred();
  await f.mount();
  f.pilot.setVoiceObserver(() => "unknown");
  f.advance();
  let aborted = false;
  f.read((_id, options, command) => {
    if (command === "globals") {
      options.signal.addEventListener(
        "abort",
        () => {
          aborted = true;
          observation.resolve({ ok: true, appRunning: false });
        },
        { once: true },
      );
      return observation.promise;
    }
    return { ok: true, threadId: "task-b", kind: "idle" };
  });
  const poll = f.pilot.poll();
  await tick();
  const press = f.press();
  await press;
  await poll;
  assert.equal(aborted, true);
  assert.equal(f.frame().offline, false);
  assert.equal(f.snapshot().status, "read");
});

test("a failed display transport does not wedge future navigation", async (t) => {
  const f = fixture(t);
  await f.mount();
  f.render(async () => {
    throw Error("display disconnected");
  });
  await f.press();
  f.render(async (action, svg) => f.images.set(action.id, svg));
  await f.press();
  assert.equal(f.calls.filter((c) => c.command === "navigate").length, 2);
});

test("failed navigation retains elapsed helper time in the timing log", async (t) => {
  const f = fixture(t);
  await f.mount();
  f.navigate(async () => {
    f.advance();
    return { ok: false, reason: "helper-timeout" };
  });
  await f.press();
  assert.ok(
    f.logs.includes(
      "Travel navigation timing: outcome=failed waitMs=0 navigationMs=4000 displayMs=0 totalMs=4000",
    ),
  );
  assert.equal(f.snapshot().status, "unread");
});
