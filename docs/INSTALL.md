# Install and roll back

This is a staged candidate, not an approved release. Inspecting it is safe; live installation and physical testing require an explicit candidate-testing request until the release gates are closed.

## Prerequisites

Use macOS on Apple Silicon, English Codex UI, Stream Deck 7.1 or later, and Stream Deck+ or Stream Deck Mobile configured for 15 keys (5 columns by 3 rows). The kit's local agent must have terminal and file access on this Mac. No separate Node or Xcode installation is needed for the prebuilt kit.

From the extracted kit directory:

```sh
shasum -a 256 -c SHA256SUMS
./streamdex-setup inspect
```

The checksums detect damage or changes; obtain them from the reviewed distribution, since an attacker could replace both files and checksums. Inspect reports app availability, platform, kit integrity, and existing Streamdex profiles. It does not request Accessibility access or alter applications.

## Install

Choose exactly one preset:

```sh
./streamdex-setup install
./streamdex-setup install --light first-light.local
./streamdex-setup install --light first-light.local --light second-light.local
```

Replace example hostnames with your own Elgato light hostnames or IPv4 addresses. The helper validates at most two hosts, backs up existing Streamdex files, and opens the `.streamDeckPlugin` in the normal Stream Deck installer. Complete its dialogs, then run:

```sh
./streamdex-setup verify
```

Select **Streamdex+** or **Streamdex Mobile** for the corresponding device in the Stream Deck editor. Profile installation and behavior must still be checked on connected hardware; a matching installed-file hash alone does not prove that the device works.

Streamdex uses macOS Accessibility to read and press verified controls in Codex. Approve Stream Deck only through System Settings when needed. macOS may also ask for Automation permissions for the volume controls. Voice and dictation use Codex's microphone permission. Nothing silently grants permissions or records audio in the plugin.

The experimental binaries use ad hoc signing, not Developer ID notarization. Use only the normal macOS Open/Privacy & Security approval flow. If your Mac or organization blocks it, stop the installation. Do not disable Gatekeeper or remove quarantine to bypass protection.

## Replacing a local build and preserving data

The same installed build is left unchanged. A different build makes a fresh Streamdex-only backup before opening the installer. A pending installation must be completed and verified, or rolled back, before starting another one.

Configuration is in `~/Library/Application Support/Streamdex/config.json`, read acknowledgements in `read.json`, and installer receipts/backups alongside them. These are private local files. Updating profiles must preserve the read ledger. To change lights later, back up the config, edit only its `lights` array, and restart Stream Deck. An offline configured light never becomes a reasoning dial.

## Rollback

Quit Stream Deck normally, then run:

```sh
./streamdex-setup rollback
```

This restores the most recent pre-install Streamdex plugin, profiles and lighting configuration (or removes them if Streamdex was absent). It leaves unrelated plugins/profiles and your private read ledger alone. Backups are retained. Restart Stream Deck and select your previous profile.

For first-install failures, you can continue using your existing profile immediately. Do not delete your earlier setup or backups.

## Earlier experimental identities

This snapshot uses `io.streamdex.plugin`. Treat profiles from a different experimental plugin identity as a separate setup; action IDs are not interchangeable. If you installed an earlier kit, preserve it and use that kit's own rollback procedure before installing this one. No automatic identity migration is provided. Building this repository does not rename or alter a running installation.
