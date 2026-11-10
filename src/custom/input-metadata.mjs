import Parser from "stream-json/Parser.js";

const stateField = (path) => {
  if (!path.length) return true;
  if (["id", "hostId"].includes(path[0])) return path.length === 1;
  if (path[0] === "requests")
    return (
      path.length <= 2 ||
      (path.length === 3 && ["id", "method"].includes(path[2]))
    );
  if (path[0] === "threadRuntimeStatus")
    return (
      path.length === 1 ||
      (path.length === 2 && ["type", "activeFlags"].includes(path[1])) ||
      (path.length === 3 && path[1] === "activeFlags")
    );
  return false;
};
function keep(path, stack) {
  if (!path.length) return true;
  if (path.length === 1)
    return [
      "type",
      "requestId",
      "sourceClientId",
      "targetClientIds",
      "method",
      "version",
      "params",
      "resultType",
      "result",
      "handledByClientId",
    ].includes(path[0]);
  if (path[0] === "result") return path.length === 2 && path[1] === "clientId";
  if (path[0] === "targetClientIds") return path.length === 2;
  if (path[0] !== "params") return false;
  if (path.length === 2)
    return [
      "hostId",
      "conversationId",
      "change",
      "status",
      "clientId",
    ].includes(path[1]);
  if (path[1] !== "change") return false;
  if (path.length === 3)
    return [
      "type",
      "revision",
      "baseRevision",
      "conversationState",
      "patches",
    ].includes(path[2]);
  if (path[2] === "conversationState") return stateField(path.slice(3));
  if (path[2] !== "patches") return false;
  if (path.length === 4) return true;
  if (path[4] === "op") return path.length === 5;
  if (path[4] === "path") return path.length <= 6;
  if (path[4] !== "value") return false;
  const patch = stack.find(
    (frame) =>
      frame.path?.length === 4 &&
      frame.path[2] === "patches" &&
      frame.path[3] === path[3],
  )?.value;
  // Immer emits op, path, then value. Refuse an unknown ordering rather than keeping arbitrary values.
  if (!Array.isArray(patch?.path)) throw Error("patch-order");
  return (
    ["requests", "threadRuntimeStatus"].includes(patch.path[0]) &&
    stateField([...patch.path, ...path.slice(5)])
  );
}

// Streaming token projection: discarded text never becomes a complete string or object.
export function createInputMetadataParser() {
  const parser = new Parser({ packValues: false, streamValues: true });
  const stack = [];
  let scalar,
    root,
    complete = false,
    error,
    retained = 0;
  const account = (size) => {
    retained += size;
    if (retained > 256 * 1024) throw Error("metadata-limit");
  };
  function location() {
    const parent = stack.at(-1);
    if (!parent) return [];
    return parent.path
      ? [...parent.path, parent.array ? parent.index : parent.key]
      : null;
  }
  function finish(value, selected) {
    const parent = stack.at(-1);
    if (!parent) {
      root = value;
      complete = true;
      return;
    }
    if (parent.path && selected) {
      account(8);
      if (parent.array) parent.value[parent.index] = value;
      else parent.value[parent.key] = value;
    }
    if (parent.array) parent.index++;
    else parent.key = undefined;
  }
  parser.on("data", (token) => {
    if (error) return;
    try {
      const { name, value } = token;
      if (name === "startKey") {
        scalar = { key: true, selected: !!stack.at(-1)?.path, text: "" };
        return;
      }
      if (name === "startString" || name === "startNumber") {
        const path = location();
        scalar = {
          selected: !!path && keep(path, stack),
          number: name === "startNumber",
          text: "",
        };
        return;
      }
      if (name === "stringChunk" || name === "numberChunk") {
        if (scalar?.selected) {
          account(value.length);
          scalar.text += value;
          if (scalar.text.length > 4096) throw Error("scalar-limit");
        }
        return;
      }
      if (name === "endKey") {
        stack.at(-1).key = scalar.selected ? scalar.text : undefined;
        scalar = undefined;
        return;
      }
      if (name === "endString" || name === "endNumber") {
        finish(
          scalar.number ? Number(scalar.text) : scalar.text,
          scalar.selected,
        );
        scalar = undefined;
        return;
      }
      if (name === "startObject" || name === "startArray") {
        if (stack.length >= 128) throw Error("depth-limit");
        const path = location(),
          selected = !!path && keep(path, stack),
          array = name === "startArray";
        stack.push({
          path: selected ? path : null,
          value: selected ? (array ? [] : Object.create(null)) : undefined,
          array,
          index: 0,
        });
        return;
      }
      if (name === "endObject" || name === "endArray") {
        const frame = stack.pop();
        finish(frame.value, !!frame.path);
        return;
      }
      if (["nullValue", "trueValue", "falseValue"].includes(name)) {
        const path = location();
        finish(value, !!path && keep(path, stack));
      }
    } catch (e) {
      error = e;
    }
  });
  parser.on("error", (e) => {
    error = e;
  });
  return {
    write(chunk) {
      parser.write(chunk);
      if (error || parser.errored) throw error || parser.errored;
    },
    finish() {
      parser.end();
      if (error || parser.errored) throw error || parser.errored;
      if (!complete || stack.length) throw Error("incomplete-frame");
      return root;
    },
    destroy() {
      parser.destroy();
    },
    retainedBytes: () => retained,
    route() {
      const envelope = stack[0]?.value || root;
      const params =
        stack.find(
          (frame) => frame.path?.length === 1 && frame.path[0] === "params",
        )?.value || envelope?.params;
      return {
        sourceClientId: envelope?.sourceClientId,
        method: envelope?.method,
        hostId: params?.hostId,
        conversationId: params?.conversationId,
      };
    },
  };
}
