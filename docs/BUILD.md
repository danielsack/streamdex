# Build and review

## Source

The baseline is Todd Dailey's MIT-licensed streamdeckcodex v0.2.4, with the exact upstream revision recorded in PROVENANCE.md. The TypeScript/native foundation lives in src and native. The custom controllers are JavaScript modules in src/custom, bundled with the TypeScript entry point. Never patch the generated plugin.js.

Developers need Node 24+ and the pinned npm dependencies. Full builds also need Apple Silicon macOS and command-line developer tools for Swift. The end-user kit includes compiled production helpers. The full/native build produces `.build/test-bin/codex-ui-control` with `STREAMDEX_TESTING` enabled for fixture tests. That executable is excluded from release packages; production commands reject unsupported input before accessing a running app.

Start with the quick checks.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check:quick
```

`check:quick` typechecks, checks documentation links and runs `npm test`. The default test command runs the fast TypeScript unit and custom controller suites. It does not compile Swift, create a package or run installer tests. `npm run test:tasks` and `npm run test:voice` narrow the checks further. Test data comes from fictional fixtures; the store test no longer discovers an installed Codex database.

Choose the build command for the component you changed.

| Command                  | What it rebuilds                                            |
| ------------------------ | ----------------------------------------------------------- |
| `npm run build:js`       | JavaScript bundle, icons and license notices                |
| `npm run build:native`   | Production Swift helpers, setup tool and native test helper |
| `npm run build:profiles` | Generated profile source and profile archives               |
| `npm run build`          | All of the above, with no incremental cache                 |

Partial builds are for iteration. They do not update package checksums or establish that an installable kit is current. Run `npm run pack` after rebuilding changed payload components, then audit the exact staged kit before pushing it.

Run the full check for build/test infrastructure changes or before an authorized candidate installation.

```sh
npm run check:full
```

GitHub's required Build and test job uses this command. It runs typechecking, documentation links, audit regression tests, a full source rebuild, packaging, version checks, every TypeScript/native fixture and custom controller/installer test, and the final artifact audit. `npm run check` remains an alias for this full check. Packaging runs before installer tests because those tests verify the generated checksums. Do not repeat the full local check after unrelated small edits when relevant checks already pass; CI still verifies the complete PR.

`npm run test:all` runs both TypeScript projects and all custom tests against the current build. `npm run test:custom` runs every custom test; `npm run test:install` selects installation, profile and version checks. These commands need current native binaries and packaged checksums where applicable. `npm run test:audit` runs only the auditor's disposable-fixture tests.

Before every push, audit the reviewed index. `npm run audit:source -- --staged` checks source and the checked-in payload without requiring an outer ZIP, and is sufficient when source/tests/docs change without changing that payload. `npm run audit:local -- --staged` additionally verifies the generated release kit and is required when payload artifacts change. Use full local candidate verification before an authorized installation; source-only auditing does not approve a release or replace a kit audit.

Set DEVELOPER_DIR if your installed developer toolchain is somewhere else. No Apple Developer subscription or notarization credentials are used. The build applies ad hoc signatures, emits no source maps, and maps compilation paths to a neutral prefix. Dependency versions and integrity hashes are locked in package-lock.json.

Profile source is generated from scripts/generate-profiles.mjs with stable, synthetic identifiers and no device serials. Profile archives use the standard .sdProfile root. The release-file allowlist is explicit; a new file requires review before adding it. Packaging and audit inspect nested profile/plugin archives.

Build outputs may vary with Swift, SDK and compiler versions; the source build is repeatable but is not claimed bit-for-bit reproducible across toolchains. Every distributed output gets its own checksum and audit.

## Candidate versions

Follow [VERSIONING.md](VERSIONING.md) to prepare a new candidate. Build and packaging derive all versioned metadata and filenames from package.json. Run `npm run check:version` to verify the checked-in fields; CI also checks them before rebuilding.

## Media and demo

The existing illustrated film was cut to remove the personal statistics and unsupported retry scene, with a Streamdex closing card. The public MP4 is silent H.264, 1280 × 720 at 24 fps, with captions supplied separately. It is encoded with the slow preset, CRF 25, YUV 4:2:0, stripped source metadata and fast-start MP4 layout. Its content and timing are preserved from the reviewed 1080p film. The README hero is a 4.8-second, 800 × 450 GIF at 10 fps using a 128-color palette. It plays once, offers a static alternative, and selects the poster for reduced motion. The full video remains linked and plays in the standalone demo. GitHub requires an uploaded video attachment for its native inline player; reducing a repository MP4 alone does not turn a Markdown link into a player. The original media and its private working notes are not distributed. The photo has metadata-free 360 × 360 (README) and 886 × 886 (hardware guide) JPEG derivatives. Neither embeds the source file's EXIF, GPS, thumbnail, or other personal metadata.

The README's task-state and Voice GIFs reuse the shipped SVG button renderers with fictional data. The dial guide is original vector artwork. Their source is scripts/render-readme-frames.mjs.

```sh
node scripts/render-readme-frames.mjs
```

This writes SVG frames and a duration manifest under .build/readme-frames. Rasterize them at their declared dimensions in a browser, then encode with a shared 256-color palette and the recorded durations. Omit the GIF loop extension so each sequence plays once. The linked PNG alternatives remain static. No browser capture or intermediate frame directory belongs in the release allowlist.

The procedural Three.js model and accessible controls run without a server or remote dependencies. For local review, serve only docs on loopback or open docs/demo/index.html. The model is an illustration, not hardware CAD and not a live Codex connector.

## GitHub checks and demo hosting

GitHub Actions runs Build and test on pull requests and pushes to main, with manual checks available. It verifies committed source and payload integrity before rebuilding on an isolated macOS Apple Silicon runner. That job has read-only access and uploads no artifacts. Fork workflows require approval.

After Build and test succeeds on a push to main, Publish demo exports only tracked files from docs/index.html, docs/demo, and docs/assets, plus LICENSE. It uploads that static site with a one-day artifact retention and deploys through the main-only github-pages environment. GitHub-owned actions are pinned to commit IDs. Pull requests and manual check runs never deploy.

The [interactive demo](https://danielsack.github.io/streamdex/demo/) is hosted on GitHub Pages. To update it, use the normal pull-request workflow. The site has no backend, account access, microphone access, analytics, or CDN dependencies. Plugin binaries, installer packages and local state are not included in the website.

Publishing the browser demo does not establish hardware compatibility or publish an installable release. Those checks remain in [VERIFICATION.md](VERIFICATION.md).
