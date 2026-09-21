import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile),
  icons = JSON.parse(
    readFileSync(new URL("./icons.json", import.meta.url), "utf8"),
  );
const commands = ["quick-chat", "new-chat", "volume-down", "volume-up", "mute"],
  W = "#F4F4F1",
  M = "#A7ADB7",
  BG = "#191B1F";
function icon(name, color = W) {
  const i = icons[name],
    v = i.viewBox.split(" ").map(Number),
    scale = 48 / v[2];
  return `<g transform="matrix(${scale} 0 0 ${scale} 48 23)" fill="${color}">${i.body.replaceAll("currentColor", color)}</g>`;
}
const text = (s, y, size, color = W) =>
  `<text x="72" y="${y}" fill="${color}" font-family="Arial" font-size="${size}" font-weight="700" text-anchor="middle">${s}</text>`;
export function moreSvg(command, { volume, muted } = {}) {
  const isMute = command === "mute",
    known = isMute && typeof muted === "boolean",
    active = isMute && muted === true,
    color = known ? (muted ? "#F47F8C" : "#69E4A6") : isMute ? M : W;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="12" fill="${BG}"/><rect x="4" y="4" width="136" height="136" rx="10" fill="none" stroke="${known ? color : "#454950"}" stroke-width="${known ? 3 : 2}"/>`;
  const name =
    command === "quick-chat"
      ? "plus-chat-bubble-light-20"
      : command === "new-chat"
        ? "square-and-pencil-light-20"
        : command === "mute" && muted === true
          ? "speaker-sound-wave-2-slash-light-16"
          : "speaker-sound-wave-2-light-16";
  s += icon(name, color);
  const label = {
    "quick-chat": "Quick chat",
    "new-chat": "New task",
    "volume-down": "Vol −",
    "volume-up": "Vol +",
    mute: active ? "Unmute" : "Mute",
  }[command];
  s += text(label, 101, 22, color);
  if (command.startsWith("volume-"))
    s += text(Number.isFinite(volume) ? `${volume}%` : "Volume", 128, 16, M);
  if (command === "mute")
    s += text(
      muted === true ? "MUTED" : muted === false ? "SOUND ON" : "SOUND",
      128,
      16,
      known ? color : M,
    );
  return s + "</svg>";
}
export async function readAudio() {
  const { stdout } = await run(
    "/usr/bin/osascript",
    [
      "-e",
      "set s to get volume settings",
      "-e",
      "return {output volume of s, output muted of s}",
    ],
    { timeout: 3000 },
  );
  const m = stdout.trim().match(/^(\d+),\s*(true|false)$/);
  if (!m) throw Error("Audio state unavailable");
  return { volume: Number(m[1]), muted: m[2] === "true" };
}
export function installTravelMore({
  workdesk,
  renderKey,
  svgDataUrl,
  read = readAudio,
}) {
  const visible = new Map();
  let state = {},
    polling;
  const enabled = (a, s) =>
    a.isKey() && s?.travelMore === true && commands.includes(s.mobileCommand);
  async function draw(a, s) {
    visible.set(a.id, { a, s });
    await renderKey(a, svgDataUrl(moreSvg(s.mobileCommand, state)));
  }
  async function poll() {
    if (polling) return polling;
    if (
      ![...visible.values()].some((v) =>
        ["mute", "volume-up", "volume-down"].includes(v.s.mobileCommand),
      )
    )
      return;
    polling = (async () => {
      try {
        state = await read();
      } catch {
        state = {};
      }
      await Promise.all([...visible.values()].map((v) => draw(v.a, v.s)));
    })().finally(() => {
      polling = undefined;
    });
    return polling;
  }
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
        await draw(e.action, e.payload.settings);
        void poll();
        return;
      }
      return old?.call(this, e);
    };
  }
  const oldUp = workdesk.onKeyUp;
  workdesk.onKeyUp = async function (e) {
    const result = await oldUp?.call(this, e);
    if (enabled(e.action, e.payload.settings)) await poll();
    return result;
  };
  const oldDisappear = workdesk.onWillDisappear;
  workdesk.onWillDisappear = async function (e) {
    visible.delete(e.action.id);
    return oldDisappear?.call(this, e);
  };
  const timer = setInterval(() => void poll(), 2000);
  timer.unref?.();
  return {
    poll,
    stop() {
      clearInterval(timer);
      visible.clear();
    },
  };
}
