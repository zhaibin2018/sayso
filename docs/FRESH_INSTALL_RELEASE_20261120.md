# Fresh-install source candidate, November 20, 2026

Local review only. No push, deployment, Site creation, plugin change, native installation or device operation was performed for this release.

`release/service/v0.13.256-site244-plugin1.2.49/` is a new immutable candidate. The earlier `v0.13.256/` remains untouched. Both report runtime 0.13.256; select by release label and provenance as well as runtime.

- Service source: exact Site 244 Git object `2f6ba359587854470a9c08862791f4bf62ef5c66`.
- Skills: published 1.2.49 file readback. The plugin Git commit in PROVENANCE is an ancestry reference; per-file input digests, LF normalization and transformations identify the actual distribution inputs.
- New App presentation: **SaySo**, short description **iPhone 读屏和帮你点**, and the exact neutral long description in both presentation manifests and manifest `app_presentation`. No developer account/App binding. These are the NEW App creation specification; canonical generated identities must be retained afterward. This does not establish that any platform App metadata has been changed.
- Local source-only checks: **994 passed, zero failed/skipped**, typecheck, contracts, source budgets and production build passed; tested source bytes match the package. Website working source and public export each passed **58 tests** and integrated assembly.
- Local SQLite: all **29** SQL migrations applied, **27** tables including SQLite sequence metadata, **three** privacy triggers. This is not deployed D1/R2 verification.
- Inventory: **385** indexed files plus manifest, SHA-256 `69819f31873712cedf53a57f20e4fbb9c044d37fe1200a6ea94195644f87e2ee`. Credential-pattern scan found zero actual matches; one exact synthetic negative-auth fixture is explicitly identified. Inventory tampering and independently re-indexed legacy App metadata were both rejected.

First full test run retained 991 passes and three failures. Two test-only packaging adaptations are recorded in PROVENANCE: normalize only the approved “control permission” → “tapping permission” terminology for the published Skill sentence, and avoid optional native sibling comparison when its excluded Swift fixture is absent. A timing-sensitive count assertion passed alone and in serial runs without changing its assertion or service logic. A pre-adaptation serial run retained 992 passes/two failures. The final serial run passed all 994. No service runtime source or runtime test assertion was changed to conceal a functional failure.

The self-verifier now derives runtime/skill versions instead of hardcoding the old Skill version, supports immutable release labels, and checks both presentation manifests. The source exporter accepts exact source refs and a local published-release readback input. Existing released packages are not regenerated.

Full mobile fresh installation, App metadata provisioning/readback, approval defaults, InstructionAttempt behavior, Live activation and hardware interaction remain unverified. Production L06 `/pair` and first-time accessory button pairing are unavailable in this snapshot. Assisted DEBUG handoff is separate from installation acceptance. Deleted-slug reuse has no verified timing guarantee; use the actual new platform-returned origin and identities.

Claude review and a separate user instruction are required before any later push. The parent private repository, website runtime and current private Site are not publication targets of this preparation.
