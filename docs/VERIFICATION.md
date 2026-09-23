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
- Dictation release, request-specific hold-to-approve/start, request changed mid-gesture, and optional questions remaining RUN ? while work continues. Check background permission approvals, resolution, duplicate task names, hidden sidebars, and helper timeouts.
- Read acknowledgements survive restart and do not hide a newer response.
- Reasoning preview/apply preserves the model and refuses a changed task/model or expired preview.
- Zero, one, two, and offline light presets; system volume and mute.
- Denied permissions, unsupported Codex version, same-version reinstall, upgrade, interrupted install, and rollback, preserving unrelated setup.
- A nontechnical person completes the installation walkthrough.

Record publicly shareable app versions, pass/fail, date, and a redacted description for each check. The development build identifier is retained only in private local evidence until its release channel is established; no Codex version is claimed as hardware-validated here. Do not publish real task content as proof. Only after these checks, artifact review, and owner approval may publication proceed.
