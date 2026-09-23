import { taskBorder, runningGlyph } from "./task-motion.mjs";
import { readFileSync } from "node:fs";
const icons = JSON.parse(
  readFileSync(new URL("./icons.json", import.meta.url), "utf8"),
);
const widths = JSON.parse(
  readFileSync(new URL("./font-metrics.json", import.meta.url), "utf8"),
);
const W = "#F4F4F1",
  M = "#A7ADB7",
  BG = "#191B1F";
export const colors = {
  unread: "#69E4A6",
  read: "#929292",
  running: "#58BFFF",
  thinking: "#58BFFF",
  "needs-input": "#F1C56D",
  error: "#F47F8C",
  idle: "#A0A4AE",
  stale: "#A0A4AE",
  offline: "#A0A4AE",
  unknown: "#A0A4AE",
  off: "#656B75",
};
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export const measuredWidth = (s, size) =>
  ([...String(s)].reduce((n, c) => n + (widths[c] ?? 1000), 0) * size) / 1000;
export function fit(s, size = 16, width = 120) {
  s = String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (measuredWidth(s, size) <= width) return s;
  while (s && measuredWidth(s + "…", size) > width)
    s = [...s].slice(0, -1).join("");
  return s + "…";
}
export function lines(title, size = 24, width = 120) {
  let words = String(title ?? "")
      .trim()
      .split(/\s+/),
    out = [],
    current = "";
  for (let i = 0; i < words.length; i++) {
    let t = (current + " " + words[i]).trim();
    if (measuredWidth(t, size) <= width) {
      current = t;
      continue;
    }
    if (!current) {
      out.push(fit(words[i], size, width));
      if (out.length === 2) return out;
      continue;
    }
    if (out.length === 1) {
      out.push(
        fit((current + " " + words.slice(i).join(" ")).trim(), size, width),
      );
      return out;
    }
    out.push(current);
    current = words[i];
    if (measuredWidth(current, size) > width)
      current = fit(current, size, width);
  }
  if (current) out.push(current);
  return out.slice(0, 2);
}
const txt = (
  value,
  x,
  y,
  size = 24,
  color = W,
  anchor = "middle",
  weight = 700,
) =>
  `<text x="${x}" y="${y}" fill="${color}" font-family="Arial" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`;
const begin = (border = "#454950", width = 2, dash = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="12" fill="${BG}"/><rect x="4" y="4" width="136" height="136" rx="10" fill="none" stroke="${border}" stroke-width="${width}" ${dash ? 'stroke-dasharray="8 6"' : ""}/>`;
function icon(name, x = 48, y = 22, size = 48, color = W) {
  const i = icons[name],
    [vx, vy, vw, vh] = i.viewBox.split(/\s+/).map(Number),
    scale = size / Math.max(vw, vh);
  // Stream Deck's Qt SVG renderer drops nested SVG viewports. Keep glyphs in the root viewport.
  const tx = x + (size - vw * scale) / 2 - vx * scale,
    ty = y + (size - vh * scale) / 2 - vy * scale;
  return `<g transform="matrix(${scale} 0 0 ${scale} ${tx} ${ty})" fill="${color}">${i.body.replaceAll("currentColor", color)}</g>`;
}
export function taskSvg(task, slot, time = 0) {
  const names = {
    off: "EMPTY",
    unread: "READY",
    read: "SEEN",
    thinking: "RUN",
    running: "RUN",
    "needs-input": "INPUT",
    error: "ERROR",
    idle: "IDLE",
    stale: "STALE",
    offline: "OFFLINE",
    unknown: "UNKNOWN",
  };
  const color = colors[task.status] || M,
    background = task.status === "error" ? "#301F25" : BG;
  let s =
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="12" fill="${background}"/>` +
    taskBorder(task.status, color, time);
  if (task.active)
    s +=
      `<rect x="11" y="11" width="23" height="23" rx="6" fill="${W}"/>` +
      txt(slot, 22.5, 28, 18, BG);
  else s += txt(slot, 15, 28, 18, M, "start");
  if (["running", "thinking"].includes(task.status))
    s += task.optionalQuestion
      ? `<g transform="translate(-16 0)">${runningGlyph(color, time)}</g>`
      : runningGlyph(color, time);
  const label = task.optionalQuestion
    ? ["running", "thinking"].includes(task.status)
      ? "RUN ?"
      : "ASK"
    : names[task.status] || "UNKNOWN";
  s += txt(label, 129, 28, 18, color, "end");
  const ts = lines(task.title);
  s += ts
    .map((v, i) => txt(v, 72, ts.length === 1 ? 79 : 64 + i * 28))
    .join("");
  if (task.status === "stale")
    s += `<path d="M58 108l6-6m4 6l6-6m4 6l6-6" stroke="${M}" stroke-width="2"/>`;
  s += txt(
    fit(task.projectName || "No project", 16),
    72,
    130,
    16,
    M,
    "middle",
    400,
  );
  return s + "</svg>";
}

