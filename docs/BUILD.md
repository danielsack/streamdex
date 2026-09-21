# Build and review

## Source

The baseline is Todd Dailey's MIT-licensed streamdeckcodex v0.2.4, with the exact upstream revision recorded in PROVENANCE.md. The TypeScript/native foundation lives in src and native. The custom controllers are JavaScript modules in src/custom, bundled with the TypeScript entry point. Never patch the generated plugin.js.

Developers need Node 24+, the pinned npm dependencies, and macOS command-line developer tools for Swift. The end-user kit includes the compiled production helpers. The build also produces .build/test-bin/codex-ui-control with STREAMDEX_TESTING enabled for fixture tests. That test executable is excluded from every release package; production commands reject unsupported input before accessing a running app. Build on Apple Silicon:

```sh
npm ci
npm run build
npm run typecheck
npm test
npm run test:custom
npm run pack
npm run audit:local
```

Set DEVELOPER_DIR if your installed developer toolchain is somewhere else. No Apple Developer subscription or notarization credentials are used. The build applies ad hoc signatures, emits no source maps, and maps compilation paths to a neutral prefix. Dependency versions and integrity hashes are locked in package-lock.json.

Profile source is generated from scripts/generate-profiles.mjs with stable, synthetic identifiers and no device serials. Profile archives use the standard .sdProfile root. The release-file allowlist is explicit; a new file requires review before adding it. Packaging and audit inspect nested profile/plugin archives.

Build outputs may vary with Swift, SDK and compiler versions; the source build is repeatable but is not claimed bit-for-bit reproducible across toolchains. Every distributed output gets its own checksum and audit.

## Media and demo

The existing illustrated film was cut to remove the personal statistics and unsupported retry scene, with a Streamdex closing card. The public MP4 is silent H.264, 1280 × 720 at 24 fps, with captions supplied separately. It is encoded with the slow preset, CRF 25, YUV 4:2:0, stripped source metadata and fast-start MP4 layout. Its content and timing are preserved from the reviewed 1080p film. The README hero is a 4.8-second, 800 × 450 GIF at 10 fps using a 128-color palette. It plays once, offers a static alternative, and selects the poster for reduced motion. The full video remains linked and plays in the standalone demo. GitHub requires an uploaded video attachment for its native inline player; reducing a repository MP4 alone does not turn a Markdown link into a player. The original media and its private working notes are not distributed. The photo has metadata-free 360 × 360 (README) and 886 × 886 (hardware guide) JPEG derivatives. Neither embeds the source file’s EXIF, GPS, thumbnail, or other personal metadata.

The README's task-state and Voice GIFs reuse the shipped SVG button renderers with fictional data. The dial guide is original vector artwork. Their source is scripts/render-readme-frames.mjs:

```sh
node scripts/render-readme-frames.mjs
```

This writes SVG frames and a duration manifest under .build/readme-frames. Rasterize them at their declared dimensions in a browser, then encode with a shared 256-color palette and the recorded durations. Omit the GIF loop extension so each sequence plays once. The linked PNG alternatives remain static. No browser capture or intermediate frame directory belongs in the release allowlist.

The procedural Three.js model and accessible controls run without a server or remote dependencies. For local review, serve only docs on loopback or open docs/demo/index.html. The model is an illustration, not hardware CAD and not a live Codex connector.

## Publication boundary

Do not enable GitHub Actions, upload media, push any branch/tag, publish a release, or deploy Pages until the exact local candidate passes review and its owner approves publication. After an approved first source push, review CI logs and artifacts before release publication. Pages would serve docs, with the demo at /demo/.
