# Local candidate audit

The current source candidate is **v0.1.0-beta.2** (Stream Deck **0.1.0.2**). Its [changelog](CHANGELOG.md) records the navigation fixes and versioning changes. The initial audit below describes the original snapshot; later changes require their own exact-source and artifact checks. The installable-release gates remain in [VERIFICATION.md](docs/VERIFICATION.md).

**Initial audit baseline:** v0.1.0-beta.1 (plugin version 0.1.0.1). **Release publication status: not approved; live acceptance pending.** This report covers the local release tree and proposed setup kit. The initial source snapshot was subsequently pushed with explicit owner approval. Installable-release publication remains pending; browser-demo hosting is separate from hardware acceptance. The existing Stream Deck installation and its backups were preserved.

## Candidate boundary

The candidate has fresh Git history and an explicit 193-file allowlist in [release-files.json](release-files.json). The repository and private review workspace are outside cloud-synced folders. The proposed downloadable kit contains exactly those allowlisted files. The plugin package contains 20 files; its unpacked contents, package, and setup executable are covered by [payload.json](payload.json). [SHA256SUMS](SHA256SUMS) verifies the 23 payload/manifest entries. The outer release ZIP has a separate SHA-256 checksum alongside it.

The final candidate commit ID, exact staged inventory with file hashes, archive checksum, and detailed test evidence are recorded in the owner's separate local review report. They are kept outside this tree to avoid a self-referential commit/hash record. Git commits use the project identity or the approved public GitHub identity with a noreply email. There is no imported upstream Git history.

## Completed local checks

| Check | Result and limits |
|---|---|
| Source and dependencies | Pinned package-lock dependencies installed locally with lifecycle scripts disabled; no CI upload. Node 24.13.1 used for the final build and tests. |
| TypeScript and native build | Typecheck passed. Four Swift components compiled for arm64/macOS 13.0, with neutral compilation paths and no source maps. All four ad hoc signatures verify. A separate, excluded test helper contains the native fixture handlers. These are not notarized binaries. |
| Elgato validation | Official CLI validation and plugin packaging passed. |
| Automated tests | 354 passed: 329 fixture and production-boundary tests across 34 files, 16 Streamdex controller/profile/installer tests, and nine isolated release-auditor regression tests. Removed-feature tests were retired; new production checks cover early command rejection and absence of test handlers. |
| Installer lifecycle | Disposable-root tests passed for first install, repeated install, upgrade backup, rollback preserving unrelated setup, invalid inputs, and tampered payload rejection before settings changes. These fixtures do not test the real macOS installer dialogs. |
| Local inspection | Read-only inspect passed kit integrity, Apple Silicon, and app discovery. It reported no Streamdex installation and made no changes. |
| Payload integrity | All 23 checksum entries passed; nested packages and profiles were inspected. |
| Privacy scan | 193 allowlisted files and nested archive entries checked before Git staging, with no sensitive matches. The exact Git index is checked separately before the candidate commit. Binary strings and null-separated text are included. |
| Manual content review | Reviewed documentation, public URL/host/email inventory, dependency notices, fictional demo content, media, and file selection. Public dependency-license contacts and project URLs are intentional. No private service endpoints or real device bindings are included. |
| Images | Updated photo has 360 × 360 and 886 × 886 derivatives with no EXIF/GPS/author metadata. Both derivatives passed offline OCR and visual review; only generic fictional tasks are visible. Unchanged poster, preview and closing card retain their prior review. |
| Video | The reviewed 1080p source was reduced to silent H.264, 1280 × 720 at 24 fps, preserving the full walkthrough and separate captions. Source review included a contact sheet and offline OCR from all 1,104 source frames with no private identifiers or removed personal statistics matched. The smaller encode passed full-frame decode, metadata, browser playback and visual checks; no new content is introduced. The MP4 is 1.4 MiB and has fast-start layout. The finite hero preview is 706 KiB; desktop/mobile fit and the reduced-motion poster were verified locally. |
| Demo | Desktop and 390-pixel mobile layouts, keyboard focus, task states, navigation, independent Voice controls, reasoning, lighting presets, offline lights, pause/reset, reduced motion, and WebGL fallback checked locally. Video playback passed. Requests remained local; no account or microphone access. |
| README embedded media | A finite 4.8-second hero preview comes from the reviewed film, with a static alternative for reduced motion. Two further finite GIFs use the shipped task/Voice renderers; static PNG alternatives and an original dial guide are included. All 105 source frames passed SVG parsing, browser rasterization, and local OCR review. All encoded GIF frames decode, with no loop extension or image EXIF. Desktop/mobile sizing, alt text, and keyboard demo links checked locally. |
| README links | All local Markdown links and embedded-image paths resolve. Interactive links target the GitHub Pages demo. |

