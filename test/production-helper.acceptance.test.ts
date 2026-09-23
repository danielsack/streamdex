import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const bin = resolve("io.streamdex.plugin.sdPlugin/bin");

describe("production helper boundaries", () => {
  it.each([
    "approval-cycle",
    "--composer-read-fixture",
    "--model-fixture",
    "--log-discovery-fixture",
    "unknown-command",
  ])("rejects %s before accessing Codex or Accessibility", (command) => {
    const result = spawnSync(resolve(bin, "codex-ui-control"), [command], {
      encoding: "utf8",
      timeout: 2000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      reasonCode: "UNAVAILABLE",
      message: "Unsupported command.",
    });
  });
  it("rejects unsupported task-helper commands before resolving a target", () => {
    const result = spawnSync(
      resolve(bin, "travel-ui-control"),
      ["approval-cycle", "current"],
      { encoding: "utf8", timeout: 2000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      reason: "unsupported-command",
    });
  });
  it.each(["codex-ui-control", "travel-ui-control"])(
    "ships %s without fixture handlers or permission mutation code",
    (name) => {
      const binary = readFileSync(resolve(bin, name)).toString("utf8");
      for (const marker of [
        "runFixtureAction",
        "--composer-read-fixture",
        "gpt-fixture-terra",
        "applyApprovalMode",
        "offeredApprovalModes",
      ]) {
        expect(binary).not.toContain(marker);
      }
    },
  );
});
