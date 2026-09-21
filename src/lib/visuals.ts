import type {
  AgentSnapshot,
  AgentStatus,
  ContextSnapshot,
  SessionSnapshot,
  UsageSnapshot,
} from "../types.js";
import { compactContext, type ContextView } from "./context.js";
import { LUCIDE_PATHS } from "./lucide-paths.js";

export const STATUS_COLOR: Record<AgentStatus, string> = {
  off: "#000000",
  idle: "#FFFFFF",
  unread: "#9BF396",
  read: "#929292",
  thinking: "#9CD5FE",
  running: "#9CD5FE",
  "needs-input": "#FFD0B8",
  error: "#FF7373",
};

const NEEDS_INPUT_OUTLINE = "#9A5B45";
const NEEDS_INPUT_TEXT = "#E7A589";
const PRIMARY_LABEL_SIZE = 16;
const WRAPPED_LABEL_SIZE = 15;
const SECONDARY_LABEL_SIZE = 10;

export const STATUS_LABEL: Record<AgentStatus, string> = {
  off: "Empty slot",
  idle: "Idle",
  unread: "Unread",
  read: "Seen",
  thinking: "Thinking",
  running: "Running",
  "needs-input": "Needs input",
  error: "Error",
};

const STATUS_ICON: Record<AgentStatus, string> = {
  off: "status-off",
  idle: "status-idle",
  unread: "status-unread",
  read: "status-idle",
  thinking: "status-thinking",
  running: "status-running",
  "needs-input": "status-needs-input",
  error: "status-error",
};

function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[character]!,
  );
}

