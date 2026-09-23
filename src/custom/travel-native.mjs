import { execFile } from "node:child_process";

// Only read-only observations may be cancelled. Resolve after child close,
// not merely after sending a signal, so navigation cannot overlap that scan.
export function createNativeCaller(helper, prefix = []) {
  return (command, id, operation, token, options = {}) => {
    const signal = ["read", "globals"].includes(command)
      ? options.signal
      : undefined;
    if (signal?.aborted)
      return Promise.resolve({ ok: false, reason: "superseded" });
    return new Promise((resolve) => {
      let response,
        escalation,
        cancelled = false;
      const child = execFile(
        helper,
        [...prefix, command, id, ...(operation ? [operation, token] : [])],
        {
          timeout: command === "navigate" ? 6500 : 3500,
          maxBuffer: 256 * 1024,
        },
        (error, stdout) => {
          try {
            response = JSON.parse(stdout);
          } catch {
            response = {
              ok: false,
              reason:
                error?.killed || error?.code === "ETIMEDOUT"
                  ? "helper-timeout"
                  : "helper-unavailable",
            };
          }
        },
      );
      const cancel = () => {
        cancelled = true;
        child.kill("SIGTERM");
        // Escalation is confined to this owned read-only helper process.
        escalation = setTimeout(() => child.kill("SIGKILL"), 200);
        escalation.unref?.();
      };
      child.once("close", () => {
        clearTimeout(escalation);
        signal?.removeEventListener("abort", cancel);
        resolve(
          cancelled
            ? { ok: false, reason: "superseded" }
            : response || { ok: false, reason: "helper-unavailable" },
        );
      });
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  };
}
