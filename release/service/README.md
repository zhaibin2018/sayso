# SaySo service release index / 服务发行包索引

**Local preparation only, 2026-11-20.** This release has not been pushed or deployed. Claude review and a separate explicit publication instruction are still required. The fixed links below will become usable only after the reviewed commits are published; their existence is not claimed on GitHub today.

| Component | Pinned version/source |
|---|---|
| Package | `v0.13.256` |
| Public package commit | `82b723d06072cd15e1cc2cdbe8541573d30e1f52` |
| Worker source | `f654165f7fae443ce219bfa21e1177913744bb15`, runtime `0.13.256` |
| Plugin skill source | `6347afc3535caed18366b343e2919290d96dcfa7`, version `1.2.45` |

Package: [v0.13.256](v0.13.256/). Read its `README.md`, `INSTALL.md`, `RESOURCES.md` and `VALIDATION.json`. Every package file is hashed in `manifest.json`, except the index itself, whose digest is in `v0.13.256.manifest.sha256` and the fixed Git tree. Never mutate an existing version directory; publish a new version for source changes.

## One-sentence installation prompts / 一句话安装指令

Open **ChatGPT Work / 工作** in the intended account before sending. If an App-prefilled prompt lands in Chat / 聊天, switch to Work first. The Site name is exactly `sayso`; service installation and phone handoff have separate acceptance states.

中文：

```text
请按 https://github.com/zhaibin2018/sayso/blob/82b723d06072cd15e1cc2cdbe8541573d30e1f52/release/service/v0.13.256/INSTALL.md 安装或原地更新我的私人 Site sayso，自动配置密钥和配套技能，不显示凭证。
```

English:

```text
Install or update my private Site sayso using https://github.com/zhaibin2018/sayso/blob/82b723d06072cd15e1cc2cdbe8541573d30e1f52/release/service/v0.13.256/INSTALL.md, configuring secrets and its skills without displaying credentials.
```

The pinned source does not yet implement production L06 `create_pairing_link` / `/pair`. Full real SaySo mobile installation, credential handoff, sharing and hardware acceptance remain unverified. The guide ends service installation with an authenticated, non-device `get_control_guide` self-check and an honest handoff state. This source package contains no runtime credentials, native iOS App or firmware implementation.
