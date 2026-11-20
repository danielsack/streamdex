import { createHash } from "node:crypto";
const text = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 256;
const hash = (parts) =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex");
// Renderer ownership and read-state identity use different app-defined hashes.
// Cached account metadata is accepted only when it proves the current owner.
export function projectAccountState(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state))
    return;
  let owner, atoms;
  if (Object.hasOwn(state, "electron-renderer-content-owner")) {
    owner = state["electron-renderer-content-owner"];
    if (typeof owner !== "string" || !/^[0-9a-f]{64}$/.test(owner)) return;
    atoms = state["electron-owner-atoms:" + owner];
  } else if (Object.hasOwn(state, "electron-account-renderer-state-v1")) {
    owner = state["electron-account-renderer-state-v1"]?.owner;
    atoms = state["electron-persisted-atom-state"];
  } else return;
  const account = atoms?.["primary-aeon-selection-v1"];
  if (
    !text(account?.accountId) ||
    !text(account?.userId) ||
    hash([account.userId, account.accountId]) !== owner
  )
    return;
  return {
    owner,
    atoms,
    readIdentity: hash(["chatgpt", account.accountId, account.userId]),
  };
}
