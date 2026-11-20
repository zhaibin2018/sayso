# SaySo service 0.13.256 / 服务发行包

Pinned service source: `f654165f7fae443ce219bfa21e1177913744bb15`.
Pinned companion skills: `6347afc3535caed18366b343e2919290d96dcfa7` (1.2.45, seven skills).

Start with [INSTALL.md](INSTALL.md). Installation is for ChatGPT **Work / 工作** in the owner's account. The Site name must be exactly `sayso`. The service is a private Site with its own canonical plugin; no public plugin listing or duplicate wrapper is needed.

This is a source preview. Local packaging/build/tests do not establish a real new-user mobile installation, phone handoff, physical control, App availability or firmware acceptance. This version does not implement the L06 `create_pairing_link` / `/pair` production flow. Do not claim that flow is available.

## Contents

- `mcp/`: complete buildable service snapshot and its offline tests, schema and migrations.
- `plugins/sayso/skills/`: seven companion skills, with owner-neutral `plugins/sayso/plugin.json` presentation metadata for the joint tests; no developer account/App binding.
- `RESOURCES.md`: D1, R2, migration, runtime-secret and maintenance requirements.
- `PROVENANCE.json`: original Git-blob digests and every source transformation/exclusion.
- `SOURCE_DIFF.json`: comparison with the prior public source at the recorded public commit.
- `VALIDATION.json`: local software verification results and hashes of the retained local logs; no live installation or device acceptance is claimed.
- `manifest.json`: exhaustive file sizes/SHA-256 (excluding the manifest itself); the sibling `../v0.13.256.manifest.sha256` covers the manifest.
- `verify.py`: standalone inventory and credential-pattern verifier, identical to the repository helper at packaging time.
- `LICENSE.md`, `LICENSE_DETAILS.md`, `TRADEMARK.md`, `CONTRIBUTING.md`, `THIRD_PARTY.md`: inherited license and attribution boundaries.

Only three upstream service files are neutralized: the project ID is removed from `.openai/hosting.json`; developer identities/origins in `README.md` and `lib/bridge-runtime.ts` become placeholders. Runtime logic is unchanged. Plugin skills preserve the pinned Git bytes. The separate plugin presentation manifest retains the pinned bilingual text/version/author, changes its name to `sayso` and removes the developer App dependency, following the earlier public export. It is not an installable Site identity and must never replace the canonical plugin's manifests. The copied native Swift implementation fixture is omitted; no native App or firmware implementation is distributed. The TypeScript capability fixture and synthetic firmware-info JSON remain for offline service protocol tests. Optional checks against sibling native repositories are not part of standalone acceptance.

The service's distribution `.gitattributes` is also adjusted to preserve bytes (`-text`): some upstream Git blobs contain CRLF despite their old LF checkout rule. Retaining that rule would silently change hashes when committing or checking out on another platform. This packaging-only metadata change is listed separately in `PROVENANCE.json`; runtime code and test code stay unchanged. There are 357 included upstream files: 352 exact blobs, three identity-neutralized service files, one distribution-attributes file and one owner-neutral plugin presentation manifest.

The `mcp/package.json` scaffold version is `0.1.0`; the release version comes from `mcp/lib/runtime-identity.ts` and is **0.13.256**. Do not rewrite either upstream file to make their values match.

For local verification, from the public repository root:

```sh
python scripts/verify-service-release.py release/service/v0.13.256
```

Or, from inside a downloaded package, use `python verify.py .` with the sibling manifest checksum present. Verification does not modify package files. The scanner reports only file/category metadata; its single exact-hash exception is an upstream negative-authentication test with an intentionally invalid synthetic header, not an account credential.

Build a copy of **both** `mcp/` and `plugins/` under a fresh temporary release root, so service/skill joint tests resolve the supplied skills. In its `mcp/`, use Node >=22.13 and run `npm run install:ci`, `npm test`, `npm run typecheck`, `npm run contracts:check`, `npm run source:check`, `npm run build`. Keep dependency/build/runtime directories out of this immutable package. Never deploy, access a private Site or invoke device tools as a local packaging check.

For zero optional skill-layout skips, before testing copy the temporary root's `plugins/sayso/` to `plugin/` as well. One pinned upstream test resolves only that original sibling path; the other joint tests support the public layout. Both copies contain only this package's same skill bytes and neutral presentation metadata. Do this only in the temporary validation directory, not in the immutable package. No test source or runtime source needs modification.

安装指令的中英文固定提交链接见上一级目录的 `README.md`。本次仅本地准备，尚未推送；链接要等评审与另行授权发布后才可供用户安装。