The scanner covers the exact allowlist, Git index, nested ZIP/plugin/profile archives, unsafe paths and symlinks, common credential formats, private owner-supplied identifiers, machine paths, live-state filenames, device bindings, and payload/archive mismatches. Review found and removed build-path leakage from an earlier dependency location before the final build. Private matching lists, raw findings, screenshots, OCR outputs, and historical artifacts are excluded from this repository.

Automated scanning, decoded-media OCR and visual review reduce disclosure risk; they are not a guarantee that every possible sensitive value can be detected. The reviewer should inspect this exact candidate and its media before approving publication.

## Publication cleanup

Unused global permission switching, automatic Full Access confirmation, and autonomy/publication presets have been removed from source and rebuilt artifacts. Read-only approval observation and deliberate request-specific holds remain. Synthetic model examples now use unmistakably fictional identifiers, and fixture commands compile only into an excluded test helper. Unsupported production commands fail before touching Accessibility or a running app.

The README separates local controls from Codex’s own data handling, explains visible task titles, and describes a personal experiment in ways of working with agentic workflows, with no support or ongoing maintenance offered without implying organizational deployment or endorsement. Restricted or unverified build-channel details are excluded from the public compatibility claim. The clearer owner-supplied photo uses fictional tasks and does not certify beta acceptance.

The earlier local snapshots and their history are preserved privately. The publication candidate starts with a fresh commit of the reviewed files so superseded binaries and removed presets are not part of its Git history.

## Provenance and distribution

Todd Dailey's upstream MIT notice is retained. [PROVENANCE.md](PROVENANCE.md) identifies the streamdeckcodex foundation and Streamdex contributions. Lucide replaces extracted Codex glyphs. Required SDK/library, Three.js, and Lucide notices are included. The unused font-derived wordmarks and their associated license file were removed together. This is an independent personal experiment. Private runtime state, backups, local accessibility captures, historical bundles, unrelated media, and device/network settings are excluded.

## Remaining release gates

The version matrix and complete live checklist are in [VERIFICATION.md](docs/VERIFICATION.md). In particular, the candidate still needs:

- A fresh downloaded installation through normal macOS and Stream Deck prompts, followed by a real repeated install, upgrade, interrupted-install recovery, and rollback.
- Stream Deck+ and Mobile tests independently, including reconnect/restart, touch-strip behavior, read persistence, Voice state synchronization, deliberate holds, stale-target rejection, and reasoning/model preservation.
- Zero-, one-, two-, and offline-light configurations on real devices, plus system volume/mute.
- A nontechnical installation walkthrough and owner review of the exact candidate.

Do not publish until these gates and owner approval are complete. Changes to the reviewed candidate require the relevant checks again. Browser-demo deployment does not publish or approve an installable release.

## Identifier and script review

The plugin/action namespace is project-neutral. It is not a machine-specific account or path. README/license credits and canonical repository links are intentional. Review found no creator-specific home paths or embedded private work files in the published snapshot. Runtime reads are broader than status metadata: Codex rollouts and app logs can contain private content, and local SDK logs can retain error details. These are excluded from distribution. The privacy guide now documents the runtime and script boundaries, and AGENTS.md requires fictional fixtures, narrow live access only when authorized, and packaging from reviewed source rather than a running installation. A leftover manifest support link was removed to match the experiment's no-support framing.

## Fresh publication history

The technical namespace is `io.streamdex.plugin`. The package and plugin author use the project name; Git merges may use the approved public GitHub noreply identity. Personal author credit is retained in the README and license notices; the canonical repository URL retains its GitHub owner. Source, profiles, compiled executables and nested packages are checked for the retired identifier and unexpected personal-name references. The new root commit contains only this reviewed snapshot; earlier snapshots remain outside the release tree as private backups.

## Repository workflow checks

The contribution workflow adds isolated GitHub Actions checks for committed source/payload integrity, documentation links, auditor regression fixtures, the native/JavaScript build, plugin packaging, and the existing target/Voice/installer suites. Third-party actions are pinned to commit IDs; repository access is read-only and credentials are not persisted. Build and test uploads no artifacts, installs no live plugin and publishes no release. After that job succeeds on main, Publish demo uploads only the tracked static website and deploys to GitHub Pages. Pull requests cannot deploy. Main uses pull requests, a required Build and test check, resolved review conversations, and a linear history. Source-level CI approval is separate from the live release gates above.
