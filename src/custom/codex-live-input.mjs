import net from "node:net";
import { lstatSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createInputMetadataParser } from "./input-metadata.mjs";

const MAX_FRAME = 64 * 1024 * 1024;
const VERSION = 11;
const approvalMethods = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "mcpServer/elicitation/request",
]);
const questionMethods = new Set([
  "item/tool/requestUserInput",
  "tool/requestUserInput",
]);
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const copyRequest = (r) => {
  if (
    !r ||
    typeof r.method !== "string" ||
    !["string", "number"].includes(typeof r.id)
  )
    throw Error("request-schema");
  return { id: r.id, method: r.method };
};
const copyRequests = (requests) => {
  if (!Array.isArray(requests) || requests.length > 64)
    throw Error("requests-schema");
  return requests.map(copyRequest);
};
const copyStatus = (status) => {
  if (status == null) return null;
  if (!["active", "idle", "notLoaded", "systemError"].includes(status.type))
    throw Error("status-schema");
  if (
    status.type === "active" &&
    (!Array.isArray(status.activeFlags) ||
      status.activeFlags.some((v) => typeof v !== "string"))
  )
    throw Error("flags-schema");
  return {
    type: status.type,
    activeFlags:
      status.type === "active" ? status.activeFlags.slice(0, 16) : [],
  };
};

// Keep only request identities and runtime flags, never conversation text or tool arguments.
export function inputSnapshot(state, threadId) {
  if (state?.id !== threadId || state.hostId !== "local")
    throw Error("wrong-thread");
  return {
    requests: copyRequests(state.requests),
    status: copyStatus(state.threadRuntimeStatus),
  };
}
export function inputPatches(previous, patches) {
  if (!Array.isArray(patches) || patches.length > 10000)
    throw Error("patch-schema");
  const next = {
    requests: previous.requests.map((r) => ({ ...r })),
    status: previous.status && {
      ...previous.status,
      activeFlags: [...previous.status.activeFlags],
    },
  };
  for (const p of patches) {
    if (
      !Array.isArray(p.path) ||
      !["add", "remove", "replace"].includes(p.op) ||
      !p.path.length
    )
      throw Error("patch-schema");
    const [root, index, field] = p.path;
    if (root === "requests") {
      if (p.path.length === 1) {
        next.requests = p.op === "remove" ? [] : copyRequests(p.value);
        continue;
      }
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index > next.requests.length ||
        index >= 64
      )
        throw Error("request-index");
      if (p.path.length === 2) {
        if (p.op === "add")
          next.requests.splice(index, 0, copyRequest(p.value));
        else {
          if (index >= next.requests.length) throw Error("request-index");
          if (p.op === "remove") next.requests.splice(index, 1);
          else next.requests[index] = copyRequest(p.value);
        }
      } else if (field === "id" || field === "method") {
        if (p.path.length !== 3 || p.op === "remove" || !next.requests[index])
          throw Error("request-field");
        next.requests[index] = copyRequest({
          ...next.requests[index],
          [field]: p.value,
        });
      } // Changes to request arguments cannot change whether a request is pending.
      if (next.requests.length > 64) throw Error("request-limit");
    } else if (root === "threadRuntimeStatus") {
      // Current protocol replaces this field atomically. Unknown future shapes fail closed.
      if (p.path.length !== 1) throw Error("status-patch-schema");
      next.status = p.op === "remove" ? null : copyStatus(p.value);
    }
  }
  return next;
}
export function pendingLiveInput(projection) {
  if (!projection) return undefined;
  for (const r of projection.requests) {
    if (approvalMethods.has(r.method))
      return {
        id: String(r.id),
        kind: "approval",
        title: "Permission required in Codex",
      };
    if (questionMethods.has(r.method))
      return {
        id: String(r.id),
        kind: "question",
        title: "Input required in Codex",
      };
  }
  const flags =
    projection.status?.type === "active" ? projection.status.activeFlags : [];
  if (flags.includes("waitingOnApproval"))
    return {
      id: "runtime-approval",
      kind: "approval",
      title: "Permission required in Codex",
    };
  if (flags.includes("waitingOnUserInput"))
    return {
      id: "runtime-input",
      kind: "question",
      title: "Input required in Codex",
    };
  return undefined;
}

