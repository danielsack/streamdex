import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createSidebarApprovalObserver,
  createTitleIndex,
} from "../../src/custom/sidebar-approvals.mjs";
import { createRequestTracker } from "../../src/custom/travel-requests.mjs";
import {
  projectTask,
  contextPair,
  installTravelPilot,
} from "../../src/custom/travel-pilot.mjs";
import { taskSvg } from "../../src/custom/travel-visuals.mjs";
const task = {
  id: "task-a",
  displayTitle: "Design a garden",
  status: "running",
  lastEventAt: 10000,
};
const node = (role, text, parent = null, visible = true) => ({
  role,
  text,
  parent,
  visible,
});
const row = (pending = true) => [
  node("AXWindow", ""),
  node("AXList", "", 0),
  node("AXGroup", "", 1),
  node("AXButton", "", 2),
  node("AXGroup", "", 3),
  node("AXStaticText", task.displayTitle, 4),
  node("AXStaticText", pending ? "Awaiting approval" : "", 4),
];
function native(nodes, titles = [task.displayTitle]) {
  const result = spawnSync(
    resolve(".build/test-bin/sidebar-control"),
    ["--fixture"],
    {
      input: JSON.stringify({ titles, nodes }),
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function observer() {
  let time = 10000,
    rows = [{ id: task.id, title: task.displayTitle }],
    response = { ok: true, rows: [{ titleIndex: 0, pending: true }] },
    calls = 0;
  const c = createSidebarApprovalObserver({
    now: () => time,
    titleIndex: { read: () => rows },
    call: async () => {
      calls++;
      return response;
    },
  });
  return {
    c,
    advance: (n) => (time += n),
    rows: (r) => (rows = r),
    response: (r) => (response = r),
    calls: () => calls,
  };
}
test("native sidebar reader associates a badge with its own task row only", () => {
  assert.deepEqual(native(row()).rows, [{ titleIndex: 0, pending: true }]);
  assert.deepEqual(native(row(false)).rows, [
    { titleIndex: 0, pending: false },
  ]);
  const nodes = row(false);
  nodes.push(
    node("AXButton", "", 2),
    node("AXStaticText", "Another task", 7),
    node("AXStaticText", "Awaiting approval", 7),
  );
  assert.deepEqual(native(nodes).rows, [{ titleIndex: 0, pending: false }]);
});
test("native reader rejects hidden, non-list, partial-title and nested-button evidence", () => {
  const hidden = row();
  hidden[2].visible = false;
  assert.deepEqual(native(hidden).rows, []);
  const nonlist = row();
  nonlist[1].role = "AXGroup";
  assert.deepEqual(native(nonlist).rows, []);
  assert.deepEqual(native(row(), ["Design a"]).rows, []);
  const nested = row(false);
  nested.push(
    node("AXButton", "", 3),
    node("AXStaticText", "Awaiting approval", 7),
  );
  assert.deepEqual(native(nested).rows, [{ titleIndex: 0, pending: false }]);
});
test("duplicate row observations remain explicit so ambiguous windows can be rejected", () => {
  const nodes = row();
  nodes.push(
    node("AXButton", "", 2),
    node("AXStaticText", task.displayTitle, 7),
    node("AXStaticText", "Awaiting approval", 7),
  );
  assert.equal(native(nodes).rows.length, 2);
});
test("observer marks a background task INPUT and clears it when the badge is answered", async () => {
  const f = observer();
  await f.c.poll([task]);
  const pending = f.c.requestFor(task);
  assert.equal(pending.kind, "approval");
  assert.equal(
    projectTask({ ...task, pendingRequest: pending }, undefined, 10000).status,
    "needs-input",
  );
  const pair = contextPair(
    {
      sessions: [task],
      focus: { ...task, pendingRequest: pending },
      observedAt: 10000,
    },
    10000,
  );
  assert.equal(pair.left.label, "OPEN REQUEST");
  assert.equal(pair.left.operation, "open");
  assert.equal(pair.verified, false);
  f.advance(2000);
  f.response({ ok: true, rows: [{ titleIndex: 0, pending: false }] });
  await f.c.poll([task]);
  assert.equal(f.c.requestFor(task), undefined);
});
test("duplicate titles, renamed tasks and duplicate windows never claim approval for a task", async () => {
  for (const kind of ["duplicate title", "renamed", "duplicate window"]) {
    const f = observer();
    if (kind === "duplicate title")
      f.rows([
        { id: "task-a", title: task.displayTitle },
        { id: "task-b", title: task.displayTitle },
      ]);
    if (kind === "renamed") f.rows([{ id: "task-a", title: "Changed title" }]);
    if (kind === "duplicate window")
      f.response({
        ok: true,
        rows: [
          { titleIndex: 0, pending: true },
          { titleIndex: 0, pending: false },
        ],
      });
    await f.c.poll([task]);
    assert.equal(f.c.requestFor(task), undefined, kind);
  }
});
test("missing rows, read failures, completed work and expired observations cannot leave stale INPUT", async () => {
  for (const response of [{ ok: false }, { ok: true, rows: [] }, undefined]) {
    const f = observer();
    await f.c.poll([task]);
    assert.ok(f.c.requestFor(task));
    f.advance(2000);
    f.response(response);
    await f.c.poll([task]);
    assert.equal(f.c.requestFor(task), undefined);
  }
  const f = observer();
  await f.c.poll([task]);
  assert.equal(f.c.requestFor({ ...task, status: "unread" }), undefined);
  assert.equal(
    f.c.requestFor({ ...task, displayTitle: "New name" }),
    undefined,
  );
  f.advance(6001);
  assert.equal(f.c.requestFor(task), undefined);
});
test("title index reads current names and ignores archived duplicates without modifying a fixture database", () => {
  const dir = mkdtempSync(join(tmpdir(), "streamdex-titles-")),
    path = join(dir, "state.sqlite");
  try {
    const db = new DatabaseSync(path);
    db.exec(
      "CREATE TABLE threads(id TEXT,title TEXT,name TEXT,archived INTEGER)",
    );
    db.prepare("INSERT INTO threads VALUES(?,?,?,?)").run(
      "task-a",
      "Initial prompt",
      task.displayTitle,
      0,
    );
    db.prepare("INSERT INTO threads VALUES(?,?,?,?)").run(
      "task-b",
      "Initial prompt",
      task.displayTitle,
      1,
    );
    db.close();
    const index = createTitleIndex(path);
    assert.deepEqual(
      index.read().map((r) => ({ ...r })),
      [{ id: "task-a", title: task.displayTitle }],
    );
    index.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("optional questions keep RUN with a question marker while blocking questions and approvals use INPUT", () => {
  const tracker = createRequestTracker();
  tracker.consume({
    type: "response_item",
    payload: {
      type: "function_call",
      name: "request_user_input_async",
      call_id: "q1",
      arguments: '{"questions":[{"title":"Which style?"}]}',
    },
  });
  const optional = tracker.read();
  assert.equal(optional.blocking, false);
  const projected = projectTask(
    { ...task, pendingRequest: optional },
    undefined,
    10000,
  );
  assert.equal(projected.status, "running");
  assert.equal(projected.optionalQuestion, true);
  const svg = taskSvg(projected, 1, 10000);
  assert.match(svg, /RUN \?/);
  assert.doesNotMatch(svg, />INPUT</);
  assert.equal(
    projectTask(
      { ...task, pendingRequest: { ...optional, blocking: true } },
      undefined,
      10000,
    ).status,
    "needs-input",
  );
  assert.equal(
    projectTask(
      { ...task, pendingRequest: { kind: "approval" } },
      undefined,
      10000,
    ).status,
    "needs-input",
  );
  tracker.consume({
    type: "event_msg",
    timestamp: "later",
    payload: { type: "approval_request", id: "approval-a" },
  });
  tracker.consume({
    type: "response_item",
    payload: {
      type: "function_call",
      name: "request_user_input_async",
      call_id: "q2",
      arguments: '{"questions":[{"title":"Optional follow-up"}]}',
    },
  });
  assert.equal(tracker.read().kind, "approval");
});
test("controller combines background approval with local activity without granting native actions", async () => {
  const f = observer();
  await f.c.poll([task]);
  const owner = {},
    images = [];
  const c = installTravelPilot({
    store: { sessions: () => [task], focusedThread: () => task },
    workdesk: owner,
    agentStatus: {},
    settingsTargets: {},
    approvalObserver: f.c,
    requestFor: () => ({
      kind: "question",
      blocking: false,
      title: "Optional",
    }),
    projectName: () => "Example",
    readLedger: { restore: () => 0 },
    renderKey: async (a, s) => images.push(s),
    svgDataUrl: (s) => s,
    nativeCall: async () => ({
      ok: false,
      appRunning: true,
      reason: "no-focus",
    }),
    logger: { info() {}, warn() {} },
    now: () => 10000,
  });
  c.setVoiceObserver(() => "off");
  await owner.draw(
    { id: "key", isKey: () => true },
    { travelPilot: true, slot: 1 },
  );
  await c.poll();
  assert.equal(c.inspect().frame.focus.pendingRequest.kind, "approval");
  assert.match(images.at(-1), />INPUT</);
  assert.equal(contextPair(c.inspect().frame, 10000).left.operation, "open");
  c.stop();
});

test("production sidebar helper rejects fixture commands before accessing a real app", () => {
  const r = spawnSync(
    resolve("io.streamdex.plugin.sdPlugin/bin/sidebar-control"),
    ["--fixture"],
    { input: "{}", encoding: "utf8", timeout: 5000 },
  );
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), {
    ok: false,
    reason: "unsupported-command",
  });
});
