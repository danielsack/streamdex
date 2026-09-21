import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  statSync,
  realpathSync,
} from "node:fs";
import { dirname, basename, resolve } from "node:path";

export function createReadLedger(path, logger = { warn() {} }) {
  let seen = {};
  if (path) {
    try {
      const d = JSON.parse(readFileSync(path, "utf8"));
      if (d.version === 1 && d.seen && typeof d.seen === "object")
        for (const [id, at] of Object.entries(d.seen))
          if (typeof at === "number" && Number.isFinite(at) && at > 0)
            seen[id] = at;
    } catch (e) {
      if (e.code !== "ENOENT")
        logger.warn("Travel read-state file could not be loaded: " + e.message);
    }
  }
  function save() {
    if (!path) return;
    mkdirSync(dirname(path), { recursive: true });
    const tmp = path + ".tmp";
    writeFileSync(tmp, JSON.stringify({ version: 1, seen }, null, 2) + "\n", {
      mode: 0o600,
    });
    renameSync(tmp, path);
  }
  return {
    restore(store) {
      for (const [id, at] of Object.entries(seen)) store.acknowledge(id, at);
      return Object.keys(seen).length;
    },
    record(task, store) {
      const at = task?.completedAt;
      if (
        !task?.id ||
        !["read", "unread"].includes(task.status) ||
        !Number.isFinite(at) ||
        at <= 0
      )
        return false;
      if ((seen[task.id] || 0) >= at) return false;
      const prior = seen[task.id];
      seen[task.id] = at;
      try {
        save();
      } catch (e) {
        if (prior === undefined) delete seen[task.id];
        else seen[task.id] = prior;
        throw e;
      }
      store.acknowledge(task.id, at);
      return true;
    },
    seenAt(id) {
      return seen[id] || 0;
    },
  };
}
const canonical = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
};
export function projectName(task, state = {}) {
  const assignment = state["thread-project-assignments"]?.[task?.id];
  const projects = state["local-projects"] || {};
  if (assignment?.projectId && projects[assignment.projectId]?.name)
    return projects[assignment.projectId].name;
  if (state["projectless-thread-ids"]?.includes(task?.id)) return "No project";
  if (task?.projectName) return task.projectName;
  if (!task?.cwd) return "No project";
  const cwd = canonical(task.cwd);
  const matches = Object.values(projects)
    .flatMap((p) =>
      (p.rootPaths || []).map((root) => ({
        root: canonical(root),
        name: p.name,
      })),
    )
    .filter((p) => p.name && (cwd === p.root || cwd.startsWith(p.root + "/")))
    .sort((a, b) => b.root.length - a.root.length);
  return matches[0]?.name || "No project";
}
export function createProjectResolver(path) {
  let cached = {},
    identity = "",
    last = 0;
  return (task) => {
    if (path && Date.now() - last > 4000) {
      last = Date.now();
      try {
        const s = statSync(path),
          next = s.size + ":" + s.mtimeMs;
        if (next !== identity) {
          cached = JSON.parse(readFileSync(path, "utf8"));
          identity = next;
        }
      } catch {}
    }
    return projectName(task, cached);
  };
}
