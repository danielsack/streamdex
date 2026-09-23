import test from "node:test";
import assert from "node:assert/strict";
import {
  installTravelPilot,
  contextPair,
  projectTask,
} from "../../src/custom/travel-pilot.mjs";

function fixture() {
  let now = 1800000000000;
  let task = {
    id: "task-a",
    title: "Fictional task",
    status: "running",
    lastEventAt: now,
  };
  let broken = false;
  let response = {
    ok: true,
    appRunning: true,
    threadId: "task-a",
    windowId: "window-a",
    kind: "approval",
    choices: [{ action: "allow", token: "request-a" }],
  };
  let read = async () => response;
  const logs = [],
    calls = [],
    images = new Map(),
    acknowledgements = [];
  const workdesk = {},
    agentStatus = {};
  const pilot = installTravelPilot({
    store: {
      sessions: () => {
        if (broken) throw Error("private source detail");
        return [task];
      },
      focusedThread: () => task,
    },
    workdesk,
    agentStatus,
    settingsTargets: {},
    requestFor: (t) => t.pendingRequest,
    projectName: () => "Example project",
    readLedger: { record: (t) => acknowledgements.push(t), restore: () => 0 },
    renderKey: async (a, svg) => images.set(a.id, svg),
    svgDataUrl: (s) => s,
    logger: { info: (s) => logs.push(s), warn: (s) => logs.push(s) },
    now: () => now,
    nativeCall: async (command, id) => {
      calls.push({ command, id });
      return read(command, id);
    },
  });
  pilot.setVoiceObserver(() => "off");
  const key = { id: "task-key", isKey: () => true };
  const control = { id: "context-key", isKey: () => true };
  return {
    pilot,
    logs,
    calls,
    images,
    acknowledgements,
    mount: async () => {
      await agentStatus.draw(key, { travelPilot: true, slot: 1 });
      await workdesk.draw(control, { travelPilot: true, travelRole: "left" });
    },
    time: () => now,
    advance: (n) => (now += n),
    task: (t) => (task = { ...task, ...t }),
    broken: (v) => (broken = v),
    response: (r) => (response = r),
    read: (fn) => (read = fn),
    frame: () => pilot.inspect().frame,
    pair: () => contextPair(pilot.inspect().frame, now),
    status: () =>
      projectTask(
        pilot.inspect().frame.sessions[0],
        pilot.inspect().frame.native,
        now,
        pilot.inspect().frame.offline,
      ).status,
  };
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("timeouts preserve local task states and revoke previously verified approval tokens", async (t) => {
  const f = fixture();
  t.after(() => f.pilot.stop());
  await f.mount();
  await f.pilot.poll();
  assert.equal(f.pair().left.operation, "native");
  for (const reason of [
    "helper-timeout",
    "helper-unavailable",
    "no-focus",
    "accessibility",
  ]) {
    f.advance(4000);
    f.task({
      status: "needs-input",
      pendingRequest: { kind: "question", title: "Choose format" },
    });
    f.response({ ok: false, reason });
    await f.pilot.poll();
    assert.equal(f.frame().offline, false);
    assert.equal(f.status(), "needs-input");
    assert.equal(f.pair().left.operation, "open");
    assert.equal(f.pair().verified, false);
    assert.doesNotMatch(f.images.get("task-key"), /OFFLINE/);
  }
  assert.equal(f.acknowledgements.length, 0);
});

test("a thrown helper error cannot become a task-data outage or leak its message", async (t) => {
  const f = fixture();
  t.after(() => f.pilot.stop());
  await f.mount();
  f.read(async () => {
    throw Error("private task content");
  });
  await f.pilot.poll();
  assert.equal(f.frame().offline, false);
  assert.equal(f.status(), "running");
  assert.equal(f.pair().left.operation, "open");
  assert.ok(f.logs.some((s) => s.includes("helper-unavailable")));
  assert.ok(f.logs.every((s) => !s.includes("private task content")));
});

test("local data refreshes while native inspection is pending, with only one helper in flight", async (t) => {
  const f = fixture(),
    pending = deferred();
  t.after(() => f.pilot.stop());
  await f.mount();
  f.read(() => pending.promise);
  const first = f.pilot.poll();
  await tick();
  f.task({
    status: "needs-input",
    pendingRequest: { kind: "question", title: "Choose format" },
  });
  const second = f.pilot.poll();
  await tick();
  assert.equal(f.status(), "needs-input");
  assert.equal(f.calls.length, 1);
  assert.match(f.images.get("task-key"), /INPUT/);
  pending.resolve({ ok: false, reason: "helper-timeout" });
  await Promise.all([first, second]);
  assert.equal(f.status(), "needs-input");
});

test("a native reply cannot revive failed local data", async (t) => {
  const f = fixture(),
    pending = deferred();
  t.after(() => f.pilot.stop());
  await f.mount();
  f.read(() => pending.promise);
  const first = f.pilot.poll();
  await tick();
  f.broken(true);
  await f.pilot.poll();
  assert.equal(f.frame().offline, true);
  pending.resolve({
    ok: true,
    appRunning: true,
    threadId: "task-a",
    kind: "approval",
    choices: [{ action: "allow", token: "request-a" }],
  });
  await first;
  assert.equal(f.frame().offline, true);
  assert.equal(f.pair().left.operation, "none");
  f.broken(false);
  f.read(async () => ({ ok: false, reason: "helper-timeout" }));
  await f.pilot.poll();
  assert.equal(f.frame().offline, false);
  assert.equal(f.status(), "running");
});

test("a reply for a task changed during inspection cannot authorize the newly selected task", async (t) => {
  const f = fixture(),
    pending = deferred();
  t.after(() => f.pilot.stop());
  await f.mount();
  f.read(() => pending.promise);
  const first = f.pilot.poll();
  await tick();
  f.task({ id: "task-b" });
  const second = f.pilot.poll();
  await tick();
  pending.resolve({
    ok: true,
    appRunning: true,
    threadId: "task-a",
    kind: "approval",
    choices: [{ action: "allow", token: "request-a" }],
  });
  await Promise.all([first, second]);
  assert.equal(f.pair().threadId, "task-b");
  assert.equal(f.pair().left.operation, "open");
});

test("confirmed app exit remains OFFLINE until a read confirms the app is running", async (t) => {
  const f = fixture();
  t.after(() => f.pilot.stop());
  await f.mount();
  f.response({ ok: false, appRunning: false, reason: "offline" });
  await f.pilot.poll();
  assert.equal(f.status(), "offline");
  f.advance(4000);
  f.response({ ok: false, reason: "helper-timeout" });
  await f.pilot.poll();
  assert.equal(f.status(), "offline");
  f.advance(4000);
  f.response({ ok: false, appRunning: true, reason: "no-focus" });
  await f.pilot.poll();
  assert.equal(f.status(), "running");
  assert.equal(f.pair().left.operation, "open");
});

test("failed reads back off, without postponing task updates or a changed target", async (t) => {
  const f = fixture();
  t.after(() => f.pilot.stop());
  await f.mount();
  f.response({ ok: false, reason: "helper-timeout" });
  await f.pilot.poll();
  f.advance(1500);
  f.task({ status: "read" });
  await f.pilot.poll();
  assert.equal(f.calls.length, 1);
  assert.equal(f.status(), "read");
  f.task({ id: "task-b" });
  await f.pilot.poll();
  assert.equal(f.calls.length, 2);
  f.advance(3000);
  f.response({
    ok: true,
    appRunning: true,
    threadId: "task-b",
    kind: "running",
  });
  await f.pilot.poll();
  assert.equal(f.calls.length, 3);
  assert.equal(f.pair().verified, true);
  assert.ok(f.logs.includes("Travel UI controls recovered"));
});

test("the dedicated Voice observer avoids a redundant global AX scan", async (t) => {
  const f = fixture();
  t.after(() => f.pilot.stop());
  await f.mount();
  await f.pilot.poll();
  assert.deepEqual(
    f.calls.map((c) => c.command),
    ["read"],
  );
});

test("fallback Voice failure does not blank cards or discard verified task state", async (t) => {
  const f = fixture();
  t.after(() => f.pilot.stop());
  await f.mount();
  f.pilot.setVoiceObserver(() => "unknown");
  f.read(async (command) => {
    if (command === "globals") throw Error("private detail");
    return { ok: true, appRunning: true, threadId: "task-a", kind: "running" };
  });
  await f.pilot.poll();
  assert.equal(f.status(), "running");
  assert.equal(f.pair().verified, true);
  await f.pilot.poll();
  assert.equal(f.calls.filter((c) => c.command === "globals").length, 1);
});

test("a slow Voice fallback cannot extend the age of a verified action", async (t) => {
  const f = fixture(),
    pending = deferred();
  t.after(() => f.pilot.stop());
  await f.mount();
  f.pilot.setVoiceObserver(() => "unknown");
  f.read(async (command) =>
    command === "globals"
      ? pending.promise
      : {
          ok: true,
          appRunning: true,
          threadId: "task-a",
          kind: "approval",
          choices: [{ action: "allow", token: "request-a" }],
        },
  );
  const poll = f.pilot.poll();
  await tick();
  assert.equal(f.pair().left.operation, "native");
  f.advance(6000);
  pending.resolve({ ok: true, appRunning: true, voice: "off" });
  await poll;
  assert.equal(f.pair().left.operation, "open");
  assert.equal(f.pair().verified, false);
});
