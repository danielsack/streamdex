# Privacy and release review

The public tree is selected through release-files.json. Runtime state, raw exports, backups, task ledgers, task-target maps, personal profiles, app captures and private audit findings are excluded.

The local audit scans allowed files, binary strings, and archive contents for credential patterns, private user paths, device bindings, internal URLs and forbidden runtime files. A private matching list adds owner-specific identifiers without placing those identifiers in this repository. Automated checks are combined with visual media review, OCR, metadata inspection, license review, and examination of the exact staged diff and Git metadata.

All demo tasks and projects are fictional. The movie has no audio track or personal usage results. The photograph shows fictional task cards. The demo makes no network requests beyond its own local files and does not access accounts or microphones.

The installed plugin reads local Codex state and uses Accessibility to observe and operate verified app controls. Optional lighting makes requests only to user-configured light endpoints on port 9123. A failed or stale target blocks the action. Request-specific approvals require a deliberate hold; there is no global permission-mode switch or publishing preset. Saved read acknowledgements and light configuration remain private in the user's Application Support folder.

Do not publish raw logs, task databases, profiles, accessibility dumps, screenshots, or environment files. Remove names, task/project titles, addresses, hostnames, IDs, paths and account data from any diagnostic excerpt. A clean scan is evidence for a specific candidate, not a guarantee about arbitrary future files or installations.

## Public names and identifiers

`io.streamdex.plugin` is the plugin's stable reverse-DNS identifier. It appears in action IDs, profile manifests, build/installer paths and checksum inventories so those components agree on the same plugin. It does not select a person's Mac account or home folder. README author credit, required license notices and canonical repository links are intentional. Package/plugin metadata and technical identifiers use the project name. Changing the namespace would create a different plugin identity and require a migration plan.

## What the code reads and sends

| Component | Local access | Output or communication |
|---|---|---|
| Build, profile, icon and README-illustration scripts | Reviewed source, bundled assets, pinned dependencies and fictional examples | Local build files and packages. Elgato validation may fetch a public schema and check public manifest URLs; it does not upload the kit. |
| Privacy audit | The release allowlist, Git index, nested packages, and an optional explicitly supplied private matching-list file | Local findings and hashes. No remote scanner or report upload. Keep detailed reports outside the release tree. |
| Task/status runtime | The current user's Codex database, referenced rollout files, config/model cache and `.codex-global-state.json` project labels | Task/project labels and state are rendered through the local Stream Deck connection for the connected deck or Mobile display. Rollouts can contain prompts, responses and tool output, not just status metadata. |
| Native task and Voice helpers | Codex Accessibility controls, recent Codex desktop logs and keybindings | Verified local app actions and local command results. Diagnostic output can contain task/control labels or paths. |
| State and installation | Streamdex configuration/read acknowledgements, affected Streamdex files and profile manifests | Local settings, install receipts and backups. The installer uses the current user's home directory; it has no creator-specific home path. |
| Optional lighting | User-configured light endpoints | GET/PUT requests on port 9123 containing light settings, not task text. No real light addresses are shipped. |

The repository has no file-crawling or upload script for personal Documents, Desktop or photo libraries. Project paths are read from Codex state for labels and target checks; the plugin does not crawl the project contents. Content already recorded by Codex can nevertheless appear in the rollouts that Streamdex reads locally.

The code also includes a local Codex app-server helper for account-usage information; Codex may make its own authenticated service requests. The supplied layouts do not expose the usage action. This is separate from the local Stream Deck WebSocket connection and the optional light requests.

The SDK writes local logs beneath the installed plugin's working directory. Error messages or subprocess diagnostics can include paths or app details. Those logs are excluded from the release allowlist, and packaging must start from the reviewed source tree, never from a copy of a running installation. Treat generated logs, read ledgers and backups as private.

## Local controls and visible data

“Local” describes Streamdex’s task-state access and app controls. It does not describe where Codex processes prompts, tool output, or Voice audio. Codex’s own account settings, service terms, data handling, and organizational controls still apply. Installing Streamdex does not grant permission to share work data with a service or bypass an organization’s software policy.

Task/project names and status are visible on the deck and phone. The read ledger records acknowledgements, not approval of the work. Protect runtime state and backups as local work data. Use fictional tasks when demonstrating the setup; review every screenshot and recording before sharing it. Microphone and speaker toggles control the Codex Voice session independently, not other applications.

## Sharing your own experiments

Use fictional tasks in any adaptation or demonstration you choose to share. Review screenshots, recordings and excerpts for names, paths, account identifiers, task content and environment values. Do not publish entire diagnostic archives or restricted build details. These are privacy precautions for your own use; no support or diagnostic review is offered.
