// Preview is bound to an exact task/model and expires before application.
export function createReasoningController({
  snapshot,
  apply,
  label,
  step,
  now = Date.now,
}) {
  let pending;
  function preview(ticks) {
    const current = snapshot();
    if (!current.threadId || !current.model || !current.levels?.length)
      throw Error("Open a supported task");
    const same =
      pending?.threadId === current.threadId &&
      pending?.model === current.model &&
      now() - pending.at < 15000;
    pending = {
      threadId: current.threadId,
      model: current.model,
      level: step(same ? pending.level : current.current, ticks, current.levels)
        .level,
      at: now(),
    };
    return pending.level;
  }
  async function commit() {
    const p = pending,
      current = snapshot();
    pending = undefined;
    if (
      !p ||
      now() - p.at > 15000 ||
      current.threadId !== p.threadId ||
      current.model !== p.model ||
      !current.levels.includes(p.level)
    )
      throw Error("Task or model changed");
    const picker = label(p.level);
    if (!picker) throw Error("Unsupported reasoning");
    const result = await apply(p.level, picker, p.threadId, p.model);
    const normalize = (v) =>
      String(v ?? "")
        .toLowerCase()
        .replaceAll(" ", "")
        .replace("extra", "x")
        .replace("light", "low");
    if (normalize(result.effort) !== p.level)
      throw Error("Reasoning not confirmed");
    return p.level;
  }
  return {
    preview,
    commit,
    view: () => (pending && now() - pending.at < 15000 ? pending : undefined),
  };
}
