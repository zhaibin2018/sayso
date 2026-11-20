# SaySo service: Site 244 / skills 1.2.49

Local candidate only. No push, deployment, installation or device acceptance.

Worker source: `2f6ba359587854470a9c08862791f4bf62ef5c66` (Site 244).
Runtime remains **0.13.256**. The immutable release directory adds `site244-plugin1.2.49` to distinguish the older same-runtime source package, which remains untouched.

The seven skills/references/agent descriptions come from the published **1.2.49** file readback. `PROVENANCE.json` records each input file digest, text normalization and owner-neutral transformation; its plugin Git commit is an ancestry reference, not a claim that the published readback was committed there.

Read [INSTALL.md](INSTALL.md), [RESOURCES.md](RESOURCES.md), `manifest.json`, `VALIDATION.json`. `mcp/` contains the exact pinned service/tests/migrations except listed identity and distribution transformations and the excluded native Swift implementation fixture. There is no native App/firmware source, production data or account binding.

For NEW App creation, use manifest `app_presentation`: **SaySo**, short description **iPhone 读屏和帮你点**, and the exact long description from both presentation manifests. Preserve the new canonical App/plugin binding after creation. The templates must never replace generated IDs. Existing App-backed plugin updates cannot edit App-owned descriptions; verify the real new App metadata before calling the install accepted.

Use `python verify.py .` with the sibling manifest checksum. For independent software checks, copy both `mcp/` and `plugins/` into a fresh temporary root; also copy `plugins/sayso/` to temporary `plugin/` for pinned upstream joint tests. Run the locked install, tests, typecheck, contracts, source budgets and build from temporary `mcp/`. Do not install dependencies into this immutable directory.

Full fresh mobile installation, approval-card behavior, Live activation, L06 phone handoff and first-time C124 pairing remain unverified. The guide self-check calls only the non-device control guide. Follow the existing FSL and third-party notices.
