import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createRequestReader } from "./travel-requests.mjs";
export { pendingRequest } from "./travel-requests.mjs";

import { taskSvg, controlSvg, utilitySvg } from "./travel-visuals.mjs";
import { MOTION_INTERVAL_MS, motionStatus } from "./task-motion.mjs";
export { taskSvg, controlSvg, utilitySvg } from "./travel-visuals.mjs";
import { createReadLedger, createProjectResolver } from "./travel-state.mjs";
import { join } from "node:path";
const exec = promisify(execFile);
const STALE_MS = 30 * 60 * 1000;
const HOLD_MS = 800;
const MAX_FRAME_AGE = 5500;
const esc = (value) =>
  String(value ?? "").replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const compact = (s, n = 13) => {
  const t = String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
const choice = (label, operation, extra = {}) => ({
  label,
  operation,
  ...extra,
});

export function projectTask(
  snapshot,
  native,
  now = Date.now(),
  offline = false,
) {
  if (!snapshot)
    return {
      status: offline ? "offline" : "off",
      title: offline ? "Unavailable" : "New task",
      active: false,
    };
  let status = snapshot.status;
  const matches = native?.ok === true && native.threadId === snapshot.id;
  if (offline) status = "offline";
  else if (snapshot.pendingRequest || snapshot.status === "needs-input")
    status = "needs-input";
  else if (matches && native.kind === "running") status = "running";
  else if (
    snapshot.detail === "Last activity is stale" ||
    (["running", "thinking"].includes(status) &&
      snapshot.lastEventAt > 0 &&
      now - snapshot.lastEventAt > STALE_MS)
  )
    status = "stale";
  else if (!snapshot.lastEventAt) status = "unknown";
  if (
    !offline &&
    matches &&
    ["approval", "plan", "question"].includes(native.kind)
  )
    status = "needs-input";
  return {
    ...snapshot,
    status,
    title: snapshot.displayTitle || snapshot.title || "Untitled task",
    active: matches && !offline,
  };
}

export function contextPair(frame, now = Date.now()) {
  const task = frame.focus;
  const verified =
    frame.native?.ok === true &&
    frame.native.threadId === task?.id &&
    now - frame.observedAt <= MAX_FRAME_AGE &&
    !frame.transitioning;
  const base = {
    threadId: task?.id,
    slot: frame.sessions.findIndex((s) => s.id === task?.id) + 1,
    title: task?.displayTitle || task?.title || "Select a task",
    verified,
  };
  if (frame.transitioning)
    return {
      ...base,
      kind: "switching",
      detail: "Checking target",
      left: choice("WAIT", "none"),
      right: choice("WAIT", "none"),
    };
  if (frame.offline)
    return {
      ...base,
      kind: "offline",
      detail: "Connection unavailable",
      left: choice("OFFLINE", "none"),
      right: choice("OFFLINE", "none"),
    };
  if (!task)
    return {
      ...base,
      kind: "no-focus",
      detail: "Choose a task key",
      left: choice("SELECT TASK", "none"),
      right: choice("SELECT TASK", "none"),
    };
  if (!verified)
    return {
      ...base,
      kind: "no-focus",
      detail: "Verify task in app",
      left: choice("OPEN TASK", "open"),
      right: choice("OPEN TASK", "open"),
    };
  const offered = new Map(
    (frame.native.choices || []).map((c) => [c.action, c.token]),
  );
  const direct = (name, label, hold = false) =>
    offered.has(name)
      ? choice(label, "native", {
          action: name,
          token: offered.get(name),
          hold,
        })
      : undefined;
  const p = projectTask(task, frame.native, now);
  let kind = frame.native.kind;
  if (
    !["approval", "plan"].includes(kind) &&
    (frame.request || task.pendingRequest)
  )
    kind = (frame.request || task.pendingRequest).kind;
  else if (kind === "running" && task.status === "needs-input")
    kind = /^Plan ready/.test(task.detail || "") ? "plan" : "question";
  if (kind === "idle")
    kind =
      frame.request?.kind ||
      (/^Plan ready/.test(task.detail || "")
        ? "plan"
        : task.status === "needs-input"
          ? "question"
          : ["running", "thinking"].includes(task.status)
            ? "running"
            : p.status === "stale"
              ? "stale"
              : "idle");
  if (kind === "approval")
    return {
      ...base,
      kind,
      detail:
        frame.native.title || frame.request?.title || "Permission request",
      left:
        direct("allow", "HOLD ALLOW", true) || choice("OPEN REQUEST", "open"),
      right: direct("deny", "DENY") || choice("VIEW REQUEST", "open"),
    };
  if (kind === "question")
    return {
      ...base,
      kind,
      detail: frame.request?.title || "Answer in Codex",
      left: choice("OPEN QUESTION", "open"),
      right: choice("VIEW OPTIONS", "open"),
    };
  if (kind === "plan")
    return {
      ...base,
      kind,
      detail: "Plan ready",
      left: direct("start", "HOLD START", true) || choice("OPEN PLAN", "open"),
      right: choice("REVIEW PLAN", "open"),
    };
  if (kind === "running")
    return {
      ...base,
      kind,
      detail: "Task running",
      left: direct("interrupt", "INTERRUPT") || choice("OPEN TASK", "open"),
      right: choice("OUTPUT", "open"),
    };
  if (kind === "stale")
    return {
      ...base,
      kind,
      detail: "Last signal is stale",
      left: choice("OPEN TASK", "open"),
      right: choice("CHECK STATE", "refresh"),
    };
  return {
    ...base,
    kind: "idle",
    detail: "No pending decision",
    left: choice("OPEN TASK", "open"),
    right: choice("REVIEW DIFF", "review"),
  };
}

export function sameGesture(start, current, now = Date.now()) {
  if (!start || now - start.at > 10000 || start.cancelled) return false;
  const a = start.command,
    b = current.command;
  if (
    start.threadId !== current.threadId ||
    start.kind !== current.kind ||
    start.windowId !== current.windowId ||
    a.operation !== b.operation ||
    a.action !== b.action ||
    a.token !== b.token ||
    start.detail !== current.detail
  )
    return false;
  return !a.hold || now - start.at >= HOLD_MS;
}

async function nativeCall(command, id, operation, token) {
  const helper = fileURLToPath(new URL("./travel-ui-control", import.meta.url));
  try {
    const { stdout } = await exec(
      helper,
      [command, id, ...(operation ? [operation, token] : [])],
      { timeout: command === "navigate" ? 6500 : 3500, maxBuffer: 256 * 1024 },
    );
    return JSON.parse(stdout);
  } catch (error) {
    try {
      return JSON.parse(error.stdout);
    } catch {
      return {
        ok: false,
        reason:
          error.killed || error.code === "ETIMEDOUT"
            ? "helper-timeout"
            : "helper-unavailable",
      };
    }
  }
}

export function installTravelPilot(deps) {
  const {
    store,
    workdesk,
    agentStatus,
    renderKey,
    svgDataUrl,
    openThread,
    openNewChat,
    executeCommand,
    commands,
    logger,
  } = deps;
  const settingsTargets = deps.settingsTargets ?? {};
  const call = deps.nativeCall || nativeCall,
    now = deps.now || Date.now;
  const ledger =
    deps.readLedger ||
    createReadLedger(deps.readStatePath ?? undefined, logger);
  if (store.acknowledge)
    logger.info(
      `Travel restored ${ledger.restore(store)} read acknowledgements`,
    );
  const requestFor = deps.requestFor || createRequestReader();
  const withRequest = (task) =>
    task ? { ...task, pendingRequest: requestFor(task) } : task;
  const resolveProject =
    deps.projectName ||
    createProjectResolver(
      store.codexHome
        ? join(store.codexHome, ".codex-global-state.json")
        : undefined,
    );
  const modes = new Map(),
    utilityPresses = new Map(),
    pendingUtilities = new Set();
  let voiceObserver;
  let voice = "unknown",
    voiceAt = 0,
    animationTimer,
    phase = 0,
    dictation,
    readCandidate;
  const visible = new Map(),
    displayed = new Map(),
    pressed = new Map(),
    notices = new Map(),
    motionCards = new Map();
  let animating = false;
  let frame = {
      sessions: [],
      observedAt: 0,
      native: undefined,
      focus: undefined,
      offline: false,
    },
    pollPromise,
    timer,
    busy = false,
    generation = 0;
  const enabled = (action, settings) =>
    action.isKey() && settings?.travelPilot === true;
  function currentPair() {
    return contextPair(frame, now());
  }
  async function send(action, svg) {
    await renderKey(action, svgDataUrl(svg));
  }
  function liveVoice() {
    const external = voiceObserver?.();
    if (external) return external;
    return now() - voiceAt <= MAX_FRAME_AGE ? voice : "unknown";
  }
  function modeState(kind) {
    if (
      frame.offline ||
      !frame.native?.ok ||
      frame.native.threadId !== frame.focus?.id
    )
      return undefined;
    const m = modes.get(frame.focus?.id + ":" + kind);
    return m && now() - m.at < 30000 ? m.active : undefined;
  }
  async function draw(action, settings, register = true) {
    if (!enabled(action, settings)) return;
    if (register) visible.set(action.id, { action, settings });
    else if (!visible.has(action.id)) return;
    motionCards.delete(action.id);
    if (settings.travelUtility) {
      await send(
        action,
        utilitySvg(settings.travelUtility, {
          active: modeState(settings.travelUtility),
          voice: liveVoice(),
          phase,
          dictating: !!dictation?.active,
          notice: notices.get(action.id) || "",
          pending: pendingUtilities.has(action.id),
        }),
      );
      return;
    }
    if (settings.travelRole === "left" || settings.travelRole === "right") {
      const live = currentPair(),
        latched = pressed.get(action.id),
        side = settings.travelRole;
      if (
        latched &&
        !sameGesture(
          { ...latched, at: now() - HOLD_MS },
          { ...live, command: live[side], windowId: frame.native?.windowId },
          now(),
        )
      )
        latched.cancelled = true;
      const pair = latched || live;
      const view = {
        ...pair,
        command: pair[side],
        windowId: frame.native?.windowId,
      };
      await send(
        action,
        controlSvg(
          pair,
          side,
          pressed.has(action.id),
          notices.get(action.id) || "",
        ),
      );
      displayed.set(action.id, view);
    } else {
      const index = Math.min(7, Math.max(0, Number(settings.slot || 1) - 1)),
        snapshot = frame.sessions[index];
      const native =
        now() - frame.observedAt <= MAX_FRAME_AGE && !frame.transitioning
          ? frame.native
          : undefined;
      const task = {
        ...projectTask(snapshot, native, now(), frame.offline),
        projectName: resolveProject(snapshot),
      };
      if (notices.has(action.id)) task.title = notices.get(action.id);
      if (motionStatus(task.status))
        motionCards.set(action.id, { action, task, slot: index + 1 });
      await send(action, taskSvg(task, index + 1, now()));
      displayed.set(action.id, { snapshot, at: now() });
    }
  }
  async function drawAll() {
    await Promise.all(
      [...visible.values()].map(({ action, settings }) =>
        draw(action, settings, false),
      ),
    );
  }
  async function animate() {
    // Animate cached card state only. One batch at a time prevents an image backlog.
    if (animating || !visible.size) return;
    animating = true;
    try {
      const previous = phase;
      phase = Math.floor(now() / 250) % 4;
      const jobs = [...motionCards.values()]
        .filter((v) => visible.has(v.action.id))
        .map(({ action, task, slot }) =>
          send(action, taskSvg(task, slot, now())),
        );
      if (phase !== previous && liveVoice() === "active")
        for (const { action, settings } of visible.values())
          if (settings.travelUtility === "voice")
            jobs.push(draw(action, settings, false));
      await Promise.all(jobs);
    } finally {
      animating = false;
    }
  }
  // Task data and UI-control availability are independent. A slow AX read must
  // not blank fresh local task statuses or extend the lifetime of an action.
  let dataAvailable = false,
    appOffline = false,
    nextNativeReadAt = 0;
  let nativeTarget,
    globalReadAt = -Infinity,
    healthReason,
    healthLoggedAt = -Infinity;
  function controlHealth(native) {
    const reason = native.ok
      ? "ready"
      : [
            "helper-timeout",
            "helper-unavailable",
            "no-focus",
            "accessibility",
            "offline",
            "control-failed",
          ].includes(native.reason)
        ? native.reason
        : "unverified";
    if (reason !== healthReason || now() - healthLoggedAt >= 60000) {
      if (reason !== "ready")
        logger.warn(
          "Travel UI controls unavailable: " +
            reason +
            "; task status uses local data",
        );
      else if (healthReason && healthReason !== "ready")
        logger.info("Travel UI controls recovered");
      healthLoggedAt = now();
    }
    healthReason = reason;
  }
  async function readControl(command, id) {
    try {
      return (
        (await call(command, id)) || { ok: false, reason: "helper-unavailable" }
      );
    } catch {
      return { ok: false, reason: "helper-unavailable" };
    }
  }
  async function poll() {
    if (!visible.size) return;
    try {
      const sessions = store.sessions(8).map(withRequest),
        focus = withRequest(store.focusedThread());
      if (frame.focus?.id !== focus?.id) {
        generation++;
        readCandidate = undefined;
        nextNativeReadAt = 0;
      }
      frame = {
        ...frame,
        sessions,
        focus,
        request: focus?.pendingRequest,
        native: frame.native?.threadId === focus?.id ? frame.native : undefined,
        offline: appOffline,
      };
      if (!dataAvailable && healthReason === "data-unavailable")
        logger.info("Travel task data recovered");
      dataAvailable = true;
    } catch {
      if (dataAvailable) generation++;
      dataAvailable = false;
      readCandidate = undefined;
      frame = { ...frame, native: undefined, offline: true };
      if (healthReason !== "data-unavailable")
        logger.warn("Travel task data unavailable");
      healthReason = "data-unavailable";
      await drawAll();
      return;
    }
    // A key press has priority over background Accessibility observation.
    // Local cards may refresh, but no new helper competes with navigation.
    if (busy) {
      await drawAll();
      return;
    }
    // Refresh local data even while an earlier native read is still in flight.
    if (
      pollPromise ||
      (nativeTarget === frame.focus?.id && now() < nextNativeReadAt)
    ) {
      await drawAll();
      return pollPromise;
    }
    const gen = generation,
      focus = frame.focus;
    nativeTarget = focus?.id;
    pollPromise = (async () => {
      await drawAll();
      const native = await readControl("read", focus?.id || "");
      if (gen !== generation || !dataAvailable || frame.focus?.id !== focus?.id)
        return;
      const observedAt = now();
      if (typeof native.appRunning === "boolean")
        appOffline = !native.appRunning;
      controlHealth(native);
      nextNativeReadAt = native.ok ? 0 : now() + 3000;
      let ui = native.ui;
      if (ui?.voice && ui.voice !== "unknown") {
        voice = ui.voice;
        voiceAt = now();
      }
      for (const kind of ["fast", "plan"]) {
        if (
          native.ok &&
          native.threadId === focus?.id &&
          typeof ui?.[kind] === "boolean"
        )
          modes.set(focus.id + ":" + kind, { active: ui[kind], at: now() });
      }
      // Failure replaces the previous native observation, revoking its tokens.
      frame = { ...frame, native, observedAt, offline: appOffline };
      const current = frame.focus;
      if (
        native.ok &&
        native.threadId === current?.id &&
        native.kind === "idle" &&
        current?.status === "unread" &&
        current.completedAt > 0
      ) {
        const key = current.id + ":" + current.completedAt;
        if (readCandidate?.key === key && now() - readCandidate.at >= 2000) {
          ledger.record(current, store);
          frame.sessions = store.sessions(8).map(withRequest);
          frame.focus = withRequest(store.focusedThread());
          frame.request = frame.focus?.pendingRequest;
        } else if (readCandidate?.key !== key)
          readCandidate = { key, at: now() };
      } else readCandidate = undefined;
      await drawAll();
      const externalVoice = voiceObserver?.();
      if (
        (!ui?.voice || ui.voice === "unknown") &&
        (!externalVoice || externalVoice === "unknown") &&
        now() - globalReadAt >= 4500
      ) {
        globalReadAt = now();
        const global = await readControl("globals", "current");
        if (
          gen !== generation ||
          !dataAvailable ||
          frame.focus?.id !== focus?.id
        )
          return;
        if (global.ok && global.voice && global.voice !== "unknown") {
          voice = global.voice;
          voiceAt = now();
        }
        if (typeof global.appRunning === "boolean") {
          appOffline = !global.appRunning;
          frame = { ...frame, offline: appOffline };
          if (appOffline) frame.native = undefined;
        }
        await drawAll();
      }
    })()
      .catch(() => {
        // Rendering/ledger failures are not evidence that Codex went offline.
        frame = { ...frame, native: undefined };
        readCandidate = undefined;
        logger.warn("Travel UI refresh failed");
      })
      .finally(() => {
        pollPromise = undefined;
      });
    return pollPromise;
  }
  async function notice(action, text) {
    notices.set(action.id, text);
    await draw(action, visible.get(action.id)?.settings);
    setTimeout(() => {
      notices.delete(action.id);
      void drawAll();
    }, 4500).unref?.();
  }
  async function navigate(id) {
    // Drain the existing read before opening a task. Its stale result is
    // discarded by the generation check while selection is in progress.
    if (pollPromise) await pollPromise;
    const already = await readControl("confirm", id);
    if (already.ok && already.threadId === id) return;
    const opened = await readControl("navigate", id);
    if (!opened.ok || opened.threadId !== id || !opened.windowId)
      throw new Error("Task navigation was not confirmed");
  }
  async function chooseTask(snapshot, action) {
    if (busy) return;
    busy = true;
    generation++;
    frame.transitioning = true;
    pressed.clear();
    await drawAll();
    try {
      if (snapshot) {
        await navigate(snapshot.id);
        ledger.record(snapshot, store);
      } else await openNewChat(store.latestThread()?.cwd);
      store.invalidate();
    } catch (error) {
      await notice(action, "OPEN CODEX");
      logger.warn(`Travel pilot task selection failed: ${String(error)}`);
    } finally {
      generation++;
      frame.transitioning = false;
      busy = false;
      if (pollPromise) await pollPromise;
      await poll();
    }
  }
  async function utilityDown(event) {
    const { action, payload } = event,
      kind = payload.settings.travelUtility;
    if (utilityPresses.has(action.id) || pendingUtilities.has(action.id))
      return;
    utilityPresses.set(action.id, { kind, threadId: frame.focus?.id });
    if (kind !== "dictate") return;
    if (dictation) {
      await notice(action, "BUSY");
      return;
    }
    const held = { actionId: action.id, active: false };
    dictation = held;
    held.promise = (async () => {
      try {
        if (!frame.focus?.id) throw new Error("No task");
        await deps.startDictation(frame.focus.id);
        held.active = true;
        await drawAll();
      } catch (e) {
        logger.warn("Travel dictation failed: " + String(e));
        await notice(action, "OPEN TASK");
      }
    })();
    await held.promise;
  }
  async function finishDictation(action) {
    const held = dictation;
    if (!held || held.actionId !== action.id) return;
    await held.promise;
    try {
      await deps.endDictation();
    } catch (e) {
      logger.warn("Travel dictation release failed: " + String(e));
      await action.showAlert();
    } finally {
      dictation = undefined;
      await drawAll();
    }
  }
  async function utilityUp(event) {
    const { action, payload } = event,
      kind = payload.settings.travelUtility,
      start = utilityPresses.get(action.id);
    utilityPresses.delete(action.id);
    if (kind === "dictate") {
      await finishDictation(action);
      return;
    }
    if (!start || pendingUtilities.has(action.id)) return;
    generation++;
    pendingUtilities.add(action.id);
    await drawAll();
    try {
      if (kind === "voice") {
        await deps.runWorkdeskGlobal("voice");
        const observed = await call("globals", "current");
        voice = observed.ok ? observed.voice : "unknown";
        voiceAt = now();
      } else {
        if (!start.threadId || start.threadId !== store.focusedThread()?.id)
          throw new Error("Target changed");
        const result = await executeCommand(
          commands.find((c) => c.id === kind),
          start.threadId,
        );
        if (typeof result?.active === "boolean")
          modes.set(start.threadId + ":" + kind, {
            active: result.active,
            at: now(),
          });
      }
    } catch (e) {
      logger.warn(`Travel ${kind} failed: ${String(e)}`);
      await notice(action, kind === "voice" ? "CHECK CODEX" : "OPEN TASK");
      await action.showAlert();
    } finally {
      generation++;
      pendingUtilities.delete(action.id);
      store.invalidate();
      if (pollPromise) await pollPromise;
      await poll();
      await drawAll();
    }
  }
  async function down(event) {
    const { action, payload } = event,
      settings = payload.settings;
    if (settings.travelUtility) return utilityDown(event);
    if (settings.travelRole !== "left" && settings.travelRole !== "right") {
      const snapshot = displayed.get(action.id)?.snapshot;
      if (!displayed.has(action.id)) {
        await action.showAlert();
        return;
      }
      await chooseTask(snapshot, action);
      return;
    }
    if (busy) return;
    const view = displayed.get(action.id);
    if (!view || view.command.operation === "none") {
      await notice(action, "SELECT TASK");
      return;
    }
    if (
      view.command.operation === "native" &&
      now() - frame.observedAt > MAX_FRAME_AGE
    ) {
      await notice(action, "CHECKING");
      void poll();
      return;
    }
    pressed.set(action.id, { ...view, at: now() });
    await draw(action, settings);
  }
  async function up(event) {
    const { action, payload } = event,
      settings = payload.settings;
    if (settings.travelUtility) return utilityUp(event);
    if (!settings.travelRole) return;
    const start = pressed.get(action.id);
    pressed.delete(action.id);
    if (!start || busy) return;
    const pair = currentPair(),
      current = {
        ...pair,
        command: pair[settings.travelRole],
        windowId: frame.native?.windowId,
      };
    if (!sameGesture(start, current, now())) {
      await notice(
        action,
        start.command.hold && now() - start.at < HOLD_MS
          ? "HOLD 0.8s"
          : "CHANGED",
      );
      return;
    }
    busy = true;
    try {
      if (start.command.operation === "native") {
        // Native preflight rechecks the task/window and the exact control token
        // immediately before its AX press. Never replay a changed request.
        const result = await call(
          "act",
          start.threadId,
          start.command.action,
          start.command.token,
        );
        if (!result.ok) throw new Error(result.reason || "Control unavailable");
        await action.showOk();
      } else if (start.command.operation === "open") {
        await navigate(start.threadId);
      } else if (start.command.operation === "review") {
        // The command bridge also requires the same foreground task.
        await executeCommand(
          commands.find((c) => c.id === "review-panel"),
          start.threadId,
        );
      } else if (start.command.operation === "refresh") store.invalidate();
    } catch (error) {
      logger.warn(`Travel pilot action cancelled: ${String(error)}`);
      await notice(action, "CHECK TASK");
      await action.showAlert();
    } finally {
      busy = false;
      generation++;
      store.invalidate();
      if (pollPromise) await pollPromise;
      await poll();
      await drawAll();
    }
  }
  function wrapHandler(owner, name, fn) {
    const original = owner[name];
    owner[name] = async function (event) {
      if (name === "onWillAppear" && event.action.isKey()) {
        const migration = settingsTargets[event.action.id.toLowerCase()];
        if (migration) {
          const settings = { ...event.payload.settings, ...migration };
          if (
            Object.entries(migration).some(
              ([k, v]) => event.payload.settings[k] !== v,
            )
          ) {
            await event.action.setSettings(settings);
            logger.info(`Travel pilot migrated settings: ${event.action.id}`);
          }
          event = { ...event, payload: { ...event.payload, settings } };
        }
      }
      if (enabled(event.action, event.payload?.settings)) return fn(event);
      return original?.call(this, event);
    };
  }
  for (const owner of [workdesk, agentStatus, deps.commandHandler].filter(
    Boolean,
  )) {
    const originalDraw = owner.draw;
    owner.draw = async function (action, settings) {
      const s = settings?.travelPilot ? settings : await action.getSettings();
      if (enabled(action, s)) return draw(action, s);
      return originalDraw?.call(this, action, settings);
    };
    wrapHandler(owner, "onWillAppear", async (e) => {
      await draw(e.action, e.payload.settings);
      logger.info(
        `Travel pilot ready: ${e.payload.settings.travelRole || "task " + e.payload.settings.slot}`,
      );
      void poll();
    });
    wrapHandler(owner, "onDidReceiveSettings", async (e) => {
      pressed.delete(e.action.id);
      await draw(e.action, e.payload.settings);
      void poll();
    });
    wrapHandler(owner, "onKeyDown", down);
    wrapHandler(owner, "onKeyUp", up);
    const oldDisappear = owner.onWillDisappear;
    owner.onWillDisappear = async function (e) {
      visible.delete(e.action.id);
      motionCards.delete(e.action.id);
      pressed.delete(e.action.id);
      displayed.delete(e.action.id);
      notices.delete(e.action.id);
      utilityPresses.delete(e.action.id);
      if (e.payload?.settings?.travelUtility === "dictate") {
        await finishDictation(e.action);
        return;
      }
      return oldDisappear?.call(this, e);
    };
  }
  return {
    start() {
      if (timer) return;
      timer = setInterval(() => void poll(), 1500);
      timer.unref?.();
      animationTimer = setInterval(
        () =>
          void animate().catch((e) =>
            logger.warn("Travel animation frame failed: " + String(e)),
          ),
        MOTION_INTERVAL_MS,
      );
      animationTimer.unref?.();
      void poll();
      logger.info("Travel pilot v2 active (Travel settings only)");
    },
    stop() {
      clearInterval(timer);
      clearInterval(animationTimer);
      timer = undefined;
      pressed.clear();
      utilityPresses.clear();
      if (dictation)
        void finishDictation({
          id: dictation.actionId,
          showAlert: async () => {},
        });
      visible.clear();
      motionCards.clear();
    },
    poll,
    animate,
    setVoiceObserver(observer) {
      voiceObserver = observer;
    },
    // Dependency-injected controller supports deterministic event tests.
    presentation() {
      return {
        voice: liveVoice(),
        fast: modeState("fast"),
        plan: modeState("plan"),
        dictating: !!dictation?.active,
      };
    },
    inspect() {
      return { frame, visible: visible.size, pressed: pressed.size };
    },
  };
}
