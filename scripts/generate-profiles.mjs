import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  UUID = "io.streamdex.plugin";
const id = (name) => {
  const h = createHash("sha256")
    .update("streamdex:v1:" + name)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const write = (p, v) => {
  mkdirSync(resolve(p, ".."), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
};
function action(name, settings = {}, kind = "workdesk", image = "") {
  return {
    ActionID: id(name + JSON.stringify(settings)),
    LinkedTitle: false,
    Name: name,
    Plugin: { Name: "Streamdex", UUID, Version: "0.1.0.1" },
    Resources: null,
    Settings: settings,
    State: 0,
    States: [{ Image: image, ShowTitle: false }],
    UUID: UUID + "." + kind,
  };
}
function utility(name, kind) {
  return action(name, { travelPilot: true, travelUtility: kind });
}
const image = (label, back = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"><rect width="144" height="144" rx="12" fill="#191b1f"/><rect x="4" y="4" width="136" height="136" rx="10" fill="none" stroke="#8bc9f4" stroke-width="3"/><path d="${back ? "M98 50H46m20-20L46 50l20 20" : "M46 50h52M78 30l20 20-20 20"}" fill="none" stroke="#8bc9f4" stroke-width="5" stroke-linecap="round"/><text x="72" y="114" text-anchor="middle" fill="#8bc9f4" font-family="Arial" font-weight="700" font-size="24">${label}</text></svg>`;
for (const kind of ["plus", "mobile"]) {
  const name = "streamdex-" + kind,
    base = join(root, "profile-src", name),
    home = id(name + ":tasks"),
    more = id(name + ":more"),
    empty = id(name + ":default");
  const model = kind === "plus" ? "20GBD9901" : "20GAI9901";
  write(join(base, "manifest.json"), {
    Device: { Model: model, UUID: "" },
    InstalledByPluginUUID: UUID,
    Name: kind === "plus" ? "Streamdex+" : "Streamdex Mobile",
    Pages: {
      Current: home,
      Default: empty,
      Pages: kind === "plus" ? [home, more] : [home],
    },
    PreconfiguredName: name,
    ReadOnly: false,
    Version: "3.0",
  });
  write(join(base, "Profiles", empty, "manifest.json"), {
    Controllers: [{ Type: "Keypad", Actions: {} }],
    Name: "Default",
    Icon: "",
  });
  for (const page of ["tasks", "more"]) {
    const pageId = page === "tasks" ? home : more,
      actions = {},
      controllers = [{ Type: "Keypad", Actions: actions }];
    if (page === "tasks") {
      for (let i = 0; i < 8; i++)
        actions[`${i % 4},${Math.floor(i / 4)}`] = action(
          "Task " + (i + 1),
          { travelPilot: true, slot: i + 1 },
          "agent-status",
        );
      if (kind === "mobile") {
        actions["4,0"] = utility("Voice", "voice");
        actions["4,1"] = utility("Hold to dictate", "dictate");
        actions["0,2"] = action("Context left", {
          travelPilot: true,
          travelRole: "left",
        });
        actions["1,2"] = action("Context right", {
          travelPilot: true,
          travelRole: "right",
        });
        actions["2,2"] = action("Quick chat / Voice mic", {
          travelVoiceControl: "mic",
        });
        actions["3,2"] = action("New task / Voice sound", {
          travelVoiceControl: "sound",
        });
      }
    } else {
      actions["0,0"] = utility("Voice", "voice");
      actions["1,0"] = utility("Hold to dictate", "dictate");
      actions["2,0"] = utility("Fast", "fast");
      actions["3,0"] = utility("Plan", "plan");
      actions["0,1"] = action("Quick chat", {
        travelMore: true,
        mobileCommand: "quick-chat",
      });
      actions["1,1"] = action("New task", {
        travelMore: true,
        mobileCommand: "new-chat",
      });
      actions["2,1"] = action("Volume down", {
        travelMore: true,
        mobileCommand: "volume-down",
      });
      actions["3,1"] = action("Volume up", {
        travelMore: true,
        mobileCommand: "volume-up",
      });
      if (kind === "mobile")
        actions["4,1"] = action("Mute system sound", {
          travelMore: true,
          mobileCommand: "mute",
        });
    }
    if (kind === "plus")
      controllers.push({
        Type: "Encoder",
        Actions: Object.fromEntries(
          Array.from({ length: 4 }, (_, column) => {
            const a = action("Dial " + (column + 1), {
              plusV2: true,
              plusPage: page,
              column,
            });
            a.Encoder = { layout: "$A0" };
            return [`${column},0`, a];
          }),
        ),
      });
    else {
      const back = page === "more",
        a = action(
          back ? "Tasks" : "More",
          { ProfileUUID: back ? home : more },
          "workdesk",
          "Images/navigation.svg",
        );
      a.UUID = back
        ? "com.elgato.streamdeck.profile.backtoparent"
        : "com.elgato.streamdeck.profile.openchild";
      if (back) a.Settings = {};
      a.Plugin = { Name: "Navigation", UUID: a.UUID, Version: "1.0" };
      actions["4,2"] = a;
      const dir = join(base, "Profiles", pageId, "Images");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "navigation.svg"),
        image(back ? "Tasks" : "More", back),
      );
    }
    write(join(base, "Profiles", pageId, "manifest.json"), {
      Controllers: controllers,
      Name: page === "tasks" ? "Tasks" : "More",
      Icon: "",
    });
  }
}
