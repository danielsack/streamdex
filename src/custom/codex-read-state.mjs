import { openSync, readSync, closeSync, statSync } from "node:fs";
export const MAX_STATE_BYTES = 8 * 1024 * 1024;
function boundedRead(path) {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(MAX_STATE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const n = readSync(fd, buffer, length, buffer.length - length, null);
      if (!n) break;
      length += n;
    }
    if (length > MAX_STATE_BYTES) throw Error("State exceeds read budget");
    return buffer.toString("utf8", 0, length);
  } finally {
    closeSync(fd);
  }
}
const fingerprint = (s) =>
  [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs].join(":");
// Only a single migrated identity with an explicit local-host binding is known.
// Missing/malformed/multi-account state is not evidence of a read task.
export function localUnread(state) {
  const s = state?.["electron-thread-read-state-v1"];
  if (
    s?.version !== 1 ||
    !s.unreadByIdentity ||
    typeof s.unreadByIdentity !== "object"
  )
    return;
  const identities = Object.keys(s.unreadByIdentity),
    m = s.legacyMigration;
  if (identities.length !== 1 || m?.identityKey !== identities[0]) return;
  const host = m?.adoptedHostIds?.local;
  if (typeof host !== "string" || !host.startsWith("local:")) return;
  const ids = s.unreadByIdentity[identities[0]]?.[host];
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) return;
  return new Set(ids);
}
export function projectRead(task, unread, modifiedAt, now = Date.now()) {
  if (!task || !unread || !["read", "unread"].includes(task.status))
    return task;
  const at = task.completedAt;
  // Do not hide a new completion that the app has not persisted yet.
  if (!Number.isFinite(at) || at <= 0 || at > modifiedAt || now - at < 3000)
    return task;
  return { ...task, status: unread.has(task.id) ? "unread" : "read" };
}
export function createCodexReadResolver(
  path,
  { now = Date.now, read = boundedRead, stat = statSync } = {},
) {
  let next = 0,
    unread,
    modifiedAt = 0,
    cached;
  return (task) => {
    if (path && now() >= next) {
      next = now() + 1000;
      try {
        const before = stat(path),
          key = fingerprint(before);
        if (
          !Number.isFinite(before.size) ||
          before.size < 0 ||
          before.size > MAX_STATE_BYTES
        )
          throw Error("State exceeds read budget");
        if (key !== cached) {
          const text = read(path, "utf8");
          if (Buffer.byteLength(text, "utf8") > MAX_STATE_BYTES)
            throw Error("State exceeds read budget");
          const state = JSON.parse(text),
            after = stat(path);
          if (key !== fingerprint(after)) throw Error("Changed during read");
          unread = localUnread(state);
          modifiedAt = after.mtimeMs;
          cached = key;
        }
      } catch {
        unread = undefined;
        modifiedAt = 0;
        cached = undefined;
      }
    }
    return projectRead(task, unread, modifiedAt, now());
  };
}
