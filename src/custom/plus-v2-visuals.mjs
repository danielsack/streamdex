import { readFileSync } from "node:fs";
import { fit, lines } from "./travel-visuals.mjs";
const icons = JSON.parse(
  readFileSync(new URL("./icons.json", import.meta.url)),
);
export const C = {
  white: "#F4F4F1",
  muted: "#A7ADB7",
  bg: "#191B1F",
  green: "#69E4A6",
  blue: "#8BC9F4",
  amber: "#F1C56D",
  red: "#F47F8C",
  border: "#454950",
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
const txt = (s, x, y, size = 16, color = C.white, weight = 700) =>
  `<text x="${x}" y="${y}" fill="${color}" font-family="Arial" font-size="${size}" font-weight="${weight}" text-anchor="middle">${esc(s)}</text>`;
export function glyph(kind, x, y, size, color = C.white) {
  const names = {
    voice: "voice-regular-20",
    dictate: "microphone-light-20",
    mic: "microphone-light-20",
    fast: "bolt-light-20",
    plan: "checkmark-circle-list-light-16",
    quick: "plus-chat-bubble-light-20",
    new: "square-and-pencil-light-20",
  };
  const i = icons[names[kind] ?? kind];
  if (i) {
    const [vx, vy, vw, vh] = i.viewBox.split(/\s+/).map(Number),
      s = size / Math.max(vw, vh);
    return `<g transform="matrix(${s} 0 0 ${s} ${x - vx * s + (size - vw * s) / 2} ${y - vy * s + (size - vh * s) / 2})" fill="${color}">${i.body.replaceAll("currentColor", color)}</g>`;
  }
  const paths = {
    more: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    video:
      '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 10 6-4v12l-6-4"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    reject: '<path d="m5 5 14 14M19 5 5 19"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
    open: '<path d="M8 5H4v15h15v-4M10 4h10v10M10 14 20 4"/>',
    review:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M14 3v18"/>',
  };
  return `<g transform="matrix(${size / 24} 0 0 ${size / 24} ${x} ${y})" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[kind] ?? paths.open}</g>`;
}
export function contextButtons(pair) {
  return ["left", "right"].map((side) => {
    const c = pair[side];
    let label = c.label.replace(/^HOLD /, "Hold "),
      icon = "open",
      color = C.white;
    if (c.operation === "none") {
      label = "Select task";
      color = C.muted;
    } else if (c.action === "allow" || c.action === "start") {
      label = c.action === "allow" ? "Hold allow" : "Hold start";
      icon = "check";
      color = C.amber;
    } else if (c.action === "deny") {
      label = "Reject";
      icon = "reject";
      color = C.red;
    } else if (c.action === "interrupt") {
      label = "Stop";
      icon = "stop";
      color = C.red;
    } else if (c.operation === "review") {
      label = "Review";
      icon = "review";
    } else if (label === "OPEN QUESTION") {
      label = "Question";
      icon = "open";
      color = C.amber;
    } else if (label === "VIEW OPTIONS") {
      label = "Options";
      icon = "plan";
      color = C.amber;
    } else if (label === "OUTPUT") {
      label = "Output";
    } else if (label === "OPEN TASK") {
      label = "Open task";
    } else label = label.charAt(0) + label.slice(1).toLowerCase();
    return { label, icon, color };
  });
}
export function stripSvg(
  column,
  {
    page = "tasks",
    value = "",
    pair,
    voice = "unknown",
    voiceAudio,
    dictating = false,
    fast,
    plan,
    light,
    volume,
    notice = "",
    phase = 0,
  } = {},
) {
  const valueColor =
    column === 3 && typeof volume?.muted === "boolean"
      ? volume.muted
        ? C.red
        : C.green
      : "#BFC6D1";
  let svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#111317"/>` +
    txt(fit(value, 16, 194), 100, 21, 16, valueColor, 400);
  if (page === "more" && column < 2) {
    const label =
        value === "Unassigned"
          ? "Unassigned"
          : light?.on === 1
            ? "Light on"
            : light?.on === 0
              ? "Light off"
              : "Light offline",
      fraction = (light?.brightness ?? 0) / 100;
    svg +=
      txt(label, 100, 57, 16, C.white, 400) +
      `<rect x="18" y="79" width="164" height="5" rx="2" fill="#31353C"/><rect x="18" y="79" width="${164 * fraction}" height="5" rx="2" fill="${C.green}"/>`;
  } else if (column === 3) {
    svg +=
      glyph(page === "more" ? "back" : "more", 86, 34, 28, C.blue) +
      txt(page === "more" ? "Tasks" : "More", 100, 87, 17, C.blue);
  } else {
    let buttons;
    if (column === 0)
      buttons = [
        {
          label:
            voice === "active"
              ? "Voice on"
              : voice === "muted"
                ? "Voice muted"
                : voice === "off"
                  ? "Voice off"
                  : "Voice ?",
          icon: "voice",
          color:
            voice === "active"
              ? C.green
              : ["muted", "off"].includes(voice)
                ? C.red
                : C.muted,
        },
        {
          label: dictating ? "Stop mic" : "Dictate",
          icon: "dictate",
          color: dictating ? C.green : C.red,
        },
      ];
    else if (column === 1) buttons = contextButtons(pair);
    else if (page === "more")
      buttons = [
        {
          label: fast === true ? "Fast on" : fast === false ? "Fast" : "Fast ?",
          icon: "fast",
          color: fast === true ? C.green : C.white,
        },
        {
          label: plan === true ? "Plan on" : plan === false ? "Plan" : "Plan ?",
          icon: "plan",
          color: plan === true ? C.green : C.white,
        },
      ];
    else if (voiceAudio?.active)
      buttons = ["mic", "sound"].map((kind) => {
        const control = voiceAudio.ok
            ? voiceAudio.controls?.find((c) => c.kind === kind && c.enabled)
            : undefined,
          on = control?.on,
          known = typeof on === "boolean";
        return {
          label:
            kind === "mic"
              ? known
                ? on
                  ? "Mic on"
                  : "Mic muted"
                : "Mic ?"
              : known
                ? on
                  ? "Sound on"
                  : "Muted"
                : "Sound ?",
          icon:
            kind === "mic"
              ? "mic"
              : on === false
                ? "speaker-sound-wave-2-slash-light-16"
                : "speaker-sound-wave-2-light-16",
          color: known ? (on ? C.green : C.red) : C.muted,
          slash: kind === "mic" && on === false,
          frame: true,
        };
      });
    else
      buttons = [
        {
          label: "Quick chat",
          icon: "quick",
          color: voiceAudio?.ok ? C.white : C.muted,
        },
        {
          label: "New task",
          icon: "new",
          color: voiceAudio?.ok ? C.white : C.muted,
        },
      ];
    svg += '<path d="M100 33v61" stroke="#30343B"/>';
    buttons.forEach((b, i) => {
      if (b.frame)
        svg += `<rect x="${3 + i * 100}" y="31" width="94" height="65" rx="6" stroke="${b.color}" stroke-width="1.5" fill="none"/>`;
      if (b.icon === "voice" && voice === "active") {
        const h = [
          [8, 18, 28, 16, 10],
          [16, 28, 12, 23, 7],
          [23, 11, 20, 8, 17],
          [12, 21, 8, 27, 14],
        ][phase % 4];
        svg += `<g stroke="${C.green}" stroke-width="2.5" stroke-linecap="round">${h.map((v, j) => `<path d="M${37 + j * 6.5} ${53 - v / 2}v${v}"/>`).join("")}</g>`;
      } else svg += glyph(b.icon, 36 + i * 100, 37, 28, b.color);
      if (b.slash)
        svg += `<path d="M${35 + i * 100} 35l30 32" stroke="#111317" stroke-width="5"/><path d="M${35 + i * 100} 35l30 32" stroke="${b.color}" stroke-width="2"/>`;
      svg += txt(fit(b.label, 15, 92), 50 + i * 100, 87, 15, b.color);
    });
  }
  if (notice)
    svg +=
      `<rect x="3" y="30" width="194" height="67" fill="#111317"/>` +
      lines(notice, 17, 185)
        .map((s, i) => txt(s, 100, 58 + i * 23, 17, C.amber))
        .join("");
  return svg + "</svg>";
}
