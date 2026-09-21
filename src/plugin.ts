import streamDeck from "@elgato/streamdeck";
import { chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { WorkdeskAction } from "./actions/workdesk.js";
import { AgentStatusAction } from "./actions/agent-status.js";
import { CommandAction } from "./actions/command.js";
import { codexStore } from "./lib/codex-store.js";
import { renderKey, renderFeedback } from "./lib/render-cache.js";
import { svgDataUrl } from "./lib/visuals.js";
import {
  openThread,
  openNewChat,
  executeCommand,
  startDictation,
  endDictation,
  applyReasoning,
} from "./lib/automation.js";
import { runWorkdeskGlobal } from "./lib/codex-ui-control.js";
import { COMMANDS } from "./lib/commands.js";
import { LIGHTS, lightRequest, stateDirectory } from "./lib/workdesk.js";
import { reasoningPickerLabel, stepReasoning } from "./lib/reasoning.js";
import { createRefreshCoordinator } from "./lib/refresh-coordinator.js";
import { installTravelPilot } from "./custom/travel-pilot.mjs";
import { installTravelVoice } from "./custom/travel-voice.mjs";
import { installTravelMore } from "./custom/travel-more.mjs";
import { installPlusV2 } from "./custom/plus-v2.mjs";
import { createReasoningController } from "./custom/reasoning-control.mjs";
for (const name of ["codex-ui-control", "travel-ui-control", "voice-control"])
  chmodSync(fileURLToPath(new URL("./" + name, import.meta.url)), 0o755);
const workdesk = new WorkdeskAction(),
  agentStatus = new AgentStatusAction(),
  command = new CommandAction();
streamDeck.logger.setLevel("warn");
const common = {
  workdesk,
  store: codexStore,
  renderKey,
  renderFeedback,
  svgDataUrl,
  openThread,
  openNewChat,
  executeCommand,
  runWorkdeskGlobal,
  startDictation,
  endDictation,
  commands: COMMANDS,
  logger: streamDeck.logger,
};
const travelPilot = installTravelPilot({
  ...common,
  agentStatus,
  commandHandler: command,
  readStatePath: join(stateDirectory, "read.json"),
  settingsTargets: {},
});
const travelVoice = installTravelVoice({ ...common, travelPilot });
const travelMore = installTravelMore(common);
const reasoning = createReasoningController({
  snapshot: () => codexStore.reasoningSnapshot(),
  apply: applyReasoning,
  label: reasoningPickerLabel,
  step: stepReasoning,
});
const plus = installPlusV2({
  ...common,
  travelPilot,
  travelVoice,
  profiles: streamDeck.profiles,
  lightRequest,
  lightCount: LIGHTS.length,
  reasoning,
});
for (const action of [workdesk, agentStatus, command])
  streamDeck.actions.registerAction(action);
const refresh = createRefreshCoordinator(
  async () => {
    await codexStore.refreshLiveComposer();
    await Promise.all([
      agentStatus.refreshAll(),
      travelPilot.poll(),
      travelVoice.poll(),
    ]);
  },
  1500,
  () => streamDeck.logger.warn("Codex observation unavailable"),
);
process.once("exit", () => {
  refresh.stop();
  plus.stop();
  travelPilot.stop();
  travelVoice.stop();
  travelMore.stop();
  codexStore.close();
});
await streamDeck.connect();
streamDeck.settings.useExperimentalMessageIdentifiers = true;
travelPilot.start();
refresh.start();
await refresh.runNow();
