# Install with ChatGPT Work / 用 ChatGPT 工作模式安装

This guide is executable installation guidance for a later, explicitly requested installation. Packaging this release does not authorize running these cloud steps. 当前发行包只在本地准备；下列云端步骤留给用户以后明确发起安装时执行。

## 1. Read and verify / 读取并核验

Use the fixed **public repository commit** URL supplied in the installation prompt, not a moving branch or another developer's private Site. Read this guide, `RESOURCES.md`, `manifest.json` and `PROVENANCE.json`. Retrieve all manifest-listed files at that same commit, preserving directory layout, plus the manifest and sibling checksum. Verify the exact file set, byte sizes and SHA-256 before modifying any target. Do not mix current `mcp/` at the repository root with this versioned `mcp/`.

The package includes `verify.py`; run `python verify.py .` inside the extracted package with its sibling manifest checksum available. Use the fixed Git commit as the trust anchor; a checksum does not establish publisher identity on its own.

If opening an App-prefilled prompt lands on **聊天 / Chat**, switch to **工作 / Work** before sending; the existing POC confirmed the text is retained. Use the intended owner account/workspace. Check available Sites/private-storage/protected-secret and plugin-update capabilities; if one is unavailable, report the exact missing step rather than inventing a tool, ID or successful result. Never change ChatGPT permissions to allow all actions.

## 2. Reconcile or create / 查重后新建

Use **`sayso` as the requested URL slug** and **`SaySo` as the Site/App display title**. The spelling and descriptions for first-time App creation are authoritative in this release manifest's `app_presentation` and both `plugins/sayso/` presentation manifests. Read these before provisioning the new App; do not inherit historical POC metadata. First find the intended owner's existing private `sayso` installation in the current account/workspace and private installation ledger. Reuse it when ownership and identity match. If multiple candidates or ownership ambiguity remain, resolve the specific target before a write. Do not create a duplicate because a prior deployment response is uncertain.

For a new installation, create a private Site with slug `sayso` and display title `SaySo` through the supported Sites workflow. Retain its returned project ID, HTTPS origin, database, bucket and canonical plugin identity privately. Follow `RESOURCES.md` to create its D1 `DB` and private R2 `BUCKET`. Never use another owner's service or bindings.

## 3. Bind source and protect secrets / 配置源码和密钥

Use the release's `mcp/` as the service source root. Its hosting manifest deliberately has no developer project ID. Bind this source to the Site's actual project/origin, preserving `DB`, `BUCKET` and MCP declarations, using the included helper:

```sh
node --experimental-strip-types scripts/configure-self-hosted.mjs --project-id <OWN_SITE_PROJECT_ID> --origin <OWN_SITE_HTTPS_ORIGIN>
```

Arguments are the actual non-secret project ID and origin returned for **this** installation; do not print/store them in public evidence. The helper writes the hosting project ID and replaces the runtime origin placeholder. It does not deploy. This pinned version uses `lib/bridge-runtime.ts`'s `publicOrigin`; merely inventing a `SAYSO_PUBLIC_ORIGIN` environment variable does not configure it. Never deploy `https://YOUR-SITE.chatgpt.site` as a real origin.

Generate/issue the private-Site access credential (门禁卡) through the platform's supported private-ingress mechanism and store it through protected Site secrets/configuration. Generate three distinct 32-byte CSPRNG hex keys for the exact environment names in `RESOURCES.md`; set them as Site runtime secrets, never source constants. Preserve the distinction between platform access credentials and Worker signing/maintenance keys. Report only that each is configured, never its value. If secure issuance/transfer is unsupported, stop at `needs_platform_secret_capability`; do not route a credential through the chat transcript.

## 4. Initialize and deploy / 初始化和安装

Apply all 29 SQL files `0000`–`0028` in order to the Site's own D1 through the supported database workflow. The metadata journal alone omits the last three migrations; use the explicit SQL inventory and private applied-migration ledger. Verify the three terminal-text privacy triggers exist. Do not initialize by copying production databases, phone data or private configuration.

Use Node >=22.13, install locked dependencies (`npm run install:ci`) and run `npm test`, `npm run typecheck`, `npm run contracts:check`, `npm run source:check`, `npm run build`. Keep the sibling `plugins/sayso/skills/` available for joint service/skill tests. Production build must pass its diagnostic exclusion check. Configure protected retention maintenance per `RESOURCES.md`; report a missing scheduler explicitly.

Deploy only through the owner's supported Sites source workflow. Wait for terminal deployment status and retain the actual deployment identity/source version privately. Do not infer deployment success from a repository save or local build. Keep private ingress authenticated and use production MCP `/mcp`.

## 5. Attach the seven skills / 安装配套技能

