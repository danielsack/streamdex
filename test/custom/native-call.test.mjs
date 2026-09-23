import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createNativeCaller } from "../../src/custom/travel-native.mjs";

function fixture(t, script) {
  const root = mkdtempSync(join(tmpdir(), "streamdex-read-cancel-"));
  const helper = join(root, "helper.mjs"),
    marker = join(root, "started");
  writeFileSync(helper, script);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { call: createNativeCaller(process.execPath, [helper]), marker };
}

test("cancelled reads resolve only after their own process exits, even when SIGTERM is ignored", async (t) => {
  const { call, marker } = fixture(
    t,
    `
    import { writeFileSync } from "node:fs";
    process.on("SIGTERM", () => {});
    writeFileSync(process.argv[3], String(process.pid));
    console.log(JSON.stringify({ ok: true, threadId: "stale-task" }));
    setInterval(() => {}, 1000);
  `,
  );
  const controller = new AbortController();
  const reading = call("read", marker, undefined, undefined, {
    signal: controller.signal,
  });
  const until = Date.now() + 2000;
  while (!existsSync(marker) && Date.now() < until) await delay(10);
  assert.equal(existsSync(marker), true);
  const pid = Number(readFileSync(marker, "utf8"));
  controller.abort();
  assert.deepEqual(await reading, { ok: false, reason: "superseded" });
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});

test("pre-cancelled observations never start a process", async (t) => {
  const { call, marker } = fixture(
    t,
    `import { writeFileSync } from "node:fs"; writeFileSync(process.argv[3], "started");`,
  );
  for (const command of ["read", "globals"]) {
    assert.deepEqual(
      await call(command, marker, undefined, undefined, {
        signal: AbortSignal.abort(),
      }),
      { ok: false, reason: "superseded" },
    );
  }
  assert.equal(existsSync(marker), false);
});

test("observation cancellation cannot cancel a navigation or action", async (t) => {
  const { call, marker } = fixture(
    t,
    `console.log(JSON.stringify({ ok: true, command: process.argv[2] }));`,
  );
  for (const command of ["navigate", "act"]) {
    assert.deepEqual(
      await call(command, marker, undefined, undefined, {
        signal: AbortSignal.abort(),
      }),
      { ok: true, command },
    );
  }
});

test("helper startup and invalid responses fail closed without exposing subprocess output", async () => {
  assert.deepEqual(
    await createNativeCaller("/nonexistent-streamdex-fixture")(
      "read",
      "task-a",
    ),
    { ok: false, reason: "helper-unavailable" },
  );
});
