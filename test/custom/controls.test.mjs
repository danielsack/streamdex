import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createReadLedger,
  projectName,
} from "../../src/custom/travel-state.mjs";
import { createRequestTracker } from "../../src/custom/travel-requests.mjs";
import {
  projectTask,
  contextPair,
  sameGesture,
} from "../../src/custom/travel-pilot.mjs";
import { createReasoningController } from "../../src/custom/reasoning-control.mjs";
import {
  installPlusV2,
  touchSide,
  sameContext,
} from "../../src/custom/plus-v2.mjs";
import { taskSvg } from "../../src/custom/travel-visuals.mjs";
const logger = { warn() {}, info() {} };
const baseTask = {
  id: "task-a",
  title: "Fictional task",
  status: "running",
  lastEventAt: 1000,
};
test("async question remains INPUT through ongoing work and clears only after its matching reply", () => {
  const t = createRequestTracker();
  t.consume({
    type: "response_item",
    payload: {
      type: "function_call",
      name: "functions.request_user_input_async",
      call_id: "call-a",
      arguments: JSON.stringify({ questions: [{ title: "Which format?" }] }),
    },
  });
  t.consume({
    type: "response_item",
    payload: {
      type: "function_call_output",
      call_id: "call-a",
      output: '{"accepted":true}',
    },
  });
  t.consume({ type: "event_msg", payload: { type: "task_complete" } });
  assert.equal(t.read().kind, "question");
  assert.equal(
    projectTask(
      { ...baseTask, pendingRequest: t.read() },
      { ok: true, threadId: "task-a", kind: "running" },
      1100,
    ).status,
    "needs-input",
  );
  const answer = [
    {
      questionItemId: JSON.stringify(["request_user_input_async", "call-a", 0]),
      answer: "Short",
    },
  ];
  t.consume({
    type: "event_msg",
    payload: {
      type: "user_message",
      message:
        "<send_user_message_question_reply>" +
        JSON.stringify(answer) +
        "</send_user_message_question_reply>",
    },
  });
  assert.equal(t.read(), undefined);
});
test("stale context and changed request tokens cannot approve", () => {
  const f = {
    focus: baseTask,
    sessions: [baseTask],
    observedAt: 1000,
    native: {
      ok: true,
      threadId: "task-a",
      kind: "approval",
      choices: [{ action: "allow", token: "request-1" }],
    },
  };
  const fresh = contextPair(f, 1100);
  assert.equal(fresh.left.hold, true);
  assert.equal(contextPair(f, 8000).left.operation, "open");
  const start = {
    threadId: "task-a",
    kind: "approval",
    windowId: "w1",
    detail: "Request",
    at: 1000,
    command: fresh.left,
  };
  assert.equal(
    sameGesture(
      start,
      { ...start, command: { ...fresh.left, token: "request-2" } },
      2000,
    ),
    false,
  );
  assert.equal(sameGesture(start, start, 1500), false);
  assert.equal(sameGesture(start, start, 1900), true);
  assert.equal(
    sameGesture(start, { ...start, threadId: "task-b" }, 1900),
    false,
  );
});
test("read acknowledgement survives restart without marking a newer response seen", () => {
  const dir = mkdtempSync(join(tmpdir(), "streamdex-ledger-"));
  try {
    const p = join(dir, "read.json"),
      seen = [];
    const store = { acknowledge: (id, at) => seen.push([id, at]) };
    const a = createReadLedger(p);
    assert.equal(
      a.record({ ...baseTask, status: "running", completedAt: 1500 }, store),
      false,
    );
    assert.equal(
      a.record({ ...baseTask, status: "unread", completedAt: 1500 }, store),
      true,
    );
    const b = createReadLedger(p);
    assert.equal(b.restore(store), 1);
    assert.equal(b.seenAt("task-a"), 1500);
    assert.equal(
      b.record({ ...baseTask, status: "unread", completedAt: 2500 }, store),
      true,
    );
    writeFileSync(p, "bad json");
    assert.equal(createReadLedger(p, logger).restore(store), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("project labels prefer explicit project assignments over folder names", () =>
  assert.equal(
    projectName(
      { id: "a", cwd: "/workspace/demo" },
      {
        "thread-project-assignments": { a: { projectId: "p" } },
        "local-projects": { p: { name: "Demo project" } },
      },
    ),
    "Demo project",
  ));
test("reasoning rejects changed task/model, expired preview and unsupported levels", async () => {
  let now = 1000,
    s = {
      threadId: "task-a",
      model: "gpt-demo",
      current: "medium",
      levels: ["low", "medium", "high"],
    },
    calls = [];
  const c = createReasoningController({
    snapshot: () => s,
    now: () => now,
    label: (v) => v,
    step: (v, t, l) => ({
      level: l[Math.min(2, Math.max(0, l.indexOf(v) + Math.sign(t)))],
    }),
    apply: async (...args) => {
      calls.push(args);
      return { effort: args[0] };
    },
  });
  c.preview(1);
  s = { ...s, threadId: "task-b" };
  await assert.rejects(() => c.commit());
  assert.equal(calls.length, 0);
  c.preview(1);
  s = { ...s, model: "another-model" };
  await assert.rejects(() => c.commit());
  c.preview(1);
  now += 16000;
  await assert.rejects(() => c.commit());
  c.preview(1);
  s = { ...s, levels: ["low"] };
  await assert.rejects(() => c.commit());
  s = { ...s, levels: ["low", "medium", "high"] };
  c.preview(1);
  assert.equal(await c.commit(), "high");
  assert.deepEqual(calls[0], ["high", "high", "task-b", "another-model"]);
});
test("status animation retains status color and separates RUN from SEEN", () => {
  const run = taskSvg({ ...baseTask, status: "running" }, 1, 1000),
    seen = taskSvg({ ...baseTask, status: "read" }, 1, 1000),
    error = taskSvg({ ...baseTask, status: "error" }, 1, 1000);
  assert.match(run, /#58BFFF/);
  assert.match(seen, /#929292/);
  assert.match(error, /#301F25/);
  assert.notEqual(run, taskSvg({ ...baseTask, status: "running" }, 1, 1500));
});
test("touch coordinate guard rejects strip headings and out-of-bounds taps", () => {
  assert.equal(touchSide({ tapPos: [10, 10] }), undefined);
  assert.equal(touchSide({ tapPos: [201, 50] }), undefined);
  assert.equal(touchSide({ tapPos: [40, 70] }), "left");
  assert.equal(touchSide({ tapPos: [150, 70] }), "right");
});
test("no-light preset uses reasoning and does not query lights; one-light preset never touches light 2", async () => {
  for (const count of [0, 1, 2]) {
    const workdesk = {},
      calls = [],
      reason = [];
    const p = installPlusV2({
      workdesk,
      travelPilot: {
        inspect: () => ({ frame: { sessions: [] } }),
        presentation: () => ({}),
        poll: async () => {},
      },
      store: {
        reasoningSnapshot: () => ({ current: "medium" }),
        focusedThread: () => undefined,
        invalidate() {},
      },
      profiles: {},
      renderKey: async () => {},
      renderFeedback: async () => {},
      svgDataUrl: (s) => s,
      lightCount: count,
      lightRequest: async (i, update) => {
        calls.push([i, update]);
        return { on: 1, brightness: 40, temperature: 220 };
      },
      reasoning: {
        preview: (n) => reason.push(n),
        commit: async () => reason.push("commit"),
        view: () => undefined,
      },
      logger,
    });
    const action = { id: "dial", isDial: () => true, isKey: () => false };
    const e = (col) => ({
      action,
      payload: {
        settings: { plusV2: true, column: col, plusPage: "tasks" },
        ticks: 1,
      },
    });
    try {
      await workdesk.onDialRotate(e(2));
      if (!count) {
        assert.deepEqual(calls, []);
        assert.deepEqual(reason, [1]);
        await workdesk.onDialUp(e(2));
        assert.equal(reason.at(-1), "commit");
      } else {
        assert.deepEqual(
          [...new Set(calls.map((x) => x[0]))].sort(),
          Array.from({ length: count }, (_, i) => i),
        );
        assert.deepEqual(reason, []);
      }
    } finally {
      p.stop();
    }
  }
});
test("offline configured lights never fall back to reasoning", async () => {
  const workdesk = {};
  let previewed = false;
  const p = installPlusV2({
    workdesk,
    travelPilot: {
      inspect: () => ({ frame: { sessions: [] } }),
      presentation: () => ({}),
      poll: async () => {},
    },
    store: {},
    profiles: {},
    renderFeedback: async () => {},
    lightCount: 1,
    lightRequest: async () => {
      throw Error("offline");
    },
    reasoning: { preview: () => (previewed = true) },
    logger,
  });
  try {
    await workdesk.onDialRotate({
      action: { id: "x", isDial: () => true },
      payload: { settings: { plusV2: true, column: 2 }, ticks: 1 },
    });
    assert.equal(previewed, false);
  } finally {
    p.stop();
  }
});
