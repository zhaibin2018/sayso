# SaySo service release index / 服务发行包索引

**Current published package: `v0.13.256-site244-plugin1.2.49`.** Its immutable manifest/checksum was read back from the public commit on November 21, 2026. This documentation update is local only; it does not publish the new website or update a private service. Start with the [short installation page](https://zhaibin2018.github.io/sayso/install) after the website update is published. The package remains a development preview without production L06 pairing or T83 scheduled maintenance.

| Component | Candidate |
|---|---|
| Package | `v0.13.256-site244-plugin1.2.49` |
| Fixed package commit | `ccc8b913c2e04162d5cc3d251fcdb650cec2e969` |
| Worker | Site 244 source `2f6ba359587854470a9c08862791f4bf62ef5c66`; runtime 0.13.256 |
| Skills | Published 1.2.49 readback; seven skills |
| New App display title | SaySo |
| Short description | iPhone 读屏和帮你点 |

Read [v0.13.256-site244-plugin1.2.49/README.md](v0.13.256-site244-plugin1.2.49/README.md), INSTALL, RESOURCES, manifest and VALIDATION. The long description and both owner-neutral presentation manifests are checked against manifest `app_presentation`. Keep the canonical App/plugin IDs generated for the new Site. This is not an update to the existing App-owned description.

## One-sentence installation prompts / 一句话安装指令

Open ChatGPT **Work / 工作** in the intended owner account and send the instruction yourself. A prefilled Chat prompt should be switched to Work first. The short page selects the fixed package and checksum; change only that page when selecting a new release. Do not delete an existing installation as part of this prompt. If the requested slug is unavailable, ask the user to choose; never rename automatically.

中文：

```text
请帮我安装 SaySo：https://zhaibin2018.github.io/sayso/install
```

English:

```text
Please install SaySo for me: https://zhaibin2018.github.io/sayso/install
```

Source-only acceptance: 994 tests passed; both website integrated builds passed 58 tests; manifest and credential-pattern verification passed. Full mobile setup, new App metadata provisioning, approval defaults and InstructionAttempt remain unverified. Production L06 `/pair` and first-time C124 button pairing are absent; assisted developer handoff remains necessary.

## Next INSTALL draft

[NEXT_INSTALL_DRAFT.md](NEXT_INSTALL_DRAFT.md) is review-only and outside both frozen packages. It covers language-specific descriptions, the icon, owner-only scheduled maintenance with request-based fallback and the next phone handoff. Replace the official INSTALL only when A + T79 and maintenance changes have been merged, reviewed and repackaged with a new manifest. Do not execute the draft against the current package.

## Historical package

The previously published [v0.13.256](v0.13.256/) remains unchanged at `82b723d06072cd15e1cc2cdbe8541573d30e1f52` (Worker `f654165`, skills 1.2.45). Its runtime is also 0.13.256; it is not the fresh-install candidate above. Do not overwrite immutable release directories or mix their source files.
