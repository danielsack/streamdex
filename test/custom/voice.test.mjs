import test from "node:test";
import assert from "node:assert/strict";
import {
  createVoiceController,
  voiceSvg,
} from "../../src/custom/travel-voice.mjs";

test("Voice toggles are independent and reject stale, changed or unverified sessions", async () => {
  let now = 1000,
    state = {
      ok: true,
      active: true,
      targetId: "voice-a",
      observedAt: 1000,
      controls: [
        { kind: "mic", on: true, enabled: true, token: "m1" },
        { kind: "sound", on: true, enabled: true, token: "s1" },
      ],
    },
    calls = 0;
  const c = createVoiceController({
    now: () => now,
    call: async (command, p) => {
      if (command === "read")
        return structuredClone({ ...state, observedAt: now });
      calls++;
      state.controls.find((x) => x.kind === p.kind).on = !p.on;
      state.observedAt = now;
      return { ok: true, state: structuredClone(state) };
    },
  });
  await c.poll();
  assert.equal((await c.perform(c.capture("mic"))).ok, true);
  assert.equal(c.view().controls[0].on, false);
  assert.equal(c.view().controls[1].on, true);
  const old = c.capture("sound");
  now = 9000;
  assert.equal((await c.perform(old)).ok, false);
  assert.equal(calls, 1);
  await c.poll();
  const changed = c.capture("sound");
  state.targetId = "voice-b";
  await c.poll();
  assert.equal((await c.perform(changed)).ok, false);
  state = { ok: false, active: false, controls: [] };
  await c.poll();
  assert.equal(c.view().active, true);
  assert.equal(c.capture("mic"), undefined);
});
test("inactive Voice restores Quick chat and New task; enabled and muted colors are consistent", () => {
  assert.match(voiceSvg("mic", { ok: true, active: false }), /Quick chat/);
  assert.match(voiceSvg("sound", { ok: true, active: false }), /New task/);
  assert.match(
    voiceSvg("mic", {
      ok: true,
      active: true,
      controls: [{ kind: "mic", on: false, enabled: true }],
    }),
    /#F47F8C/,
  );
  assert.match(
    voiceSvg("sound", {
      ok: true,
      active: true,
      controls: [{ kind: "sound", on: true, enabled: true }],
    }),
    /#69E4A6/,
  );
});
