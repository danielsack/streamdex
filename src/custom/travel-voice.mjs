import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { moreSvg } from "./travel-more.mjs";
const run = promisify(execFile),
  helper = fileURLToPath(new URL("./voice-control", import.meta.url));
const icons = JSON.parse(
  readFileSync(new URL("./icons.json", import.meta.url)),
);
const GREEN = "#69E4A6",
  RED = "#F47F8C",
  GRAY = "#A7ADB7",
  BG = "#191B1F";
export async function nativeVoice(command, payload) {
  try {
    const { stdout } = await run(
      helper,
      [command, ...(payload ? [JSON.stringify(payload)] : [])],
      { timeout: 14000, maxBuffer: 65536 },
    );
    return JSON.parse(stdout);
  } catch (e) {
    try {
      return JSON.parse(e.stdout);
    } catch {
      return { ok: false, active: false, reason: "unverified", controls: [] };
    }
  }
}
export function createVoiceController({
  call = nativeVoice,
  now = Date.now,
  onChange = async () => {},
} = {}) {
  let state = { ok: false, active: false, reason: "loading", controls: [] },
    busy = false,
    polling,
    revision = 0;
  const view = () =>
    now() - (state.observedAt ?? 0) > 6500
      ? { ...state, ok: false, controls: [], reason: "unverified" }
      : state;
  function capture(kind) {
    const s = view(),
      c = s.controls?.find((c) => c.kind === kind);
    if (
      !s.ok ||
      !s.active ||
      !s.targetId ||
      !c?.enabled ||
      typeof c.on !== "boolean"
    )
      return;
    return {
      targetId: s.targetId,
      kind,
      token: c.token,
      on: c.on,
      observedAt: s.observedAt,
    };
  }
  async function poll() {
    if (busy || polling) return polling;
    const gen = revision;
    polling = (async () => {
      let next;
      try {
        next = await call("read");
      } catch {
        next = {
          ok: false,
          active: state.active,
          controls: [],
          reason: "unverified",
        };
      }
      if (gen === revision) {
        // Losing accessibility (including screen lock) is not evidence that Voice ended.
        state = next.ok
          ? next
          : { ...next, active: state.active, controls: [] };
        await onChange();
      }
    })().finally(() => {
      polling = undefined;
    });
    return polling;
  }
  async function perform(start) {
    if (busy) return { ok: false, reason: "busy" };
    const current = start && capture(start.kind);
    if (
      !current ||
      !start ||
      now() - start.observedAt > 6500 ||
      ["targetId", "kind", "token", "on"].some((k) => current[k] !== start[k])
    )
      return { ok: false, reason: "session-changed" };
    busy = true;
    revision++;
    await onChange();
    let result;
    try {
      result = await call("act", start);
      state = result.state ?? {
        ok: false,
        active: state.active,
        controls: [],
        reason: "unverified",
      };
      const after = capture(start.kind);
      if (
        result.ok &&
        (!after || after.targetId !== start.targetId || after.on === start.on)
      )
        result = { ok: false, reason: "not-confirmed" };
    } catch {
      state = {
        ok: false,
        active: state.active,
        controls: [],
        reason: "unverified",
      };
      result = { ok: false, reason: "unverified" };
    } finally {
      busy = false;
      revision++;
      await onChange();
    }
    return result;
  }
  return { poll, capture, perform, view, isBusy: () => busy };
}
function icon(name, color) {
  const i = icons[name],
    v = i.viewBox.split(/\s+/).map(Number),
    scale = 44 / Math.max(v[2], v[3]);
  return `<g transform="matrix(${scale} 0 0 ${scale} ${50 - v[0] * scale} ${31 - v[1] * scale})" fill="${color}">${i.body.replaceAll("currentColor", color)}</g>`;
}
const text = (s, y, size, color) =>
  `<text x="72" y="${y}" font-family="Arial" font-size="${size}" font-weight="700" text-anchor="middle" fill="${color}">${s}</text>`;
