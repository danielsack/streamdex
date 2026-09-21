# Adapting the experiment

This is an experimental snapshot, shared for others to explore or adapt. No support is provided, and no review, response, or ongoing maintenance is promised.

When adapting it, read AGENTS.md, docs/BUILD.md and docs/PRIVACY.md. Use fictional fixtures, pinned dependencies and the explicit release allowlist. Preserve upstream license notices. Add a meaningful regression test for changed task targeting, Voice state, installation or rollback behavior. Do not update the live plugin as a side effect of tests or builds.

Keep source changes reviewable; regenerate packages from source and audit the resulting artifacts. Do not upload diagnostic or CI artifacts until they have been reviewed for private information.

Publish only material you have the right to share, and follow any policies or agreements that apply to your changes. Use obviously fictional names for synthetic models, tasks, projects and accounts. Do not include restricted product/build details, internal documentation or screenshots of real work. The project’s personal-capacity statement does not establish rights to third-party material.

Keep per-request authorization explicit. Do not add global permission escalation, automatic confirmation of security warnings, or publication workflows to the default controls. Production helpers must exclude fixture command handlers; tests use a separate helper under .build/test-bin.
