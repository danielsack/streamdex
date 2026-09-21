// Explicit SVG frames for Stream Deck's native renderer (no CSS or SVG animation).
export const MOTION_INTERVAL_MS = 125;
export const motionStatus = (status) =>
  ["running", "thinking", "needs-input", "error"].includes(status);
const radius = 10,
  side = 116,
  arc = (Math.PI * radius) / 2,
  perimeter = 4 * (side + arc);
const fmt = (n) => Number(n.toFixed(2));
function point(distance) {
  let d = ((distance % perimeter) + perimeter) % perimeter;
  for (let sideIndex = 0; sideIndex < 4; sideIndex++) {
    if (d < side) {
      const p = [
        [14 + d, 4],
        [140, 14 + d],
        [130 - d, 140],
        [4, 130 - d],
      ][sideIndex];
      return p.map(fmt);
    }
    d -= side;
    if (d < arc) {
      const a = -Math.PI / 2 + (sideIndex * Math.PI) / 2 + d / radius,
        center = [
          [130, 14],
          [130, 130],
          [14, 130],
          [14, 14],
        ][sideIndex];
      return [
        fmt(center[0] + radius * Math.cos(a)),
        fmt(center[1] + radius * Math.sin(a)),
      ];
    }
    d -= arc;
  }
  return [14, 4];
}
function segment(start, length) {
  const count = Math.max(2, Math.ceil(length / 4));
  return Array.from({ length: count + 1 }, (_, i) => {
    const [x, y] = point(start + (length * i) / count);
    return `${i ? "L" : "M"}${x} ${y}`;
  }).join("");
}
export function taskBorder(status, color, time = 0) {
  const t = Math.floor(time / MOTION_INTERVAL_MS) * MOTION_INTERVAL_MS;
  const running = ["running", "thinking"].includes(status),
    attention = ["needs-input", "error"].includes(status);
  const pulse = (1 - Math.cos((2 * Math.PI * (t % 2000)) / 2000)) / 2;
  const opacity = attention
    ? 0.72 + 0.28 * pulse
    : running
      ? 0.42
      : status === "read"
        ? 0.65
        : 1;
  const width = attention ? 4 + 2 * pulse : status === "read" ? 2 : 3;
  let svg = `<rect x="4" y="4" width="136" height="136" rx="10" fill="none" stroke="${color}" stroke-width="${fmt(width)}" opacity="${fmt(opacity)}"${status === "offline" ? ' stroke-dasharray="8 6"' : ""}/>`;
  if (running) {
    const head = ((t % 4000) / 4000) * perimeter;
    for (const [length, alpha, width] of [
      [118, 0.28, 3.4],
      [76, 0.48, 3.6],
      [36, 0.8, 3.8],
    ])
      svg += `<path d="${segment(head - length, length)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${alpha}"/>`;
    const [x, y] = point(head);
    svg += `<circle cx="${x}" cy="${y}" r="2.15" fill="${color}"/>`;
  }
  return svg;
}
export function runningGlyph(color, time = 0) {
  const step = Math.floor(time / 250) % 8;
  return (
    `<g stroke="${color}" stroke-width="1.8" stroke-linecap="round">` +
    Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4 - Math.PI / 2,
        tail = (step - i + 8) % 8,
        opacity = [1, 0.82, 0.64, 0.48, 0.33, 0.22, 0.16, 0.12][tail];
      return `<path d="M${fmt(76 + 4 * Math.cos(a))} ${fmt(22 + 4 * Math.sin(a))}L${fmt(76 + 6.5 * Math.cos(a))} ${fmt(22 + 6.5 * Math.sin(a))}" opacity="${opacity}"/>`;
    }).join("") +
    "</g>"
  );
}
