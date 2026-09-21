# Working with Streamdex

Avoid em dashes. Keep instructions clear for people who are not developers.

Present Streamdex as a personal experiment in ways of working with agentic workflows. Do not offer support, invite support requests, imply active or promised maintenance, or introduce professional-engagement claims. Preserve attribution and describe technical capabilities without making service commitments.

## Installation boundary

Read docs/INSTALL.md and docs/VERIFICATION.md first. The source snapshot is public; the installable beta still has incomplete release gates. Do not install the candidate on the user's real setup unless they explicitly request candidate testing. Normal installation starts only after the release gates pass. Use short-lived branches and pull requests for repository changes; main requires the Build and test check and resolved review conversations. Read CONTRIBUTING.md before making a change. The read-only CI workflow is approved for repository checks and must not upload artifacts or run against live installations. Push only within the user-authorized task scope and after auditing the exact staged candidate. Publishing releases, deploying Pages, uploading other artifacts, or sending diagnostics requires separate explicit approval.

For installation, inspect first with ./streamdex-setup inspect. Check SHA256SUMS and payload.json locally. Explain supported apps, devices, UI language and the outstanding checks. Ask only for the user's light preset and missing device details. Use the provided installer and normal Stream Deck/macOS approvals. Do not disable Gatekeeper, remove quarantine to bypass checks, grant permissions silently, modify other plugins/profiles, or import raw personal profiles.

Run ./streamdex-setup install with zero, one, or two --light HOST arguments. The helper opens the normal installer; complete that flow before verify. It may discover Codex under a different application filename through its bundle identifier. Preserve the backups and install receipt. Repeated same-build installation must not create duplicate profiles. For rollback, quit Stream Deck normally, run ./streamdex-setup rollback, then restart it. Never kill an unrelated process.

For development, follow docs/BUILD.md. Tests use fictional tasks and disposable roots only. Do not run live acceptance actions against the user's current conversation. Keep runtime state, backups, private matching lists, audit details and browser diagnostics out of the repository. Build from source, never patch a compiled bundle. Any change after audit invalidates the relevant review and checksums.

## Public identifiers and private data

Keep the stable plugin namespace `io.streamdex.plugin` aligned across the manifest, actions, profiles, build, installer and checksums. It is a public software identifier, not a user account, filesystem path or device binding. Do not rename it as cosmetic anonymization. Preserve copyright and upstream notices; use project-neutral names in instructions, metadata and fictional examples. Personal author credit belongs only in README.md and required license notices. The canonical repository/Pages URLs may include their actual GitHub owner. Do not hardcode the creator's personal handle into plugin IDs, build paths or fixtures. Keep owner-generated publication commits project-neutral; contributors should use public-safe Git identities.

For repository reviews, builds and tests, work from this checkout, pinned dependencies and disposable fixture roots. Do not search a person's home directory, Documents, photo library, browser profile, credentials, live Codex state or app logs to fill in examples or validate fixtures. A specific user-authorized installation or diagnostic task may require narrowly scoped live access; read only what that task needs and keep the resulting data outside the repository and release allowlist.

Do not package an installed plugin or export a live profile as a release input. The installed SDK can create local logs containing paths or error details, and live profiles can carry device settings. Generate artifacts from the reviewed source. Keep private matching lists, audit outputs, runtime data, backups, Accessibility captures and screenshots outside the release tree. No credentials, real task/project content, personal paths, device identifiers or configured light addresses belong in examples, commits, packages, issues or CI artifacts.

Be precise about privacy: the running plugin reads local Codex databases, rollout content, project labels and app logs, and sends rendered task labels to connected Stream Deck displays. It is not limited to nonsensitive metadata. Codex's own network/data handling still applies. Never upload local diagnostics automatically or imply that a clean source audit makes arbitrary runtime output safe to publish. This experiment offers no support or diagnostic-review service.
