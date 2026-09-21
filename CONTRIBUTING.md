# Contributing to the experiment

Streamdex is an experimental snapshot, shared for others to explore or adapt. Contributions can be proposed, but no support, review, response, merge, or ongoing maintenance is promised. There is no roadmap commitment.

## Branches and pull requests

Use GitHub Flow: `main` is the shared baseline; make each change on a short-lived branch. There is no separate development branch. Fork the repository if you do not have write access, and use names such as `feat/task-filter`, `fix/stale-target`, `docs/setup`, or `chore/build-checks`.

Open a pull request into `main`, or a draft while it is still in progress. Keep one purpose per PR. Explain the problem and final behavior, include the checks you ran, and call out unverified hardware behavior. A prior issue is optional. The issue forms are for reproducible defects and focused proposals, not setup or support requests.

PRs must pass **Build and test**, be up to date with `main`, and resolve review conversations before merging. Only squash merges are enabled; merged branches are deleted automatically. Force pushes and deletion of `main` are blocked. There is no mandatory approval count, so the sole repository owner can merge their own work; repository write permissions still control who can merge. Outside contributions are subject to review when someone chooses to review them.

Use a clear PR title that describes the result; it becomes the squash commit title. Do not include private task titles, paths, or account details in branch names, commits, issues, or PRs. Use a public-safe Git commit email (GitHub's privacy settings provide a noreply address). Preserve copyright and third-party license notices, and only contribute material you have the right to share under the project's MIT license.

## Local setup and checks

Read [AGENTS.md](AGENTS.md), [BUILD.md](docs/BUILD.md), and [PRIVACY.md](docs/PRIVACY.md). Full checks require Apple Silicon macOS, the selected Xcode command-line toolchain, Python 3, and the Node version in `.nvmrc`. From the checkout:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

`check` typechecks, verifies documentation links, tests the release auditor, builds the Swift and JavaScript components, validates/packages the plugin, runs the full fixture and controller/installer suites, and audits the generated kit. Run `npm run test:fast` for the TypeScript unit-test inner loop, or `npm run test:audit` for the isolated Python auditor tests. Native fixture tests and installer tests require the build and package steps first. See [BUILD.md](docs/BUILD.md) for individual commands.

When adding a distributable file, review it and add it to `release-files.json`. Source changes that affect generated profiles or binaries must be built and packaged from source. Never edit the bundled `plugin.js` or copy files from an installed plugin. Before submitting, inspect `git diff`, run `npm run audit:local -- --staged` after staging, and check that the index matches the reviewed kit. Documentation-only changes need the documentation check and source audit; CI still runs the complete suite.

## Tests and privacy

Add a regression test when changing target identity, request-specific holds, Voice state, read persistence, reasoning, package integrity, installation, or rollback. Use fictional tasks and disposable directories. Builds and tests must not modify the live plugin, start a real Voice session, grant permissions, or access a person's private files. Fixture commands belong only in the excluded test helper under `.build/test-bin`.

GitHub Actions runs on an isolated macOS Apple Silicon runner with read-only repository permissions. It checks the committed source and payload before rebuilding, uses pinned dependencies and action commits, and runs the same local check command. Forked PR workflows require approval before execution. Build and test does not upload artifacts, install on real hardware, or publish releases. After it passes on a push to main, a separate Publish demo job uploads only the tracked static site and deploys it to GitHub Pages. Pull requests never deploy. Logs are public, so use fictional data even in failure messages. A successful CI run does not establish hardware compatibility or approve a release.

Do not include credentials, live profiles, task databases, personal paths, internal URLs, restricted product/build details, raw logs, or captures of real work. Keep sensitive security details private; [SECURITY.md](SECURITY.md) describes the experiment's limits. Follow policies and agreements that apply to your contribution. The project's personal-capacity statement does not establish rights to third-party material.

Keep per-request authorization explicit. Do not add global permission escalation, automatic security-warning confirmation, or publication controls to the default device actions.
