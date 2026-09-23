# Versions and change history

Streamdex uses [Semantic Versioning](https://semver.org/) and keeps a [changelog](../CHANGELOG.md). The version in `package.json` is the source of truth. `main` remains the development branch; a merge alone is not a release.

While testing the first release, candidates advance as `0.1.0-beta.1`, `0.1.0-beta.2`, and so on. Batch reviewed changes into a candidate instead of bumping for every PR. Add user-visible changes under **Unreleased** as they land.

For stable `0.x` versions, use a patch increment for compatible fixes and a minor increment for features or breaking changes. Call out any breaking changes and migration steps. Once the project reaches `1.0.0`, increment major for incompatible changes, minor for compatible features, and patch for compatible fixes. These numbers describe compatibility, not a maintenance schedule.

## Preparing a candidate

```sh
npm run version:set -- 0.1.0-beta.3
npm run check
```

The example advances the current beta to the next candidate. Choose the appropriate next version; the command rejects decreases and reuse. It updates `package.json`, the root lockfile entries, and the plugin manifest. Move the relevant changelog entries into that version's section before running `check`. Build and packaging derive profile versions, embedded build metadata, payload version, and ZIP filename from the same source.

`npm run check:version` verifies committed version fields and the changelog. GitHub runs it before rebuilding, so a rebuild cannot hide mismatched checked-in files. Packaging and the release auditor verify the current version's ZIP rather than a hardcoded filename.

Stream Deck requires four numeric version components. A beta `X.Y.Z-beta.N` maps to `X.Y.Z.N`; stable `X.Y.Z` maps to `X.Y.Z.65535`, so installing the stable version upgrades the betas. Beta numbers must be 1–65534, and each of the first three components must be 0–65535. Other prerelease labels and build metadata are not supported by the helper. Profile identities stay unchanged across versions.

## Tags and releases

After the candidate passes review, CI, artifact/privacy audit, and the applicable [hardware checks](VERIFICATION.md), an approved release uses an annotated Git tag `vX.Y.Z` or `vX.Y.Z-beta.N` on the reviewed commit. Tags and published artifacts are immutable; corrections get a new version. Mark beta releases as prereleases in GitHub and include the changelog entry and checksums.

Creating a version or merging a PR does not create a tag, upload a package, or publish a GitHub Release. Those remain deliberate publication steps. The existing Pages workflow continues to publish only the static demo after main passes CI.
