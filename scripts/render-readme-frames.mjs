// Original README illustrations built from the shipped button renderers.
// Run with Node 24; optional first argument selects the frame-output directory.
// Rasterize the SVG frames in a browser, then encode as finite GIFs (no loop extension).
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { taskSvg, utilitySvg } from "../src/custom/travel-visuals.mjs";
import { voiceSvg } from "../src/custom/travel-voice.mjs";
const out = resolve(process.argv[2] || ".build/readme-frames");
mkdirSync(out, { recursive: true });
const C = {
  bg: "#101113",
  panel: "#191B1F",
  white: "#F4F4F1",
  muted: "#A7ADB7",
  green: "#69E4A6",
  red: "#F47F8C",
  amber: "#F1C56D",
  blue: "#58BFFF",
};
const escape = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const text = (
  s,
  x,
  y,
  size = 22,
  color = C.white,
  weight = 400,
  anchor = "start",
) =>
  `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}">${escape(s)}</text>`;
function begin(h, tag, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${h}" viewBox="0 0 720 ${h}"><rect width="720" height="${h}" fill="${C.bg}"/><rect x=".5" y=".5" width="719" height="${h - 1}" rx="20" fill="none" stroke="#30343A"/>${text(tag, 32, 34, 13, C.green, 700)}${text(title, 32, 73, 28, C.white, 600)}`;
}
const place = (svg, x, y, size) =>
  svg.replace(
    'width="144" height="144"',
    `x="${x}" y="${y}" width="${size}" height="${size}"`,
  );
const frames = [];
function save(name, svg, duration) {
  writeFileSync(join(out, name + ".svg"), svg);
  frames.push({ name, duration });
}
for (let i = 0; i < 32; i++) {
  const states = [
    ["Build brief", "Research", "running"],
    ["Confirm scope", "Research", "needs-input"],
    ["Check access", "Research", "error"],
  ];
  let s = begin(374, "TASK STATUS", "Know which task needs you.");
  states.forEach(([title, projectName, status], n) => {
    s += place(
      taskSvg({ title, projectName, status }, n + 1, i * 125),
      38 + n * 226,
      99,
      192,
    );
    s += text(
      ["Working", "Your input", "Needs attention"][n],
      134 + n * 226,
      319,
      19,
      C.muted,
      400,
      "middle",
    );
  });
  s += `<circle cx="43" cy="351" r="5" fill="${C.green}"/>${text("READY · response waiting", 57, 357, 17, C.green)}<circle cx="384" cy="351" r="5" fill="#929292"/>${text("SEEN · response opened", 398, 357, 17, "#B4B4B4")}</svg>`;
  save(
    "status-" + String(i).padStart(2, "0"),
    s,
    i === 31 ? 1000 : i % 2 ? 130 : 120,
  );
}
const voiceSteps = [
  {
    active: false,
    mic: true,
    speaker: true,
    label: "Voice off. Quick chat and New task are ready.",
  },
  {
    active: true,
    mic: true,
    speaker: true,
    label: "Voice on. Mic and agent sound are enabled.",
  },
  {
    active: true,
    mic: false,
    speaker: true,
    label: "Mute the mic. Keep hearing the agent.",
  },
  {
    active: true,
    mic: false,
    speaker: false,
    label: "Mute agent sound independently.",
  },
  {
    active: true,
    mic: true,
    speaker: false,
    label: "Restore the mic. Agent sound stays muted.",
  },
  {
    active: false,
    mic: true,
    speaker: true,
    label: "End Voice. Your shortcuts return.",
  },
];
voiceSteps.forEach((step, n) => {
  for (let f = 0; f < 12; f++) {
    const state = {
      ok: true,
      active: step.active,
      controls: [
        { kind: "mic", on: step.mic, enabled: true },
        { kind: "speaker", on: step.speaker, enabled: true },
      ],
    };
    let s = begin(408, "LIVE VOICE", "Your mic. The agent’s sound. Separate.");
    s += place(
      utilitySvg("voice", {
        voice: step.active ? "active" : "off",
        phase: f % 4,
      }),
      38,
      108,
      170,
    );
    s += `<path d="M229 189h25m-8-7 8 7-8 7" fill="none" stroke="#777E89" stroke-width="2.5" stroke-linecap="round"/>`;
    s +=
      place(voiceSvg("mic", state), 280, 108, 170) +
      place(voiceSvg("speaker", state), 486, 108, 170);
    s += text(step.label, 32, 319, 22, C.white, 400);
    s += text(
      "Mobile keys shown; the same controls live on the Plus touch strip.",
      32,
      351,
      16,
      C.muted,
    );
    for (let k = 0; k < voiceSteps.length; k++)
      s += `<rect x="${32 + k * 110}" y="380" width="98" height="3" rx="1.5" fill="${k === n ? C.green : "#363B41"}"/>`;
    save(
      "voice-" + String(n * 12 + f).padStart(2, "0"),
      s + "</svg>",
      n === 5 && f === 11 ? 1200 : f % 2 ? 130 : 120,
    );
  }
});
function dial(cx, cy, num, active = true) {
  const color = active ? C.green : "#777D87";
  return `<g><circle cx="${cx}" cy="${cy}" r="34" fill="#262B31" stroke="${active ? "#63706F" : "#424851"}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="26" fill="#181C21"/><path d="M${cx} ${cy - 27}v8" stroke="${color}" stroke-width="3" stroke-linecap="round"/>${text(num, cx, cy + 7, 19, color, 600, "middle")}</g>`;
}
let s = begin(
  615,
  "STREAM DECK+ DIALS",
  "Turn to preview or adjust. Press to act.",
);
s += text("NO LIGHTS", 32, 119, 14, C.muted, 700);
const rows = [
  {
    y: 171,
    names: ["Unassigned", "Unassigned", "Reasoning", "Mac volume"],
    turn: ["", "", "Preview level", "Adjust volume"],
    press: ["", "", "Apply preview", "Mute / unmute"],
    active: [false, false, true, true],
  },
  {
    y: 401,
    names: ["Light 1", "Light 2*", "Temperature", "Mac volume"],
    turn: ["Brightness", "Brightness", "Warmer / cooler", "Adjust volume"],
    press: ["Power", "Power", "No action", "Mute / unmute"],
    active: [true, true, true, true],
  },
];
rows.forEach((row) =>
  row.names.forEach((name, i) => {
    const x = 104 + i * 171;
    s += dial(x, row.y, i + 1, row.active[i]);
    s += text(
      name,
      x,
      row.y + 65,
      22,
      row.active[i] ? C.white : C.muted,
      600,
      "middle",
    );
    if (row.turn[i])
      s += text(row.turn[i], x, row.y + 98, 18, C.muted, 400, "middle");
    if (row.press[i])
      s += text(
        row.press[i],
        x,
        row.y + 123,
        17,
        row.active[i] && row.press[i] !== "No action" ? C.green : C.muted,
        400,
        "middle",
      );
  }),
);
s += `<path d="M32 314h656" stroke="#30343A"/>${text("WITH ONE OR TWO LIGHTS", 32, 349, 14, C.muted, 700)}${text("* Light 2 stays unassigned with a one-light preset.", 32, 572, 17, C.muted)}${text("Offline lights keep their assignments. Green captions describe a press.", 32, 598, 16, C.muted)}</svg>`;
save("dials", s, 0);
writeFileSync(join(out, "frames.json"), JSON.stringify(frames, null, 2) + "\n");
console.log(
  `Created ${frames.length} original SVG frames in the selected output directory.`,
);
