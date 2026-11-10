# Candidate verification

**Release status: blocked pending live acceptance.** Local automated checks and manual artifact review are reported in AUDIT.md. Passing fixture tests does not establish physical-device compatibility.

| Component | Candidate target / observed environment | Status |
|---|---|---|
| macOS | Apple Silicon; local build on 26.6.2 | Build and fixture verification |
| Stream Deck desktop | Installed 7.5.1 (22901); manifest minimum 7.1 | Package validation; live installation pending |
| Codex | English UI; bundle com.openai.codex; public-release version validation pending | UI/version-specific live acceptance pending |
| Stream Deck+ | Eight keys, four dials, touch strip | Candidate hardware test pending |
| Stream Deck Mobile | 5 × 3 layout | Candidate hardware test pending |
| Node runtime | Stream Deck bundled Node 24.13.1 | Pinned local dependency build |
| Browser demo | Desktop/mobile viewports; keyboard; reduced motion; WebGL fallback | See audit evidence |

## Required before release

- Fresh download and normal macOS/Stream Deck approval flow without security bypasses.
- Plus alone and Mobile alone: both pages, all cards, current task targeting, restart and reconnect.
- Voice starts/ends; mic and speaker toggle independently; app-side changes synchronize; locked screen and ambiguous session fail closed.
- Dictation release, request-specific hold-to-approve/start, request changed mid-gesture, and pending questions while work continues.
- Read acknowledgements survive restart and do not hide a newer response.
- Reasoning preview/apply preserves the model and refuses a changed task/model or expired preview.
- Zero, one, two, and offline light presets; system volume and mute.
- Denied permissions, unsupported Codex version, same-version reinstall, upgrade, interrupted install, and rollback, preserving unrelated setup.
- A nontechnical person completes the installation walkthrough.

Record publicly shareable app versions, pass/fail, date, and a redacted description for each check. The development build identifier is retained only in private local evidence until its release channel is established; no Codex version is claimed as hardware-validated here. Do not publish real task content as proof. Only after these checks, artifact review, and owner approval may publication proceed.

## Navigation without renderer focus events

Some app versions no longer provide the focused chat/window event used by the
native verifier. In that case, a task key dispatches the exact chat link and
reports an unverified open. Dispatch does not prove the chat is displayed and
never writes the read ledger or enables chat-specific actions. Those actions
remain unavailable until exact focus can be verified.

Completed cards can use the app's persisted local unread state when its schema,
single-account identity, and local-host binding are recognized. Unknown or
ambiguous state falls back to the existing ledger. New completions retain a
short grace period; files over 8 MB are ignored, and unchanged files are cached.
Check correct-chat navigation and read-state synchronization on both devices
with the app both foregrounded and backgrounded before claiming compatibility.

## Live tool approvals

The optional local observer uses the app's internal chat stream (protocol version 11). This is not a supported public API. An unavailable socket, unknown version, disconnected owner, or invalid revision falls back to the existing status sources without enabling action controls. It follows existing chat owners and never takes ownership or answers approvals.

The app sends a full initial snapshot; no status-only option is available on this interface. The observer retains at most 256 KiB of routing/request/status metadata per message, discards history and tool arguments while streaming, bounds scalar lengths and nesting, and backs off after invalid or oversized messages. A per-chat failure leaves other indicators intact. Frames above the transport safety limit disconnect the stream. Initial serialization/transfer still costs work in the app.

Verify a real pending app-access or tool approval: INPUT must remain visible while it is unanswered, clear after answering or dismissing it, and recover after restart. Repeat with a large-history chat among the displayed tasks, and confirm navigation and SEEN behavior remain correct. Automated fixture checks do not establish compatibility with every app build.