Sites supplies the canonical plugin for this Site. Read **that plugin's** current manifests and preserve its identity, App dependency, audience and permissions. Overlay the seven directories from this release's `plugins/sayso/skills/` through the supported plugin-update workflow. The developer `.app.json` is excluded. Both owner-neutral presentation manifests are included and have matching SaySo name and neutral descriptions. They are the metadata specification for a NEW App. They contain no developer App dependency. After Sites provisions the canonical App/plugin, retain the platform-returned IDs and App binding when applying skills. Do not overwrite those IDs with the neutral templates. If the supported creation route cannot set/read back the specified descriptions, report `needs_app_metadata_creation_capability`; a local manifest alone is not proof the App metadata is live. `update_plugin` on an existing App-backed plugin is not an App-description editor. Do not create a duplicate MCP wrapper or publish a public plugin listing.

The directories are `sayso-control`, `sayso-onboarding`, `sayso-open-app`, `sayso-click-at`, `sayso-type-text`, `sayso-scroll-view`, `sayso-drag-to`. When upgrading, remove only the obsolete SaySo-owned `sayso-control/references/compatibility.md` and `google-maps-live.md` if present; an overlay does not delete old files. Preserve unrelated user files. Save through the supported release/update mechanism and distinguish saved skills from verified activation. A local package does not establish Live voice skill activation.

## 6. Read-only self-check / 只读自检

Verify authenticated MCP initialization reports `serverInfo.name = sayso`, `version = 0.13.256`. Check the production tool catalogue, then call **`get_control_guide` with `{"workflow":"overview"}` through the installed canonical plugin**. This returns instructions without inspecting a phone, requesting capture, accessing hardware or granting readiness. Expect a successful structured tool result with the Stop/T6 guidance. An empty or failed response is not acceptance. This smoke check verifies service/plugin reachability; it does not by itself test live D1/R2 usage or phone operation. Verify resource binding and migrations separately using the platform's database/storage inspection tools.

Do not call `read_screen`, create a pairing code, redeem a token, start sharing, send input or flash firmware for installation self-check. Device setup is a later user-authorized action. In this version production L06 `create_pairing_link` and `/pair` are absent; do not claim an automatic return-to-App connection flow. Report `service_ready_phone_handoff_required` when service and skills are installed but the phone handoff remains incomplete.

## 7. Update an existing Site in place / 原地更新

1. Verify the same owned `sayso` Site and canonical plugin. Record previous deployment/source versions privately and preserve the Site project/origin, DB, bucket, valid secrets, device registrations and unrelated plugin files. Do not re-pair, rotate valid keys, recreate resources or reset data as part of an update.
2. Arrange a user-approved quiet window if control is active; do not perform device actions as an installer test. Back up through the owner's private database workflow, with no credentials/data entering the package or chat. Inspect the actual migration ledger/schema; apply **only missing SQL in order through 0028**. If old code or schema cannot be identified safely, resolve that gap before writing.
3. Stage a fresh copy of this pinned package, bind the actual existing project/origin using its helper, and retain existing protected runtime configuration. Add only missing required secrets through protected tools. Do not use another bound working tree or a development branch. Validate/build/deploy and check the terminal result and MCP runtime version.
4. Update the same plugin's seven skills and delete only the two identified obsolete SaySo references if needed. Repeat the read-only guide self-check. Keep device/firmware/phone handoff state separate from service installation.
5. If deployment status or an old input outcome is uncertain, query the original operation/command ID. Do not retry input with a new key. A frame-key rotation changes text-HMAC comparisons; rotation needs its own explicit recovery plan. Code rollback must preserve migrated data and use schema-compatible code; never reverse privacy migrations or restore private plaintext as a routine rollback.

最终只汇报实际版本、服务/技能/存储/维护调度的验证状态和剩余步骤。密钥、门禁卡、设备令牌不显示。手机完整安装、屏幕共享、控制和语音效果未经实测时，不报“全部连接完成”。

## Fresh-install constraints / 全新安装约束

Confirm the old installation was deliberately removed by its owner; this guide never deletes it. A new Site has new project/App/plugin identities and empty D1/R2. Even when the old slug is available, do not reuse its credentials or assume the previous HTTPS address is unchanged. Official Sites documentation does not promise immediate deleted-slug reuse; if `sayso` is unavailable, stop and ask the owner to wait or explicitly choose another slug. Record the actual returned origin privately and rebind all clients. Never change approval defaults as an installation step.

Service runtime remains 0.13.256; this release label distinguishes Site 244 source from the older package with the same runtime number. Check source provenance and skill version 1.2.49 as well as MCP version. Production L06 pairing and first-time C124 button pairing remain unavailable. Assisted DEBUG cloud/board import is a separate, user-present operation; no production one-click pairing is claimed.