export function createLiveInputObserver(codexHome, options = {}) {
  const now = options.now || Date.now;
  const connect = options.connect || ((path) => net.createConnection(path));
  const socketPath = codexHome && join(codexHome, "ipc", "ipc.sock");
  const secure =
    options.secure ||
    (() => {
      const dir = lstatSync(join(codexHome, "ipc")),
        file = lstatSync(socketPath);
      return (
        dir.isDirectory() &&
        file.isSocket() &&
        dir.uid === process.getuid() &&
        file.uid === process.getuid() &&
        !(dir.mode & 0o077) &&
        !(file.mode & 0o077)
      );
    });
  const targets = new Map(),
    outstanding = new Map();
  let socket,
    clientId,
    header = Buffer.alloc(0),
    body,
    remaining = 0,
    oversized = false,
    retryAt = 0,
    startedAt = 0,
    disposed = false;
  let notificationQueued = false;
  const changed = () => {
    if (notificationQueued || disposed) return;
    notificationQueued = true;
    queueMicrotask(() => {
      notificationQueued = false;
      if (!disposed) options.onChange?.();
    });
  };
  function clear(entry) {
    const had = !!entry.projection;
    entry.projection = undefined;
    entry.revision = undefined;
    entry.pending = undefined;
    if (had) changed();
  }
  function drop(delay = 10000) {
    const old = socket;
    socket = undefined;
    clientId = undefined;
    header = Buffer.alloc(0);
    body?.destroy();
    body = undefined;
    remaining = 0;
    outstanding.clear();
    retryAt = now() + delay;
    for (const entry of targets.values()) {
      clear(entry);
      entry.owner = undefined;
    }
    old?.destroy();
  }
  function send(message) {
    if (!socket?.writable || socket.writableLength > 65536) return false;
    const value = Buffer.from(JSON.stringify(message)),
      prefix = Buffer.alloc(4);
    prefix.writeUInt32LE(value.length);
    socket.write(Buffer.concat([prefix, value]));
    return true;
  }
  function following(id, entry, enabled) {
    if (clientId && entry.owner)
      send({
        type: "broadcast",
        method: "thread-stream-following-changed",
        version: 1,
        sourceClientId: clientId,
        targetClientIds: [entry.owner],
        params: { hostId: "local", conversationId: id, following: enabled },
      });
  }
  function discover(id, entry) {
    const requestId = randomUUID();
    entry.checkedAt = now();
    outstanding.set(requestId, { id, entry, at: now() });
    send({
      type: "request",
      requestId,
      sourceClientId: clientId,
      method: "thread-owner-discovery",
      version: 1,
      params: { hostId: "local", conversationId: id },
      timeoutMs: 2500,
    });
  }
  function receive(m) {
    if (m.type === "client-discovery-request") {
      send({
        type: "client-discovery-response",
        requestId: m.requestId,
        response: { canHandle: false },
      });
      return;
    }
    if (m.type === "response") {
      if (m.requestId === "streamdex-initialize") {
        if (
          m.resultType !== "success" ||
          typeof m.result?.clientId !== "string"
        ) {
          drop();
          return;
        }
        clientId = m.result.clientId;
        for (const [id, entry] of targets) discover(id, entry);
        return;
      }
      const pending = outstanding.get(m.requestId);
      if (!pending) return;
      outstanding.delete(m.requestId);
      const entry = targets.get(pending.id);
      if (!entry || entry !== pending.entry) return;
      if (
        m.resultType !== "success" ||
        typeof m.handledByClientId !== "string"
      ) {
        following(pending.id, entry, false);
        clear(entry);
        entry.owner = undefined;
        return;
      }
      if (entry.owner !== m.handledByClientId) {
        following(pending.id, entry, false);
        clear(entry);
        entry.owner = m.handledByClientId;
      }
      if (!entry.projection) following(pending.id, entry, true);
      return;
    }
    if (
      m.type !== "broadcast" ||
      (m.targetClientIds && !m.targetClientIds.includes(clientId))
    )
      return;
    if (m.method === "ipc-connection-reset") {
      drop();
      return;
    }
    if (
      m.method === "client-status-changed" &&
      m.params?.status === "disconnected"
    ) {
      for (const entry of targets.values())
        if (entry.owner === m.params.clientId) {
          clear(entry);
          entry.owner = undefined;
          entry.checkedAt = 0;
        }
      return;
    }
    if (
      m.method === "thread-stream-following-status-requested" &&
      m.params?.hostId === "local"
    ) {
      const entry = targets.get(m.params.conversationId);
      if (entry?.owner === m.sourceClientId)
        following(m.params.conversationId, entry, true);
      return;
    }
    if (
      m.method !== "thread-stream-state-changed" ||
      m.params?.hostId !== "local"
    )
      return;
    const id = m.params.conversationId,
      entry = targets.get(id);
    if (!entry || !entry.owner || entry.owner !== m.sourceClientId) return;
    const c = m.params.change;
    try {
      if (
        m.version !== VERSION ||
        !Number.isSafeInteger(c?.revision) ||
        c.revision < 0
      )
        throw Error("version");
      if (c.type === "snapshot")
        entry.projection = inputSnapshot(c.conversationState, id);
      else if (
        c.type === "patches" &&
        entry.projection &&
        c.baseRevision === entry.revision &&
        c.revision > c.baseRevision
      )
        entry.projection = inputPatches(entry.projection, c.patches);
      else throw Error("revision");
      const previous = entry.pending;
      entry.revision = c.revision;
      entry.pending = JSON.stringify(pendingLiveInput(entry.projection));
      if (previous !== entry.pending) changed();
    } catch {
      clear(entry);
      following(id, entry, false);
      entry.owner = undefined;
      entry.checkedAt = now();
      entry.retryAt = now() + 60000;
    }
  }
  function rejectFrame(current) {
    const route = current.route(),
      entry = targets.get(route.conversationId);
    if (
      route.method !== "thread-stream-state-changed" ||
      route.hostId !== "local" ||
      !entry?.owner ||
      entry.owner !== route.sourceClientId
    ) {
      drop(60000);
      return false;
    }
    following(route.conversationId, entry, false);
    clear(entry);
    entry.owner = undefined;
    entry.checkedAt = now();
    entry.retryAt = now() + 300000;
    for (const [key, pending] of outstanding)
      if (pending.entry === entry) outstanding.delete(key);
    return true;
  }
  function data(chunk) {
    // Only status metadata is retained, even when a snapshot contains a large history.
    let at = 0;
    try {
      while (at < chunk.length && socket) {
        if (!body) {
          const take = Math.min(4 - header.length, chunk.length - at);
          header = Buffer.concat([header, chunk.subarray(at, at + take)]);
          at += take;
          if (header.length < 4) return;
          remaining = header.readUInt32LE();
          header = Buffer.alloc(0);
          if (!remaining || remaining > 256 * 1024 * 1024) {
            drop(60000);
            return;
          }
          oversized = remaining > MAX_FRAME;
          body = createInputMetadataParser();
        }
        const take = Math.min(remaining, chunk.length - at);
        if (!body.discard) {
          try {
            body.write(
              chunk.subarray(
                at,
                at + (oversized ? Math.min(take, 65536) : take),
              ),
            );
            if (oversized) throw Error("oversized-frame");
          } catch {
            const failed = body;
            if (!rejectFrame(failed)) return;
            failed.destroy();
            body = { discard: true, destroy() {}, finish: () => undefined };
          }
        }
        remaining -= take;
        at += take;
        if (!remaining) {
          const current = body;
          body = undefined;
          try {
            const message = current.finish();
            if (message) receive(message);
          } catch {
            if (!rejectFrame(current)) return;
          } finally {
            current.destroy();
          }
        }
      }
    } catch {
      drop(60000);
    }
  }
  function tick() {
    if (disposed || !targets.size || !socketPath) return;
    for (const [key, pending] of outstanding)
      if (now() - pending.at > 4000) {
        outstanding.delete(key);
        const entry = targets.get(pending.id);
        if (entry) {
          following(pending.id, entry, false);
          clear(entry);
          entry.owner = undefined;
        }
      }
    if (socket && !clientId && now() - startedAt > 4000) drop();
    if (!socket && now() >= retryAt) {
      try {
        if (!secure()) {
          retryAt = now() + 10000;
          return;
        }
        const connected = connect(socketPath);
        socket = connected;
        startedAt = now();
        connected.on("connect", () =>
          send({
            type: "request",
            requestId: "streamdex-initialize",
            sourceClientId: "initializing-client",
            method: "initialize",
            version: 0,
            params: { clientType: "streamdex-status-observer" },
          }),
        );
        connected.on("data", (chunk) => {
          if (socket === connected) data(chunk);
        });
        connected.on("error", () => {
          if (socket === connected) drop();
        });
        connected.on("close", () => {
          if (socket === connected) drop();
        });
      } catch {
        drop();
      }
    }
    if (clientId)
      for (const [id, entry] of targets)
        if (now() - entry.checkedAt >= 15000 && now() >= (entry.retryAt || 0))
          discover(id, entry);
  }
  const timer = setInterval(tick, 1000);
  timer.unref?.();
  return {
    update(ids) {
      if (disposed) return;
      const selected = new Set(ids.filter(uuid).slice(0, 9));
      for (const [id, entry] of targets)
        if (!selected.has(id)) {
          following(id, entry, false);
          targets.delete(id);
          for (const [key, pending] of outstanding)
            if (pending.entry === entry) outstanding.delete(key);
        }
      for (const id of selected)
        if (!targets.has(id)) targets.set(id, { checkedAt: 0 });
      if (!targets.size) drop();
      else tick();
    },
    requestFor(task) {
      return pendingLiveInput(targets.get(task?.id)?.projection);
    },
    stop() {
      for (const [id, entry] of targets) following(id, entry, false);
      disposed = true;
      clearInterval(timer);
      drop();
      targets.clear();
    },
  };
}