export function controlSvg(pair, side, holding = false, notice = "") {
  const cmd = pair[side],
    disabled = cmd.operation === "none";
  const header = pair.threadId
    ? fit(`${pair.slot > 0 ? pair.slot : "•"} ${pair.title}`, 18)
    : "NO TASK";
  const color = notice
    ? "#F1C56D"
    : disabled
      ? M
      : ["allow", "start"].includes(cmd.action)
        ? colors.unread
        : ["deny", "interrupt"].includes(cmd.action)
          ? colors.error
          : W;
  let label =
    notice ||
    (cmd.action === "interrupt" ? "STOP" : cmd.label.replace(/^HOLD /, ""));
  const ts = lines(label, 24);
  let s = begin(pair.threadId ? "#90959F" : "#454950");
  s += `<title>${esc(pair.detail)}</title>` + txt(header, 72, 29, 18, W);
  s += ts
    .map((v, i) => txt(v, 72, ts.length === 1 ? 84 : 65 + i * 28, 24, color))
    .join("");
  if (cmd.hold && !notice)
    s += txt(
      holding ? "KEEP HOLDING" : "HOLD 0.8s",
      72,
      124,
      holding ? 16 : 18,
      M,
    );
  return s + "</svg>";
}
export function utilitySvg(
  kind,
  {
    active,
    voice = "unknown",
    phase = 0,
    dictating = false,
    notice = "",
    pending = false,
  } = {},
) {
  const on =
    kind === "voice"
      ? voice === "active"
      : kind === "dictate"
        ? dictating
        : active === true;
  const media = kind === "voice" || kind === "dictate",
    known =
      kind === "voice"
        ? ["active", "muted", "off"].includes(voice)
        : kind === "dictate";
  const color = on ? colors.unread : known ? colors.error : media ? M : W;
  let s = begin(
    known ? color : on ? colors.unread : "#454950",
    known || on ? 3 : 2,
  );
  if (kind === "voice") {
    if (voice === "active") {
      const hs = [
        [12, 28, 42, 24, 14],
        [22, 40, 18, 34, 10],
        [34, 16, 30, 12, 26],
        [18, 32, 12, 40, 20],
      ][phase % 4];
      s += `<g stroke="${color}" stroke-width="4" stroke-linecap="round">${hs.map((h, i) => `<path d="M${48 + i * 12} ${48 - h / 2}v${h}"/>`).join("")}</g>`;
    } else s += icon("voice-regular-20", 48, 24, 48, color);
    s +=
      txt("Voice", 72, 97, 24) +
      txt(
        pending
          ? "CHECKING"
          : voice === "active"
            ? "VOICE ON"
            : voice === "muted"
              ? "MUTED"
              : voice === "off"
                ? "OFF"
                : "UNKNOWN",
        72,
        124,
        voice === "unknown" ? 16 : 18,
        pending ? colors["needs-input"] : known ? color : M,
      );
  } else if (kind === "dictate") {
    s +=
      icon("microphone-light-20", 50, 22, 44, color) +
      txt(dictating ? "Release to" : "Hold to", 72, 98, 21) +
      txt(dictating ? "finish" : "dictate", 72, 124, 21);
  } else if (kind === "more") {
    s +=
      icon("ellipsis-horizontal-light-20", 48, 24, 48) +
      txt("More", 72, 108, 24);
  } else {
    s +=
      icon(
        kind === "fast"
          ? on
            ? "bolt-fill-light-16"
            : "bolt-light-20"
          : "checkmark-circle-list-light-16",
        48,
        20,
        48,
        color,
      ) +
      txt(kind === "fast" ? "FAST" : "Plan", 72, 97, 24) +
      txt(
        pending
          ? "CHECKING"
          : active === true
            ? "ON"
            : active === false
              ? "OFF"
              : "UNKNOWN",
        72,
        124,
        pending || active === undefined ? 16 : 18,
        on ? colors.unread : M,
      );
  }
  if (notice)
    s +=
      `<rect x="8" y="77" width="128" height="58" rx="6" fill="${BG}"/>` +
      lines(notice, 21, 120)
        .map((v, i) => txt(v, 72, 101 + i * 25, 21, colors["needs-input"]))
        .join("");
  return s + "</svg>";
}