export function voiceSvg(
  kind,
  state,
  { pending = false, notice = false } = {},
) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="12" fill="${BG}"/>`;
  // Inactive Voice slots become neutral Quick chat and New task controls.
  if (!state.active) {
    let base = moreSvg(kind === "mic" ? "quick-chat" : "new-chat");
    if (pending || notice || !state.ok)
      base = base.replace(
        "</svg>",
        text(
          notice ? "CHECK APP" : pending || !state.ok ? "CHECKING" : "",
          127,
          16,
          GRAY,
        ) + "</svg>",
      );
    return base;
  }
  const c = state.ok
      ? state.controls?.find((c) => c.kind === kind && c.enabled)
      : undefined,
    on = c?.on,
    known = typeof on === "boolean",
    color = known ? (on ? GREEN : RED) : GRAY;
  s += `<rect x="4" y="4" width="136" height="136" rx="10" fill="none" stroke="${color}" stroke-width="3"/>`;
  s += icon(
    kind === "mic"
      ? "microphone-light-20"
      : on === false
        ? "speaker-sound-wave-2-slash-light-16"
        : "speaker-sound-wave-2-light-16",
    color,
  );
  if (kind === "mic" && on === false)
    s += `<path d="M49 29L95 77" stroke="${BG}" stroke-width="7"/><path d="M49 29L95 77" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>`;
  s += text(kind === "mic" ? "Voice mic" : "Voice sound", 101, 21, "#F4F4F1");
  s += text(
    notice
      ? "CHECK APP"
      : pending
        ? "CHECKING"
        : !known
          ? "CHECK APP"
          : !on
            ? "MUTED"
            : kind === "mic"
              ? "LISTENING"
              : "SOUND ON",
    127,
    16,
    notice || pending ? "#F1C56D" : color,
  );
  return s + "</svg>";
}
export function installTravelVoice({
  workdesk,
  travelPilot,
  renderKey,
  svgDataUrl,
  runWorkdeskGlobal,
  logger,
  call = nativeVoice,
  now = Date.now,
  interval = 1500,
}) {
  const visible = new Map(),
    pressed = new Map(),
    notices = new Map(),
    clients = new Map(),
    displayed = new Map();
  let stopped = false,
    actionBusy = false,
    generation = 0,
    signature = "";
  const enabled = (a, s) =>
    a.isKey() && ["mic", "sound"].includes(s?.travelVoiceControl);
  const controller = createVoiceController({ call, now, onChange: changed });
  async function changed() {
    const s = controller.view(),
      next = JSON.stringify([s.ok, s.active, s.targetId]);
    if (next !== signature) {
      generation++;
      signature = next;
    }
    await drawAll();
    await Promise.all([...clients.values()].map((fn) => fn()));
  }
  function captureAction(kind) {
    const s = controller.view();
    if (!s.ok || !["mic", "sound"].includes(kind)) return;
    if (s.active) {
      const voice = controller.capture(kind);
      return voice ? { mode: "voice", kind, generation, voice } : undefined;
    }
    return {
      mode: "default",
      kind,
      generation,
      command: kind === "mic" ? "quick-chat" : "new-chat",
      observedAt: s.observedAt,
    };
  }
  async function performAction(start) {
    if (actionBusy) return { ok: false, reason: "busy" };
    if (!start) return { ok: false, reason: "unverified" };
    actionBusy = true;
    try {
      // Re-read before dispatch: a key must never change its meaning mid-gesture.
      await controller.poll();
      const current = captureAction(start.kind);
      if (
        !current ||
        current.mode !== start.mode ||
        current.generation !== start.generation
      )
        return { ok: false, reason: "mode-changed" };
      if (start.mode === "voice") return await controller.perform(start.voice);
      if (current.command !== start.command || now() - start.observedAt > 6500)
        return { ok: false, reason: "stale" };
      await runWorkdeskGlobal(start.command);
      return { ok: true };
    } catch (e) {
      logger?.warn("Dynamic Voice action: " + String(e));
      return { ok: false, reason: "unverified" };
    } finally {
      actionBusy = false;
      await poll();
      await drawAll();
    }
  }
  async function draw(a, s) {
    if (!visible.has(a.id)) return;
    const shown = captureAction(s.travelVoiceControl);
    await renderKey(
      a,
      svgDataUrl(
        voiceSvg(s.travelVoiceControl, controller.view(), {
          pending: controller.isBusy() || actionBusy,
          notice: (notices.get(a.id) ?? 0) > now(),
        }),
      ),
    );
    if (visible.has(a.id)) {
      if (shown?.generation === generation) displayed.set(a.id, shown);
      else displayed.delete(a.id);
    }
  }
  async function drawAll() {
    await Promise.all([...visible.values()].map(({ a, s }) => draw(a, s)));
  }
  async function poll() {
    if (!stopped && (visible.size || clients.size)) await controller.poll();
  }
  travelPilot?.setVoiceObserver?.(() => {
    const s = controller.view();
    if (!(visible.size || clients.size) || !s.ok) return undefined;
    if (!s.active) return "off";
    return s.controls?.find((c) => c.kind === "mic")?.on === false
      ? "muted"
      : "active";
  });
  const oldDraw = workdesk.draw;
  workdesk.draw = async function (a, s) {
    const settings = s ?? (await a.getSettings());
    if (enabled(a, settings)) return draw(a, settings);
    return oldDraw?.call(this, a, s);
  };
  for (const name of ["onWillAppear", "onDidReceiveSettings"]) {
    const old = workdesk[name];
    workdesk[name] = async function (e) {
      if (enabled(e.action, e.payload.settings)) {
        pressed.delete(e.action.id);
        visible.set(e.action.id, { a: e.action, s: e.payload.settings });
        await draw(e.action, e.payload.settings);
        void poll();
        return;
      }
      return old?.call(this, e);
    };
  }
  const oldDown = workdesk.onKeyDown;
  workdesk.onKeyDown = async function (e) {
    if (!enabled(e.action, e.payload.settings)) return oldDown?.call(this, e);
    if (!visible.has(e.action.id) || actionBusy) return;
    const start = displayed.get(e.action.id);
    if (start) pressed.set(e.action.id, start);
    else void poll();
  };
  const oldUp = workdesk.onKeyUp;
  workdesk.onKeyUp = async function (e) {
    if (!enabled(e.action, e.payload.settings)) return oldUp?.call(this, e);
    if (!visible.has(e.action.id)) return;
    const start = pressed.get(e.action.id);
    pressed.delete(e.action.id);
    if (!start || start.kind !== e.payload.settings.travelVoiceControl) return;
    const r = await performAction(start);
    if (!r.ok) {
      logger?.warn("Travel dynamic toggle: " + r.reason);
      notices.set(e.action.id, now() + 3500);
      await drawAll();
    }
  };
  const oldDisappear = workdesk.onWillDisappear;
  workdesk.onWillDisappear = async function (e) {
    visible.delete(e.action.id);
    pressed.delete(e.action.id);
    displayed.delete(e.action.id);
    notices.delete(e.action.id);
    return oldDisappear?.call(this, e);
  };
  const timer = interval
    ? setInterval(
        () =>
          void poll().catch((e) =>
            logger?.warn("Travel Voice poll: " + String(e)),
          ),
        interval,
      )
    : undefined;
  timer?.unref?.();
  return {
    poll,
    controller,
    captureAction,
    performAction,
    attach(id, onChange) {
      const exists = clients.has(id);
      clients.set(id, onChange);
      if (!exists) void poll();
    },
    detach(id) {
      clients.delete(id);
    },
    inspect: () => ({
      visible: visible.size,
      clients: clients.size,
      state: controller.view(),
    }),
    stop() {
      stopped = true;
      clearInterval(timer);
      visible.clear();
      pressed.clear();
      displayed.clear();
      clients.clear();
    },
  };
}
