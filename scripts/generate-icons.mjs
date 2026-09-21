import { readFileSync, writeFileSync } from "node:fs";
const map = {
  "voice-regular-20": "audio-lines",
  "microphone-light-20": "mic",
  "bolt-light-20": "zap",
  "bolt-fill-light-16": "zap",
  "checkmark-circle-list-light-16": "list-checks",
  "ellipsis-horizontal-light-20": "ellipsis",
  "plus-chat-bubble-light-20": "message-circle-plus",
  "square-and-pencil-light-20": "square-pen",
  "speaker-sound-wave-2-light-16": "volume-2",
  "speaker-sound-wave-2-slash-light-16": "volume-x",
};
const icons = Object.fromEntries(
  Object.entries(map).map(([key, name]) => {
    const svg = readFileSync(
      "node_modules/lucide-static/icons/" + name + ".svg",
      "utf8",
    );
    const body = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
    return [
      key,
      {
        viewBox: "0 0 24 24",
        body:
          '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
          body +
          "</g>",
      },
    ];
  }),
);
writeFileSync("src/custom/icons.json", JSON.stringify(icons, null, 2) + "\n");
