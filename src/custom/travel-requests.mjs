import { openSync, closeSync, readSync, fstatSync, statSync } from "node:fs";
const decode = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};
const nameOf = (value) =>
  String(value ?? "")
    .split(".")
    .pop();
const outputTypes = new Set([
  "function_call_output",
  "custom_tool_call_output",
  "mcp_tool_call_output",
]);
const callTypes = new Set([
  "function_call",
  "custom_tool_call",
  "mcp_tool_call",
]);

export function createRequestTracker() {
  const requests = new Map();
  let plan,
    completed = false;
  function clearBlocking() {
    for (const [id, r] of requests) if (!r.async) requests.delete(id);
    plan = undefined;
  }
  function read() {
    const r = [...requests.values()].at(-1);
    return r
      ? {
          id: r.id,
          kind: r.kind,
          title: [...r.questions.values()][0] ?? "Input requested",
        }
      : plan;
  }
  function reply(message) {
    // Only consume actual structured user replies, not quoted history or tool text.
    const match = String(message ?? "").match(
      /^\s*<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>\s*$/,
    );
    if (!match) return false;
    const answers = decode(match[1]);
    if (!Array.isArray(answers)) return true;
    for (const answer of answers) {
      const identity = decode(answer.questionItemId);
      if (
        !Array.isArray(identity) ||
        nameOf(identity[0]) !== "request_user_input_async"
      )
        continue;
      const request = requests.get(identity[1]);
      if (!request?.async) continue;
      request.questions.delete(Number(identity[2]));
      if (!request.questions.size) requests.delete(request.id);
    }
    return true;
  }
  function consume(event) {
    const p = event.payload ?? {},
      type = p.type ?? "",
      name = nameOf(p.name);
    if (
      event.type === "response_item" &&
      type === "message" &&
      p.role === "user"
    ) {
      const content = (p.content ?? [])
        .filter((c) => ["input_text", "text"].includes(c.type))
        .map((c) => c.text ?? "")
        .join("\n");
      if (!reply(content)) clearBlocking();
      return;
    }
    if (event.type === "event_msg") {
      if (type === "user_message") {
        if (!reply(p.message)) clearBlocking();
        return;
      }
      if (["task_aborted", "turn_aborted", "task_error"].includes(type)) {
        requests.clear();
        plan = undefined;
        return;
      }
      if (type === "task_started") {
        // A new turn after completion supersedes optional questions from old work.
        // Mid-turn continuation/compaction does not retire the active question.
        if (completed) requests.clear();
        completed = false;
        clearBlocking();
        return;
      }
      if (["task_complete", "turn_complete"].includes(type)) {
        // Keep the indicator through completion until a reply or a new turn.
        completed = true;
        for (const [id, r] of requests) if (!r.async) requests.delete(id);
        return;
      }
    }
    if (event.type === "response_item" && outputTypes.has(type)) {
      const r = requests.get(p.call_id);
      if (!r) return;
      const result = decode(p.output);
      const answered =
        result?.answers && Object.keys(result.answers).length > 0;
      const failed =
        p.isError === true ||
        result?.isError === true ||
        result?.accepted === false ||
        result?.error != null;
      // {accepted:true} acknowledges display of an async question, not an answer.
      if (!r.async || answered || failed) requests.delete(r.id);
      return;
    }
    const questionCall =
      event.type === "response_item" &&
      callTypes.has(type) &&
      ["request_user_input", "request_user_input_async"].includes(name);
    const inputEvent =
      event.type === "event_msg" &&
      /approval_request|request_user_input|user_input_request/.test(type);
    if (questionCall || inputEvent) {
      const args = decode(p.arguments ?? p.input) ?? p,
        questions =
          Array.isArray(args.questions) && args.questions.length
            ? args.questions
            : [{ title: args.title ?? "Input requested" }];
      const id = p.call_id ?? p.id ?? event.timestamp;
      requests.set(id, {
        id,
        async: name === "request_user_input_async",
        kind: /approval/.test(type) ? "approval" : "question",
        questions: new Map(
          questions.map((q, i) => [
            i,
            q.question ?? q.title ?? "Input requested",
          ]),
        ),
      });
      return;
    }
    if (
      event.type === "response_item" &&
      type === "message" &&
      p.role === "assistant" &&
      p.phase === "final_answer" &&
      p.content?.some((c) => /^\s*<proposed_plan>/.test(c.text ?? ""))
    )
      plan = { id: event.timestamp, kind: "plan", title: "Plan ready" };
  }
  return { consume, read };
}
export function pendingRequest(events) {
  const tracker = createRequestTracker();
  for (const e of events) tracker.consume(e);
  return tracker.read();
}

export function createRequestReader() {
  const cache = new Map(),
    CHUNK = 256 * 1024,
    MAX_LINE = 8 * 1024 * 1024;
  return function requestFor(task) {
    if (!task?.rolloutPath) return undefined;
    const key = task.id ?? task.rolloutPath;
    let fd;
    try {
      const stat = statSync(task.rolloutPath);
      let entry = cache.get(key);
      if (
        !entry ||
        entry.path !== task.rolloutPath ||
        entry.ino !== stat.ino ||
        entry.dev !== stat.dev ||
        stat.size < entry.offset ||
        (stat.size === entry.offset && stat.mtimeMs !== entry.mtimeMs)
      )
        entry = {
          path: task.rolloutPath,
          ino: stat.ino,
          dev: stat.dev,
          offset: 0,
          tail: Buffer.alloc(0),
          skip: false,
          tracker: createRequestTracker(),
        };
      cache.delete(key);
      cache.set(key, entry);
      while (cache.size > 32) cache.delete(cache.keys().next().value);
      if (entry.offset === stat.size && entry.mtimeMs === stat.mtimeMs)
        return entry.tracker.read();
      fd = openSync(task.rolloutPath, "r");
      const size = fstatSync(fd).size;
      while (entry.offset < size) {
        const chunk = Buffer.alloc(Math.min(CHUNK, size - entry.offset)),
          n = readSync(fd, chunk, 0, chunk.length, entry.offset);
        if (!n) break;
        entry.offset += n;
        const data = Buffer.concat([entry.tail, chunk.subarray(0, n)]);
        let start = 0,
          end;
        while ((end = data.indexOf(10, start)) !== -1) {
          if (!entry.skip && end - start <= MAX_LINE) {
            try {
              entry.tracker.consume(
                JSON.parse(data.toString("utf8", start, end)),
              );
            } catch {}
          }
          entry.skip = false;
          start = end + 1;
        }
        entry.tail = Buffer.from(data.subarray(start));
        if (entry.tail.length > MAX_LINE) {
          entry.tail = Buffer.alloc(0);
          entry.skip = true;
        }
      }
      entry.mtimeMs = stat.mtimeMs;
      return entry.tracker.read();
    } catch {
      cache.delete(key);
      return undefined;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  };
}
