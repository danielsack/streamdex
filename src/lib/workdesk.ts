import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
export const run = promisify(execFile);
export const stateDirectory =
  process.env["STREAMDEX_STATE_DIR"] ||
  join(homedir(), "Library", "Application Support", "Streamdex");
export function configuredLights(): string[] {
  try {
    const config = JSON.parse(
      readFileSync(join(stateDirectory, "config.json"), "utf8"),
    );
    if (
      !Array.isArray(config.lights) ||
      config.lights.length > 2 ||
      !config.lights.every(
        (v: unknown) =>
          typeof v === "string" && /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(v),
      )
    )
      return [];
    return config.lights;
  } catch {
    return [];
  }
}
export const LIGHTS = configuredLights();
export const atWork = (): boolean => true;
export const detectWork = async (): Promise<boolean> => true;
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
export async function lightRequest(
  index: number,
  update?: Record<string, number>,
): Promise<{ on: number; brightness: number; temperature: number }> {
  const host = LIGHTS[index];
  if (!host) throw new Error("No light configured");
  const response = await fetch(`http://${host}:9123/elgato/lights`, {
    method: update ? "PUT" : "GET",
    ...(update
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numberOfLights: 1, lights: [update] }),
        }
      : {}),
    signal: AbortSignal.timeout(1800),
  });
  if (!response.ok) throw new Error("Light unavailable");
  const data = (await response.json()) as {
    lights?: { on: number; brightness: number; temperature: number }[];
  };
  const light = data.lights?.[0];
  if (
    !light ||
    ![light.on, light.brightness, light.temperature].every(Number.isFinite)
  )
    throw new Error("Invalid light state");
  return light;
}
