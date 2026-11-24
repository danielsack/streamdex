import { statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_SELECTED_BYTES = 8 * 1024 * 1024;
const fingerprint = (s) =>
  [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs].join(":");
function optionalStat(path) {
  try {
    const s = statSync(path);
    if (!s.isFile() || s.size > MAX_FILE_BYTES)
      throw Error("Global state exceeds file budget");
    return s;
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
}
function observe(path) {
  const db = optionalStat(path);
  if (!db) return;
  const walStat = optionalStat(path + "-wal");
  // Opening a read-only WAL connection can create an empty sidecar. It carries
  // no committed data and must not advance the completion timestamp guard.
  const wal = walStat?.size ? walStat : undefined;
  return {
    key: fingerprint(db) + "/" + (wal ? fingerprint(wal) : "-"),
    modifiedAt: Math.max(db.mtimeMs, wal?.mtimeMs ?? 0),
  };
}

// Read only the handful of settings the indicators need. No history scans,
// persistent connections, lock waits, writes, or fallback to stale JSON when a
// migrated database exists. Each read uses one consistent SQLite transaction.
export function createSqliteStateReader(jsonPath) {
  const path =
    jsonPath && basename(jsonPath) === ".codex-global-state.json"
      ? join(dirname(jsonPath), ".codex-global-state.sqlite")
      : undefined;
  let cached;
  return () => {
    if (!path) return;
    try {
      const before = observe(path);
      if (!before) {
        cached = undefined;
        return;
      }
      if (cached?.key === before.key) return cached;
      const db = new DatabaseSync(path, { readOnly: true, timeout: 0 });
      let state;
      try {
        db.exec(
          "PRAGMA query_only = ON; PRAGMA trusted_schema = OFF; PRAGMA cache_size = -256; BEGIN",
        );
        if (db.prepare("PRAGMA user_version").get().user_version !== 1)
          throw Error("Unsupported global state version");
        const columns = db.prepare("PRAGMA table_info(settings)").all();
        if (
          columns.length !== 3 ||
          !columns.some((c) => c.name === "scope" && c.pk === 1) ||
          !columns.some((c) => c.name === "key" && c.pk === 2) ||
          !columns.some((c) => c.name === "value")
        )
          throw Error("Unsupported global state schema");
        const query = db.prepare(
          "SELECT CASE WHEN length(CAST(value AS BLOB)) <= ? THEN value END AS value FROM settings WHERE scope = ? AND key = ?",
        );
        let bytes = 0;
        function get(scope, key, limit) {
          const row = query.get(limit, scope, key);
          if (!row) return;
          if (
            typeof row.value !== "string" ||
            (bytes += Buffer.byteLength(row.value)) > MAX_SELECTED_BYTES
          )
            throw Error("Global state exceeds value budget");
          return JSON.parse(row.value);
        }
        state = {};
        const owner = get("global", "electron-renderer-content-owner", 1024);
        const legacy =
          owner === undefined
            ? get("global", "electron-account-renderer-state-v1", 1024)
            : undefined;
        if (owner !== undefined)
          state["electron-renderer-content-owner"] = owner;
        else if (legacy !== undefined)
          state["electron-account-renderer-state-v1"] = legacy;
        state["electron-thread-read-state-v1"] = get(
          "global",
          "electron-thread-read-state-v1",
          4 * 1024 * 1024,
        );
        const current = owner === undefined ? legacy?.owner : owner;
        if (typeof current === "string" && /^[0-9a-f]{64}$/.test(current)) {
          const scope =
            owner === undefined ? "atom" : "electron-owner-atoms:" + current;
          const atoms = {};
          const primary = get(scope, "primary-aeon-selection-v1", 64 * 1024);
          atoms["primary-aeon-selection-v1"] = primary;
          state[owner === undefined ? "electron-persisted-atom-state" : scope] =
            atoms;
        }
      } finally {
        db.close();
      }
      const after = observe(path);
      if (before.key !== after?.key)
        throw Error("Global state changed during read");
      cached = { ...after, state };
      return cached;
    } catch (error) {
      cached = undefined;
      throw error;
    }
  };
}
