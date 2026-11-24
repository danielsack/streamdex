import { createSqliteStateReader } from "./codex-global-state.mjs";
import { openSync, readSync, closeSync, statSync } from "node:fs";
import { projectAccountState } from "./codex-account-state.mjs";
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
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 256;
// Read only the active identity's exact adopted local host. Never merge accounts
// or choose the first local host; a missing binding leaves the ledger unchanged.
export function localUnread(state) {
  if (!object(state)) return;
  const s = state["electron-thread-read-state-v1"];
  if (s?.version !== 1 || !object(s.unreadByIdentity)) return;
  const m = s.legacyMigration;
  let identity = projectAccountState(state)?.readIdentity;
  if (
    Object.hasOwn(state, "electron-renderer-content-owner") ||
    Object.hasOwn(state, "electron-account-renderer-state-v1")
  ) {
    if (!identity) return;
  } else {
    // Compatibility for older, single-identity state without an owner marker.
    const identities = Object.keys(s.unreadByIdentity);
    if (
      identities.length !== 1 ||
      m?.identityKey !== identities[0] ||
      m?.cleared === true
    )
      return;
    identity = identities[0];
  }
  const host = m?.adoptedHostIds?.local;
  if (!text(host) || !host.startsWith("local:")) return;
  const ids = s.unreadByIdentity[identity]?.[host];
  if (!Array.isArray(ids) || ids.some((id) => !text(id))) return;
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
  const sqliteState = createSqliteStateReader(path);
  let next = 0,
    unread,
    modifiedAt = 0,
    cached;
  return (task) => {
    if (path && now() >= next) {
      next = now() + 1000;
      try {
        const snapshot = sqliteState();
        if (snapshot) {
          unread = localUnread(snapshot.state);
          modifiedAt = snapshot.modifiedAt;
          cached = undefined;
        } else {
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
