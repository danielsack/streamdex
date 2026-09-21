import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const uuid = "io.streamdex.plugin";
test("profiles have eight tasks, distinct pages and no personal device bindings or deferred integrations", () => {
  for (const kind of ["plus", "mobile"]) {
    const root = "profile-src/streamdex-" + kind,
      m = JSON.parse(readFileSync(join(root, "manifest.json"))),
      pages = readdirSync(join(root, "Profiles")).map((id) =>
        JSON.parse(readFileSync(join(root, "Profiles", id, "manifest.json"))),
      );
    assert.equal(m.Device.UUID, "");
    assert.equal(m.InstalledByPluginUUID, uuid);
    assert.equal(new Set(m.Pages.Pages).size, kind === "plus" ? 2 : 1);
    const tasks = pages.find((p) => p.Name === "Tasks");
    assert.equal(
      Object.values(tasks.Controllers[0].Actions).filter((a) => a.Settings.slot)
        .length,
      8,
    );
    for (const p of pages)
      for (const c of p.Controllers)
        for (const a of Object.values(c.Actions ?? {})) {
          assert.ok(
            a.UUID.startsWith(uuid) ||
              [
                "com.elgato.streamdeck.profile.openchild",
                "com.elgato.streamdeck.profile.backtoparent",
              ].includes(a.UUID),
          );
          assert.equal(a.Settings.travelSpotify, undefined);
          assert.equal(a.Settings.meetingControl, undefined);
        }
  }
});
test("Mobile reserves dynamic Voice slots and keeps Fast/Plan on More", () => {
  const root = "profile-src/streamdex-mobile/Profiles",
    pages = readdirSync(root).map((id) =>
      JSON.parse(readFileSync(join(root, id, "manifest.json"))),
    ),
    tasks = pages.find((p) => p.Name === "Tasks").Controllers[0].Actions,
    more = pages.find((p) => p.Name === "More").Controllers[0].Actions;
  assert.equal(tasks["2,2"].Settings.travelVoiceControl, "mic");
  assert.equal(tasks["3,2"].Settings.travelVoiceControl, "sound");
  assert.ok(
    Object.values(more).some((a) => a.Settings.travelUtility === "fast"),
  );
  assert.ok(
    Object.values(more).some((a) => a.Settings.travelUtility === "plan"),
  );
});
