# SaySo service release index / 服务发行包索引

**New candidate: local review only, November 20, 2026. No push or deployment.** The new links below will be usable only after Claude review and a separate publication instruction. Their presence on GitHub is not yet verified.

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

Open ChatGPT **Work / 工作** in the intended owner account and send the instruction yourself. A prefilled Chat prompt should be switched to Work first. Do not delete an existing installation as part of this prompt. If the requested slug is unavailable, pause for its owner to decide; immediate deleted-slug reuse is not guaranteed.

中文：

```text
请按 https://github.com/zhaibin2018/sayso/blob/ccc8b913c2e04162d5cc3d251fcdb650cec2e969/release/service/v0.13.256-site244-plugin1.2.49/INSTALL.md 全新安装我的私人 SaySo（slug 请求 sayso，显示名 SaySo），使用 manifest 的新名称和简介，自动配置配套技能与受保护资料，不显示凭证；旧安装由我另行移除。
```

English:

```text
Follow https://github.com/zhaibin2018/sayso/blob/ccc8b913c2e04162d5cc3d251fcdb650cec2e969/release/service/v0.13.256-site244-plugin1.2.49/INSTALL.md to install a new private SaySo Site (requested slug sayso, display title SaySo), use its manifest presentation, configure its skills and protected settings without displaying credentials; I handle removal of the old installation separately.
```

Source-only acceptance: 994 tests passed; both website integrated builds passed 58 tests; manifest and credential-pattern verification passed. Full mobile setup, new App metadata provisioning, approval defaults and InstructionAttempt remain unverified. Production L06 `/pair` and first-time C124 button pairing are absent; assisted developer handoff remains necessary.

## Historical package

The previously published [v0.13.256](v0.13.256/) remains unchanged at `82b723d06072cd15e1cc2cdbe8541573d30e1f52` (Worker `f654165`, skills 1.2.45). Its runtime is also 0.13.256; it is not the fresh-install candidate above. Do not overwrite immutable release directories or mix their source files.
