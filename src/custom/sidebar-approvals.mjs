import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
const normalize = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const titleOf = (task) => normalize(task.displayTitle || task.title);
const MAX_AGE = 6000;

export function readSidebar(titles) {
  return new Promise((resolve) => {
    const child = execFile(
      fileURLToPath(new URL("./sidebar-control", import.meta.url)),
      ["read"],
      { timeout: 2500, maxBuffer: 64 * 1024 },
      (error, stdout) => {
        if (error) return resolve({ ok: false });
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ ok: false });
        }
      },
    );
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ titles }));
  });
}
export function createTitleIndex(databasePath) {
  let database;
  return {
    read() {
      if (!database) {
        database = new DatabaseSync(databasePath, {
          readOnly: true,
          timeout: 1000,
        });
        database.exec("PRAGMA query_only = ON");
      }
      const columns = new Set(
        database
          .prepare("PRAGMA table_info(threads)")
          .all()
          .map((c) => c.name),
      );
      const expression = columns.has("name")
        ? "COALESCE(NULLIF(name, ''), title)"
        : "title";
      const rows = database
        .prepare(
          `SELECT id, ${expression} AS title FROM threads WHERE archived = 0 LIMIT 20001`,
        )
        .all();
      if (rows.length > 20000) throw Error("title-index-limit");
      return rows;
    },
    close() {
      database?.close();
      database = undefined;
    },
  };
}
// Sidebar text is display evidence only. It cannot authorize any native action.
export function createSidebarApprovalObserver({
  call = readSidebar,
  titleIndex,
  now = Date.now,
} = {}) {
  let observed = new Map(),
    at = -Infinity,
    lastPoll = -Infinity,
    pending,
    stopped = false;
  function requestFor(task) {
    const entry = observed.get(task?.id);
    if (
      !entry ||
      now() - at > MAX_AGE ||
      entry.title !== titleOf(task) ||
      ["read", "unread", "error", "off"].includes(task.status) ||
      (task.completedAt && task.completedAt >= at)
    )
      return undefined;
    return {
      kind: "approval",
      title: "Approval required",
      source: "sidebar",
      id: "sidebar:" + task.id,
    };
  }
  async function poll(tasks) {
    if (stopped || pending || now() - lastPoll < 2000) return pending;
    lastPoll = now();
    pending = (async () => {
      const startedAt = now();
      try {
        const rows = titleIndex.read(),
          identities = new Map();
        for (const row of rows) {
          const title = normalize(row.title),
            ids = identities.get(title) ?? new Set();
          ids.add(row.id);
          identities.set(title, ids);
        }
        const seen = new Set();
        const candidates = tasks
          .filter((task) => {
            if (!task?.id || seen.has(task.id)) return false;
            seen.add(task.id);
            const title = titleOf(task),
              ids = identities.get(title);
            return title && ids?.size === 1 && ids.has(task.id);
          })
          .slice(0, 16)
          .map((task) => ({ id: task.id, title: titleOf(task) }));
        if (!candidates.length) {
          observed.clear();
          return;
        }
        const response = await call(candidates.map((c) => c.title));
        if (stopped) return;
        // Recheck names after capture, since a task may have been renamed meanwhile.
        const latest = titleIndex.read(),
          next = new Map();
        if (
          response?.ok === true &&
          Array.isArray(response.rows) &&
          now() - startedAt <= MAX_AGE
        ) {
          for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i],
              matches = response.rows.filter((r) => r.titleIndex === i);
            const names = latest.filter((r) => normalize(r.title) === c.title);
            if (
              matches.length === 1 &&
              matches[0].pending === true &&
              names.length === 1 &&
              names[0].id === c.id
            )
              next.set(c.id, { title: c.title });
          }
        }
        observed = next;
        at = startedAt;
      } catch {
        observed.clear();
      }
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  }
  return {
    poll,
    requestFor,
    stop() {
      stopped = true;
      observed.clear();
      titleIndex?.close?.();
    },
  };
}
