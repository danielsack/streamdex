import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { contextPair } from "./travel-pilot.mjs";
import { readAudio } from "./travel-more.mjs";
import { stripSvg } from "./plus-v2-visuals.mjs";
const run = promisify(execFile),
  PROFILE = "streamdex-plus";
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function touchSide(payload) {
  const [x, y] = payload.tapPos ?? [];
  return Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 4 &&
    x <= 195 &&
    y >= 30 &&
    y <= 96
    ? x < 100
      ? "left"
      : "right"
    : undefined;
}
export function sameContext(a, b, side) {
  const x = a?.[side],
    y = b?.[side];
  return (
    a?.threadId === b?.threadId &&
    a?.kind === b?.kind &&
    a?.detail === b?.detail &&
    x?.operation === y?.operation &&
    x?.action === y?.action &&
    x?.token === y?.token
  );
}
async function codexNative(...args) {
  try {
    const { stdout } = await run(
      fileURLToPath(new URL("./travel-ui-control", import.meta.url)),
      args,
      { timeout: 5000, maxBuffer: 65536 },
    );
    return JSON.parse(stdout);
  } catch (e) {
    try {
      return JSON.parse(e.stdout);
    } catch {
      return { ok: false };
    }
  }
}
export function installPlusV2(deps) {
  const {
    workdesk,
    travelPilot,
    travelVoice,
    store,
    profiles,
    renderKey,
    renderFeedback,
    svgDataUrl,
    lightRequest,
    runWorkdeskGlobal,
    executeCommand,
    commands,
    openThread,
    startDictation,
    endDictation,
    logger,
  } = deps;
  const visible = new Map(),
    presses = new Map(),
    displayed = new Map(),
    notices = new Map();
  let light = [undefined, undefined],
    audio,
    values = [
      "Left: checking",
      "Right: checking",
      "Lights: checking",
      "Volume: checking",
    ],
    polling,
    ioAt = 0,
    phase = 0,
    dictating = false,
    dictationStart,
    dictationTimer,
    queue = Promise.resolve(),
    lastDiagnostic = 0,
    lastFailure = "",
    stopped = false;
  const enabled = true;
  const ours = (a, s) => s?.plusV2 === true && a.isDial();
  const lightCount = deps.lightCount ?? 0;
  const pairNow = () => contextPair(travelPilot.inspect().frame);
  function warning(id, text) {
    notices.set(id, { text, until: Date.now() + 3500 });
  }
  async function draw(a, s, register = true) {
    if (!ours(a, s)) return;
    if (register) visible.set(a.id, { a, s });
    else if (!visible.has(a.id)) return;
    const notice = notices.get(a.id);
    if (notice?.until < Date.now()) notices.delete(a.id);
    const pair = pairNow(),
      m = travelPilot.presentation();
    displayed.set(a.id, {
      pair,
      at: Date.now(),
      threadId: store.focusedThread()?.id,
      voiceActions: {
        left: travelVoice?.captureAction("mic"),
        right: travelVoice?.captureAction("sound"),
      },
    });
    await renderFeedback(a, {
      "full-canvas": svgDataUrl(
        stripSvg(s.column, {
          page: s.plusPage,
          value: values[s.column],
          pair,
          voiceAudio: travelVoice?.controller.view(),
          voice: m.voice,
          fast: m.fast,
          plan: m.plan,
          dictating: dictating || m.dictating,
          light: light[s.column === 1 ? 1 : 0],
          volume: audio,
          notice: notices.get(a.id)?.text ?? "",
          phase,
        }),
      ),
    });
  }
  async function drawAll() {
    await Promise.all(
      [...visible.values()].map(({ a, s }) => draw(a, s, false)),
    );
  }
  async function poll() {
    if (stopped || !visible.size) return;
    if (polling) return polling;
    polling = (async () => {
      await Promise.all([travelPilot.poll(), travelVoice?.poll()]);
      if (Date.now() - ioAt > 4000) {
        ioAt = Date.now();
        const r = await Promise.allSettled([
          ...Array.from({ length: lightCount }, (_, i) => lightRequest(i)),
          readAudio(),
        ]);
        light = r
          .slice(0, lightCount)
          .map((v) => (v.status === "fulfilled" ? v.value : undefined));
        audio =
          r[lightCount].status === "fulfilled"
            ? r[lightCount].value
            : undefined;
        values = [0, 1].map((i) =>
          i >= lightCount
            ? "Unassigned"
            : light[i]
              ? `Light ${i + 1} · ${light[i].on ? light[i].brightness + "%" : "OFF"}`
              : `Light ${i + 1} offline`,
        );
        values.push(
          lightCount
            ? light[0]
              ? `Lights · ${Math.round(1e6 / light[0].temperature)} K`
              : "Lights offline"
            : "Reasoning · " +
                (deps.reasoning.view()?.level ??
                  store.reasoningSnapshot().current ??
                  "Unavailable"),
          audio
            ? `Volume · ${audio.muted ? "MUTED" : audio.volume + "%"}`
            : "Volume unavailable",
        );
      }
      if (!lightCount && deps.reasoning.view())
        values[2] = "Preview · " + deps.reasoning.view().level;
      await drawAll();
    })()
      .catch((e) => {
        lastFailure = String(e);
        logger.warn("Plus v2 refresh failed: " + String(e));
      })
      .finally(() => {
        polling = undefined;
      });
    return polling;
  }
  async function finishDictation() {
    if (dictationStart) await dictationStart;
    clearTimeout(dictationTimer);
    if (!dictating) return;
    try {
      await endDictation();
    } finally {
      dictating = false;
      await drawAll();
    }
  }
  async function noticeAction(a, label, e) {
    warning(a.id, label);
    if (e) {
      lastFailure = String(e);
      logger.warn("Plus v2: " + String(e));
    }
    await drawAll();
  }
  function enqueue(a, fn) {
    queue = queue.then(fn).catch((e) => noticeAction(a, "Check control", e));
    return queue;
  }
  async function navigate(e) {
    await finishDictation();
    await profiles.switchToProfile(
      e.action.device.id,
      PROFILE,
      e.payload.settings.plusPage === "more" ? 0 : 1,
    );
    logger.info(
      "Plus v2 page requested: " +
        (e.payload.settings.plusPage === "more" ? "Tasks" : "More"),
    );
  }
  async function contextAction(e, side, shown) {
    const pair = pairNow(),
      cmd = shown?.pair?.[side];
    if (!cmd || cmd.operation === "none")
      return noticeAction(e.action, "Select a task");
    if (Date.now() - shown.at > 5500 || !sameContext(shown.pair, pair, side))
      return noticeAction(e.action, "Task changed");
    if (cmd.hold && !e.payload.hold)
      return noticeAction(e.action, "Hold to allow");
    if (cmd.operation === "native") {
      const result = await codexNative(
        "act",
        pair.threadId,
        cmd.action,
        cmd.token,
      );
      if (!result.ok)
        throw Error("Task control " + (result.reason ?? "unavailable"));
    } else if (cmd.operation === "open") await openThread(pair.threadId);
    else if (cmd.operation === "review")
      await executeCommand(
        commands.find((c) => c.id === "review-panel"),
        pair.threadId,
      );
    else if (cmd.operation === "refresh") store.invalidate();
    await travelPilot.poll();
  }
  async function touch(e) {
    const side = touchSide(e.payload);
    if (!side) return;
    const s = e.payload.settings,
      shown = displayed.get(e.action.id);
    if (s.column === 3) {
      return navigate(e);
    }
    if (s.plusPage === "more" && s.column !== 2) return;
    return enqueue(e.action, async () => {
      if (s.column === 2) {
        if (!visible.has(e.action.id)) return;
        if (s.plusPage === "more") {
          const id = shown?.threadId;
          if (
            !id ||
            Date.now() - shown.at > 5500 ||
            id !== store.focusedThread()?.id
          )
            throw Error("Task changed");
          await executeCommand(
            commands.find((c) => c.id === (side === "left" ? "fast" : "plan")),
            id,
          );
        } else {
          const result = await travelVoice?.performAction(
            shown?.voiceActions?.[side],
          );
          if (!result?.ok) throw Error(result?.reason || "Check Voice");
        }
      } else if (s.column === 0 && side === "left")
        await runWorkdeskGlobal("voice");
      else if (s.column === 0) {
        if (dictating) await finishDictation();
        else {
          const id = store.focusedThread()?.id;
          if (!id || travelPilot.presentation().dictating)
            throw Error("Open a task for dictation");
          dictationStart = startDictation(id);
          try {
            await dictationStart;
            dictating = true;
          } finally {
            dictationStart = undefined;
          }
          dictationTimer = setTimeout(
            () => void finishDictation().catch((e) => logger.warn(String(e))),
            60000,
          );
          dictationTimer.unref?.();
        }
      } else if (s.column === 1) await contextAction(e, side, shown);

      await travelPilot.poll();
      await drawAll();
    });
  }
  async function rotate(e) {
    const col = e.payload.settings.column,
      ticks = clamp(e.payload.ticks, -20, 20);
    return enqueue(e.action, async () => {
      if (col < 2) {
        if (col >= lightCount) return;
        const l = await lightRequest(col);
        await lightRequest(col, {
          brightness: clamp(l.brightness + ticks * 2, 0, 100),
        });
      } else if (col === 2) {
        if (!lightCount) {
          deps.reasoning.preview(ticks);
        } else {
          const l = await lightRequest(0),
            temperature = clamp(l.temperature - ticks * 3, 143, 344);
          await Promise.all(
            Array.from({ length: lightCount }, (_, i) =>
              lightRequest(i, { temperature }),
            ),
          );
        }
      } else {
        const { volume } = await readAudio();
        await run(
          "/usr/bin/osascript",
          [
            "-e",
            `set volume output volume ${clamp(volume + ticks * 2, 0, 100)}`,
          ],
          { timeout: 2500 },
        );
      }
      ioAt = 0;
      await poll();
    });
  }
  async function dial(e) {
    const col = e.payload.settings.column;
    if (col === 2) {
      if (lightCount) return;
      return enqueue(e.action, async () => {
        await deps.reasoning.commit();
        store.invalidate();
        ioAt = 0;
        await poll();
      });
    }
    return enqueue(e.action, async () => {
      if (col < 2) {
        if (col >= lightCount) return;
        const l = await lightRequest(col);
        await lightRequest(col, { on: l.on ? 0 : 1 });
      } else {
        const v = await readAudio();
        await run(
          "/usr/bin/osascript",
          ["-e", `set volume output muted ${!v.muted}`],
          { timeout: 2500 },
        );
      }
      ioAt = 0;
      await poll();
    });
  }
  const oldDraw = workdesk.draw;
  workdesk.draw = async function (a, s) {
    const settings = s ?? (await a.getSettings());
    if (ours(a, settings)) return draw(a, settings);
    return oldDraw?.call(this, a, s);
  };
  function wrap(name, fn) {
    const old = workdesk[name];
    workdesk[name] = async function (e) {
      if (ours(e.action, e.payload?.settings)) return fn(e);
      return old?.call(this, e);
    };
  }
  function attachVoice(e) {
    travelVoice?.detach(e.action.id);
    if (
      e.action.isDial() &&
      e.payload.settings.column === 2 &&
      e.payload.settings.plusPage === "tasks"
    )
      travelVoice?.attach(e.action.id, () =>
        draw(e.action, e.payload.settings, false),
      );
  }
  wrap("onWillAppear", async (e) => {
    attachVoice(e);
    await draw(e.action, e.payload.settings);
    logger.info(
      `Plus v2 visible: ${e.payload.settings.plusPage} ${e.payload.settings.meetingControl ?? e.payload.settings.column}`,
    );
    void poll();
  });
  wrap("onDidReceiveSettings", async (e) => {
    attachVoice(e);
    presses.delete(e.action.id);
    await draw(e.action, e.payload.settings);
    void poll();
  });
  wrap("onTouchTap", touch);
  wrap("onDialRotate", rotate);
  wrap("onDialUp", dial);
  const oldDisappear = workdesk.onWillDisappear;
  workdesk.onWillDisappear = async function (e) {
    travelVoice?.detach(e.action.id);
    const prior = visible.get(e.action.id);
    const was = visible.delete(e.action.id);
    presses.delete(e.action.id);
    displayed.delete(e.action.id);
    notices.delete(e.action.id);
    if (was) {
      if (prior.a.isDial() && prior.s.column === 0) await finishDictation();
      return;
    }
    return oldDisappear?.call(this, e);
  };
  const timer = setInterval(() => void poll(), 1500);
  timer.unref?.();
  const animation = setInterval(() => {
    phase = (phase + 1) % 4;
    if (travelPilot.presentation().voice === "active")
      for (const { a, s } of visible.values())
        if (a.isDial() && s.plusPage === "tasks" && s.column === 0)
          void draw(a, s, false);
  }, 300);
  animation.unref?.();
  return {
    enabled,
    poll,
    stop() {
      stopped = true;
      clearInterval(timer);
      clearInterval(animation);
      clearTimeout(dictationTimer);
      void finishDictation();
      for (const id of visible.keys()) travelVoice?.detach(id);
      visible.clear();
    },
    inspect: () => ({
      desktopVisible: [...visible.values()].some((v) => v.a.isDial()),
      visible: [...visible.values()].map((v) => v.s),
      values,
    }),
  };
}