function titleLines(title: string): [string, string] {
  const words = title.replace(/\s+/g, " ").trim().split(" ");
  let first = "";
  let second = "";
  let fillingSecond = false;
  for (const word of words) {
    if (!fillingSecond) {
      const candidate = `${first} ${word}`.trim();
      if (candidate.length <= 12) {
        first = candidate;
        continue;
      }
      fillingSecond = true;
    }
    const candidate = `${second} ${word}`.trim();
    if (candidate.length > 12) break;
    second = candidate;
  }
  return [first || "Codex", second];
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

export function agentKeySvg(
  snapshot?: AgentSnapshot | SessionSnapshot,
  slot = 0,
): string {
  const status = snapshot?.status ?? "off";
  const color = STATUS_COLOR[status];
  const label = snapshot
    ? "sessionLabel" in snapshot
      ? snapshot.sessionLabel
      : snapshot.displayTitle
    : "New chat";
  const isActive =
    snapshot && "isActive" in snapshot ? snapshot.isActive : false;
  const pulse = status === "thinking" || status === "running";
  const accent = isActive
    ? "#FFFFFF"
    : status === "off"
      ? "#30363D"
      : status === "needs-input"
        ? NEEDS_INPUT_OUTLINE
        : color;
  const glyphColor = status === "off" ? "#626C7A" : color;
  const statusText =
    status === "off"
      ? "#6C7480"
      : status === "needs-input"
        ? NEEDS_INPUT_TEXT
        : color;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#090B0F"/>
    <rect x="18" y="14" width="108" height="3" rx="1.5" fill="${accent}"${pulse ? ' opacity=".9"' : ""}/>
    ${isActive ? '<text x="18" y="31" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="12" font-weight="800" letter-spacing=".6">NOW</text>' : ""}
    ${commandIcon(STATUS_ICON[status], glyphColor, 30, 2.7)}
    <text x="72" y="114" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="18" font-weight="800">${escapeXml(label)}</text>
    <text x="72" y="130" text-anchor="middle" fill="${statusText}" font-family="-apple-system,system-ui,sans-serif" font-size="12" font-weight="750" letter-spacing=".35">${escapeXml(STATUS_LABEL[status].toUpperCase())}</text>
    ${isActive ? "" : `<text x="126" y="31" text-anchor="end" fill="#7E8795" font-family="monospace" font-size="12">${slot + 1}</text>`}
  </svg>`;
}

function commandIcon(
  icon: string,
  accent: string,
  top = 16,
  scale = 3,
  filled = false,
): string {
  const lucide = LUCIDE_PATHS[icon] ?? LUCIDE_PATHS.command;
  if (!lucide) throw new Error(`Missing Lucide icon mapping: ${icon}`);
  const normalizedScale = Number(scale.toFixed(2));
  const normalizedTop = Number(top.toFixed(2));
  const left = Number(((144 - 24 * normalizedScale) / 2).toFixed(2));
  return `<g transform="translate(${left} ${normalizedTop}) scale(${normalizedScale})" fill="${filled ? accent : "none"}" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${lucide}</g>`;
}

export function commandKeySvg(
  label: string,
  accent = "#2F81F7",
  icon = "command",
  modeState?: "ACTIVE" | "OFF",
): string {
  const [first, second] = titleLines(label);
  const stateMarkup = modeState
    ? `<rect x="41" y="14" width="62" height="20" rx="10" fill="${modeState === "ACTIVE" ? "#35C759" : "#6C7480"}"/>
       <text x="72" y="28" text-anchor="middle" fill="#0B0D10" font-family="-apple-system,system-ui,sans-serif" font-size="11" font-weight="800">${modeState}</text>`
    : "";
  const glyph =
    icon === "compact"
      ? `<circle cx="72" cy="56" r="34" fill="${accent}"/>
         ${commandIcon(icon, "#090B0F", 26, 2.55)}`
      : commandIcon(
          icon,
          accent,
          modeState ? 39 : 18,
          modeState ? 2.55 : 3.15,
          icon === "fast" && modeState === "ACTIVE",
        );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#090B0F"/>
    ${stateMarkup}
    ${glyph}
    <text x="72" y="${second ? 116 : 122}" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="${second ? WRAPPED_LABEL_SIZE : PRIMARY_LABEL_SIZE}" font-weight="750">${escapeXml(first)}</text>
    ${second ? `<text x="72" y="133" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="${WRAPPED_LABEL_SIZE}" font-weight="750">${escapeXml(second)}</text>` : ""}
  </svg>`;
}

export function usageKeySvg(
  snapshot: UsageSnapshot | undefined,
  mode: "weekly" | "resets" = "weekly",
  now = Date.now(),
): string {
  const used = Math.round(snapshot?.usedPercent ?? 0);
  const remaining = Math.max(0, 100 - used);
  const color =
    snapshot === undefined
      ? "#6C7480"
      : used >= 90
        ? "#F85149"
        : used >= 70
          ? "#F4B740"
          : "#35C759";
  const resetMs = snapshot?.resetsAt
    ? Math.max(0, snapshot.resetsAt * 1000 - now)
    : undefined;
  const reset =
    resetMs === undefined
      ? "NO DATA"
      : resetMs >= 24 * 60 * 60 * 1000
        ? `${Math.ceil(resetMs / (24 * 60 * 60 * 1000))}D`
        : `${Math.max(1, Math.ceil(resetMs / (60 * 60 * 1000)))}H`;
  const mainValue =
    mode === "resets"
      ? snapshot?.resetsAvailable === undefined
        ? "NO DATA"
        : String(snapshot.resetsAvailable)
      : snapshot
        ? `${remaining}%`
        : "NO DATA";
  const heading = mode === "resets" ? "RESETS" : "WEEKLY LEFT";
  const footer =
    mode === "resets" ? "AVAILABLE" : snapshot ? `RESET ${reset}` : "";
  const valueSize = snapshot ? 40 : 22;
  const barWidth =
    snapshot && mode === "weekly" ? Math.round(104 * (remaining / 100)) : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#090B0F"/>
    <text x="72" y="34" text-anchor="middle" fill="#B8C0CC" font-family="-apple-system,system-ui,sans-serif" font-size="14" font-weight="750" letter-spacing=".25">${heading}</text>
    <text x="72" y="82" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="${valueSize}" font-weight="800">${mainValue}</text>
    <rect x="20" y="96" width="104" height="8" rx="4" fill="#2B313B"/>
    <rect x="20" y="96" width="${barWidth}" height="8" rx="4" fill="${color}"/>
    <text x="72" y="127" text-anchor="middle" fill="${color}" font-family="-apple-system,system-ui,sans-serif" font-size="11" font-weight="750" letter-spacing=".35">${footer}</text>
  </svg>`;
}

export function contextKeySvg(
  snapshot: ContextSnapshot | undefined,
  mode: ContextView = "remaining",
): string {
  const known = snapshot !== undefined;
  const remaining = snapshot?.remainingPercent ?? 0;
  const used = Math.max(0, 100 - remaining);
  const color = !known
    ? "#6C7480"
    : used >= 90
      ? "#F85149"
      : used >= 70
        ? "#F4B740"
        : "#2F81F7";
  const compact = compactContext(snapshot).split("/");
  const usedValue = compact[0] ?? "--";
  const maxValue = compact[1] ?? "--";
  const barWidth = snapshot ? Math.round(104 * (used / 100)) : 0;
  const valueMarkup = !known
    ? '<text x="72" y="82" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="22" font-weight="800">NO DATA</text>'
    : mode === "exact"
      ? `<text x="72" y="65" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="24" font-weight="800">${usedValue} <tspan fill="#9DA5B2" font-size="10" font-weight="700">USED</tspan></text>
         <text x="72" y="88" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="21" font-weight="750">${maxValue} <tspan fill="#9DA5B2" font-size="10" font-weight="700">MAX</tspan></text>`
      : `<text x="72" y="82" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="38" font-weight="800">${remaining}%</text>`;
  const heading = mode === "remaining" && known ? "CONTEXT LEFT" : "CONTEXT";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#090B0F"/>
    <text x="72" y="34" text-anchor="middle" fill="#B8C0CC" font-family="-apple-system,system-ui,sans-serif" font-size="14" font-weight="750" letter-spacing=".25">${heading}</text>
    ${valueMarkup}
    <rect x="20" y="96" width="104" height="8" rx="4" fill="#2B313B"/>
    <rect x="20" y="96" width="${barWidth}" height="8" rx="4" fill="${color}"/>
  </svg>`;
}

export function healthKeySvg(
  component: string,
  value: string,
  healthy: boolean,
): string {
  const color = healthy ? "#35C759" : "#FF7373";
  const display = value.length > 14 ? `${value.slice(0, 13)}…` : value;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#090B0F"/>
    <circle cx="72" cy="52" r="27" fill="none" stroke="${color}" stroke-width="8"/>
    <path d="M55 52h10l6-14 9 29 7-15h10" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="72" y="103" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="15" font-weight="800">${escapeXml(display.toUpperCase())}</text>
    <text x="72" y="124" text-anchor="middle" fill="#8D97A5" font-family="-apple-system,system-ui,sans-serif" font-size="11" font-weight="700">${escapeXml(component.toUpperCase())}</text>
  </svg>`;
}

/** Touch-strip payload for the shared `$B1` and command dial layouts. */
export interface DialFeedback {
  title: string;
  value: string;
  indicator: { value: number; bar_fill_c: string };
}

export function dialFailureFeedback(value: string): DialFeedback {
  return {
    title: "FAILED",
    value,
    indicator: { value: 0, bar_fill_c: "#FF453A" },
  };
}

export function statusIndicator(status: AgentStatus): {
  value: number;
  bar_fill_c: string;
} {
  return {
    value:
      status === "off"
        ? 0
        : status === "idle"
          ? 15
          : status === "thinking"
            ? 45
            : status === "running"
              ? 60
              : status === "unread"
                ? 80
                : 100,
    bar_fill_c: STATUS_COLOR[status],
  };
}
