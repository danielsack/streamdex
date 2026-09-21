import {
  action,
  SingletonAction,
  type KeyUpEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { run } from "../lib/workdesk.js";
import { runWorkdeskGlobal } from "../lib/codex-ui-control.js";
@action({ UUID: "io.streamdex.plugin.workdesk" })
export class WorkdeskAction extends SingletonAction<{
  mobileCommand?: string;
}> {
  async onWillAppear(
    _event: WillAppearEvent<{ mobileCommand?: string }>,
  ): Promise<void> {}
  async onKeyUp(event: KeyUpEvent<{ mobileCommand?: string }>): Promise<void> {
    const command = event.payload.settings.mobileCommand;
    try {
      if (command === "quick-chat" || command === "new-chat")
        await runWorkdeskGlobal(command);
      else if (command === "volume-up" || command === "volume-down")
        await run(
          "/usr/bin/osascript",
          [
            "-e",
            `set volume output volume (output volume of (get volume settings) ${command === "volume-up" ? "+" : "-"} 5)`,
          ],
          { timeout: 3000 },
        );
      else if (command === "mute")
        await run(
          "/usr/bin/osascript",
          [
            "-e",
            "set volume output muted (not (output muted of (get volume settings)))",
          ],
          { timeout: 3000 },
        );
    } catch {
      await event.action.showAlert();
    }
  }
  async refreshAll(): Promise<void> {}
}
