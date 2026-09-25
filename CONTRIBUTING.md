# Contributing to the experiment

Streamdex is an experimental snapshot, shared for others to explore or adapt. Contributions can be proposed, but no support, review, response, merge, or ongoing maintenance is promised. There is no roadmap commitment.

## Branches and pull requests

Use GitHub Flow. `main` is the shared baseline; make each change on a short-lived branch. There is no separate development branch. Fork the repository if you do not have write access, and use names such as `feat/task-filter`, `fix/stale-target`, `docs/setup`, or `chore/build-checks`.

Open a pull request into `main`, or a draft while it is still in progress. Keep one purpose per PR. Explain the problem and final behavior, include the checks you ran, and call out unverified hardware behavior. A prior issue is optional. The issue forms are for reproducible defects and focused proposals, not setup or support requests.

PRs must pass **Build and test**, be up to date with `main`, and resolve review conversations before merging. Only squash merges are enabled; merged branches are deleted automatically. Force pushes and deletion of `main` are blocked. There is no mandatory approval count, so the sole repository owner can merge their own work; repository write permissions still control who can merge. Outside contributions are subject to review when someone chooses to review them.

Use a clear PR title that describes the result; it becomes the squash commit title. Do not include private task titles, paths, or account details in branch names, commits, issues, or PRs. Use a public-safe Git commit email (GitHub's privacy settings provide a noreply address). Preserve copyright and third-party license notices, and only contribute material you have the right to share under the project's MIT license.

## Versions and changelog

Add user-visible changes to [CHANGELOG.md](CHANGELOG.md) under Unreleased. Candidate versions are prepared in a focused PR using [VERSIONING.md](docs/VERSIONING.md); merges do not automatically create releases. Keep package, plugin, profile, and payload versions aligned and never reuse a published tag.

## Local setup and checks

Read [AGENTS.md](AGENTS.md), [BUILD.md](docs/BUILD.md), and [PRIVACY.md](docs/PRIVACY.md). Install the pinned dependencies and run the quick checks.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check:quick
```

`check:quick` runs typechecking, documentation links and the fast tests. `npm test` and `npm run test:fast` run the TypeScript unit tests and custom controller tests without compiling Swift or packaging the plugin. Choose the checks for the area you are changing.

| Change                                           | Local checks                                                  |
| ------------------------------------------------ | ------------------------------------------------------------- |
| Task navigation, status, questions or read state | `npm run test:tasks`                                          |
| Voice or dictation                               | `npm run test:voice`                                          |
| Installation, profiles or rollback               | `npm run test:install` (requires a current build and package) |
| Documentation only                               | `npm run check:docs` and the staged source audit              |

Run the tests relevant to a change while iterating. Add a regression test for a defect or an important behavior change. Broaden the checks when shared code, failures or unresolved risks justify it; do not repeat a passing full suite for every small edit.

GitHub's required **Build and test** job runs `npm run check:full` for every PR, including documentation changes. That command rebuilds every component, packages the plugin, runs all test groups, checks versions and audits the result. `npm run check` remains an alias for the full check. Use the full check locally for changes to build/test infrastructure and before an authorized candidate installation. Full checks require Apple Silicon macOS and its command-line developer tools. Routine changes do not need a duplicate full local run solely to submit a PR.

Use `npm run build:js`, `npm run build:native`, or `npm run build:profiles` to rebuild the component you changed. `npm run build` rebuilds all three. A partial build is not a verified installation candidate. See [BUILD.md](docs/BUILD.md) for the complete workflow.

When adding a distributable file, review it and add it to `release-files.json`. Regenerate affected checked-in artifacts from source and update their package/checksums with `npm run pack`; never edit the bundled `plugin.js` or copy files from an installed plugin. Before pushing, inspect `git diff` and audit the exact staged candidate. Use `npm run audit:source -- --staged` for source, tests or documentation changes that leave the payload unchanged. If payload files change, run `npm run audit:local -- --staged` against the rebuilt kit. Neither audit may be deferred until after a push.

## Tests and privacy

Add a regression test when changing target identity, request-specific holds, Voice state, read persistence, reasoning, package integrity, installation, or rollback. Use fictional tasks and disposable directories. Builds and tests must not modify the live plugin, start a real Voice session, grant permissions, or access a person's private files. Fixture commands belong only in the excluded test helper under `.build/test-bin`.

GitHub Actions runs on an isolated macOS Apple Silicon runner with read-only repository permissions. It checks the committed source and payload before rebuilding, uses pinned dependencies and action commits, and runs the full check command. Forked PR workflows require approval before execution. Build and test does not upload artifacts, install on real hardware, or publish releases. After it passes on a push to main, a separate Publish demo job uploads only the tracked static site and deploys it to GitHub Pages. Pull requests never deploy. Logs are public, so use fictional data even in failure messages. A successful CI run does not establish hardware compatibility or approve a release.

Do not include credentials, live profiles, task databases, personal paths, internal URLs, restricted product/build details, raw logs, or captures of real work. Keep sensitive security details private; [SECURITY.md](SECURITY.md) describes the experiment's limits. Follow policies and agreements that apply to your contribution. The project's personal-capacity statement does not establish rights to third-party material.

Keep per-request authorization explicit. Do not add global permission escalation, automatic security-warning confirmation, or publication controls to the default device actions.
