# Changelog

User-visible changes are recorded here. Versions follow [Semantic Versioning](https://semver.org/); [versioning guidance](docs/VERSIONING.md) explains candidate and release preparation.

## [Unreleased]

### Changed

- Local tests default to the fast suite, with focused task, Voice and installation commands. Full checks remain required in GitHub Actions.
- JavaScript, native helpers and profiles can be built separately during development.
- The task-store read-only test uses disposable fictional data instead of discovering a local Codex database.

## [0.1.0-beta.2] - 2026-09-24

### Fixed

- Task selection takes priority over background scans and shows Opening… while navigation is pending.
- Faster focus confirmation avoids repeated file metadata lookups and expensive searches through unrelated log output.
- SEEN updates promptly after exact-task confirmation, with stale scan results discarded.
- Slow helper responses no longer make every task appear offline.

### Changed

- Versions now come from package.json, with consistency checks in CI and versioned setup archives.
- The sidebar status observer was reverted after navigation regressions; exact-task controls retain their existing verification checks.

This candidate has not been published as an installable GitHub Release.

## [0.1.0-beta.1]

### Added

- Initial public experimental snapshot for Stream Deck+ and Mobile, with task cards, contextual controls, Voice, dictation, reasoning, and optional lighting presets.
- Local setup, verification and rollback helpers, a static interactive demo, and repository tests and privacy auditing.

Historical baseline; no installable GitHub Release was published for this version.
