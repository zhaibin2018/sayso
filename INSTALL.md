# Current SaySo installation

Use the [installation page](https://zhaibin2018.github.io/sayso/install), pinned to `v0.13.259-20261121.1-plugin1.2.51`. It includes T92 and D1 placement migration 0035, with nine skills. After installation, return to SaySo and send Connect ChatGPT in a new Work conversation. Complete physical-phone and unattended-maintenance acceptance remain pending. Root source below is historical; do not mix it with the fixed package.

## 更新已装好的服务 / Update an installed service

2026-11-22，T89 安全整合补充；尚未打入新发行包。新装仍使用[安装页](https://zhaibin2018.github.io/sayso/install)选定的不可变包；不要修改已发布包的 INSTALL、manifest 或 ZIP。

1. **固定新旧版本。** 读回目标 Site 的部署 ID、已保存版本、完整源码 SHA、绑定与插件 release ID。找出当初安装的固定发行包，核验新旧包的外部 manifest SHA、ZIP SHA 和精确文件清单。只凭版本号或相同文件名不足以确认来源。
2. **先解释旧树。** 从 Sites 源码仓库读取线上提交的完整文件树，与旧包 `mcp/` 逐文件按字节比较，列出增加、删除、修改和散列。只有安装工具预期的、可复现的站点配置差异才可继续，例如 `hosting.json` 的真实 project ID、`bridge-runtime.ts` 的真实 origin。锁文件、绑定名或换行差异也必须逐项说明并重现；不是自动豁免。任何无法解释的业务差异、额外文件或缺失文件都停止并保留清单，先不部署、不迁移。
3. **保留真实历史。** 已安装站点由发行包生成，线上 SHA 不一定属于开发 Worker 的历史。核验通过后，在这个 Sites 仓库内以当前线上提交为父提交，将树更新为新固定包 `mcp/`，只重施已审查的站点适配。保留原项目、地址、D1、R2、有效密钥、环境和 canonical App/plugin；不复制旧整份 runtime 覆盖新版逻辑。不伪造共同祖先、不强推、不用合并提交掩盖差异。部署前审查新旧整树差异，确认每项都来自新固定包或已批准适配；远端变化则重读并停止旧候选发布。
4. **构建、迁移、部署。** 按固定包 INSTALL 完整性核验，安装必要的锁定依赖，生产构建一次并保留产物安全检查；源码没有额外修改时复用发行门禁。核对全部 SQL 清单与历史散列，通过 Sites 支持的迁移流程仅补跑未应用项；当前固定包为 0000–0035。Sites 发布流程会在上传 Worker 前处理迁移，不能删表、重置、重放旧迁移或直接改配对行来修错。当前有操作时先安排安静窗口；未获授权不替用户发停止或手机输入。通过原站点权限对应的发布流程保存/部署精确源码与产物，读回终态、源码 SHA、迁移结构及已应用环境修订。隐藏配置不等于缺失；不生成/轮换 SIWC。
5. **插件原地更新。** 读取现有插件文件和当前 release ID，以并发保护更新同一插件；仅改版本并覆盖新固定包的九个技能及其引用。保留平台 manifests 的 App/MCP、展示信息、权限、用户文件和共享范围；只删除发行说明明确淘汰的文件。读回版本和技能字节；保存成功与后续新对话激活分开报告。
6. **最小自检与记录。** 使用已有 canonical 入口做一次无设备访问的 guidance/discovery 自检，不读手机、不输入、不配对。只读 `sb_maintenance_state` 的 `id=1`、`d1_placement_json`（平台不提供任意 SQL 时，用原生只读行工具取这一行后投影这一列）；有值才报告 `region / colo / primary`，NULL 写“待有流量后再查”。不造业务流量测位置。记录完整新旧源码 SHA、部署 ID、插件版本、迁移证据和未验收项；已有连接无需重走新装配对。

**更新失败：** 先读回同一次部署和迁移状态，保留旧保存版本及原产物；不要重复创建、轮换密钥或改配对。只有确认旧代码兼容已经应用的增量 schema，才通过支持的发布流程退回该旧版本，数据库保留；迁移不自动倒退。兼容性或执行状态不明就停止，报告具体缺口。

English: Pin and verify both immutable releases. Compare every blob of the deployed Site commit against the original installed package before editing; stop on unexplained differences. An installation-generated commit can legitimately have a separate history from the developer Worker repository. Create the update on that Site commit, replacing source with the new fixed package and reapplying only reviewed Site configuration. Review the complete delta, preserve all identities, data, valid secrets and permissions, build once, apply only pending migrations through the supported Sites workflow, and publish the exact pushed source/archive without force. Overlay the nine skills into the same canonical plugin using its current release ID; preserve platform bindings and unrelated files. Read back deployment/source, plugin bytes/version, migration structure and environment revision. Use one harmless guide check, and read the placement singleton without generating phone traffic. A NULL placement means “check again after traffic.” Keep a prior saved version; redeploy it only after verifying compatibility with any applied schema additions. Never automatically reverse migrations or re-pair devices.


## Historical installation notes (superseded)

> **Security source update: MCP 0.13.249 (2026-11-18).** Versions before this snapshot have known stop and text-retention issues. Update before real control. Offline verification is complete; new-account/mobile setup and physical-phone acceptance are not established by this source release.
>
> **安全源码更新：MCP 0.13.249。** 更早的公开快照存在已知停止及文字留存问题；真实控制前请先更新。离线通过不等于手机安装或真机验收通过。

# Install your private SaySo service

**One entry, not silent authorization.** This guide is for ChatGPT Work to deploy the supplied MCP source into the user's own private Site and attach the supplied skills to that Site's existing plugin. It does not install the iOS app, flash firmware or approve phone control. New-account/iPhone end-to-end setup and automatic configuration handoff are not yet accepted.

## User instruction

Ask ChatGPT Work to follow the fixed-commit link to this guide, create or resume your private SaySo Site, deploy this version of the MCP service, install the seven companion skills into the same Site plugin, and guide you through necessary sign-in, permissions and phone pairing. Require it to reuse completed steps and report the verified state.

中文：请让 ChatGPT Work 按本指南的固定版本链接，在你的账号中创建或恢复私人 SaySo，部署此版本 MCP，为同一个 Site 插件安装配套的七个 Skill，并引导完成必要的登录、授权与手机配对；复用已有进度，按实际验证结果报告状态。

The README provides the copyable instruction with an immutable commit URL. Opening a draft is not sending it, and a deployed server is not a paired phone.

## 1. Check the environment and identify this installation

- Use the intended ChatGPT account/workspace. Confirm Work, Sites and Plugin Creator capabilities are available. The current personal Sites route requires an eligible paid plan; do not promise that a Free account can complete it. Explain missing capabilities and stop the dependent step rather than inventing tools or IDs.
- Confirm that the user has access to a compatible SaySo iOS build before promising phone setup. Public App Store availability and the iPhone compatibility matrix are still pending. Cloud source installation can be reported separately if the phone app is unavailable.
- Reuse a private installation ledger associated with this request. Record the pinned source commit, actual Site/App/plugin identifiers, current plugin release, deployment state, pairing progress and errors. Store it privately in the installation task; never put it in this public repository. Do not record long-lived credentials in the ledger or conversation.
- If the App supplies an installation request ID, protocol version and public key, preserve them. Do not generate a replacement identity for that phone or guess its callback target.
- Do not modify ChatGPT permissions to “Allow all actions”. Required sign-in, connection and on-screen approvals remain the user's choices.

## 2. Pin and verify the source

- Use the exact 40-character commit from the URL of this guide. If someone supplies a branch URL instead, resolve it once to a commit before fetching any source, and use that one commit throughout. Never mix main-branch files from different times.
- Download that public repository snapshot; a GitHub login is not normally required to read public source.
- Run `node scripts/verify-source.mjs` from the repository root. It checks SOURCE_MANIFEST.json against all covered files. Stop on a missing file or digest mismatch; do not regenerate the manifest to make a bad download pass.
- Read LICENSE.md, LICENSE_DETAILS.md, TRADEMARK.md and THIRD_PARTY.md. Preserve notices. This is source-available FSL software; third-party material retains its own licensing.
- Deploy `mcp/` as supplied. Do not ask a model to recreate the server from this prose or install unrelated similarly named projects.

## 3. Create or resume the user's private Site

- Follow the current Sites skill/runtime instructions. If this installation already has a verified owned project, resume it. Otherwise create one private Site and immediately retain the platform-returned project identity in its private checkout/ledger.
- The distributed `.openai/hosting.json` has storage/capability declarations but no developer project ID. Never borrow a project's IDs from old examples or another user's installation.
- Use the platform's actual expected origin for `SAYSO_PUBLIC_ORIGIN`. It must be this user's Site origin, not the GitHub Pages website and not a developer instance.
- Generate a fresh per-instance 32-byte random HMAC secret with a cryptographic random generator and configure `SAYSO_FRAME_PERMIT_HMAC_KEY_HEX` through private runtime environment tools. Never print the secret, place it in a URL, commit it, or copy it from another Site.
- Provision the declared D1/R2 bindings and database migrations through the supported Sites workflow. Preserve authenticated ingress. Do not make a private Site public to work around authentication.
- Install dependencies, run `npm test`, `npm run typecheck` and `npm run build` in `mcp/`. Save/push the actual source and deploy via the current Sites tools. A build alone is not deployment success; wait for a terminal platform result and retain its exact version/deployment identity privately.

## 4. Verify MCP and install skills into the same plugin

- Read the actual MCP connection details and canonical plugin ID created for the user's Site. Do not create a duplicate wrapper plugin and do not reuse any developer plugin/App ID.
- Verify authenticated MCP initialization/tool discovery and a harmless identity/readiness query. Do not move the pointer, type text, read an unshared screen or flash a board as an installation test.
- Read the canonical plugin's source/metadata and verify edit eligibility. Preserve its scope, audience, App connection, interface, prompts and other existing files.
- Apply the contents of `plugins/sayso/skills/` plus their license notices to the eligible existing plugin using its guarded update process. Use the just-read release ID for concurrency protection and an appropriate version bump. The repository's generic `plugins/sayso/plugin.json` describes a skills-only source bundle; it is **not** a replacement for the platform-owned App-backed manifest.
- Configure `sayso-onboarding` as the first-use skill only through the field/mechanism supported by the actual current platform. Consult current documentation rather than guessing manifest fields.
- Read back the saved skill files and confirm all seven names and their relative references. Verify their availability in a subsequent intended phone conversation; a successful upload alone does not prove activation.

## 5. Hand configuration to the correct phone

This is a separate acceptance gate. The phone needs both private-Site access and a device credential; being signed in to ChatGPT or having a pairing code alone does not prove background phone access.

- Use an authenticated, confirmed handoff supported by the actual SaySo build. Bind it to the installation request, phone public key, target Site and expiry. Encryption alone does not establish sender authenticity; verify origin and prevent replay.
- Long-lived tokens belong in device secure storage/private runtime configuration, never in the public repository, chat text, QR code or query string.
- A manual one-time pairing code is a recovery path only when that build's private-Site access is already correctly configured. Do not claim it solves the missing Site credential or publish a bypass token.
- The current consumer automatic handoff is not fully implemented/accepted. If the available build cannot safely receive both configurations, report `service_ready_phone_handoff_required`, explain the precise missing step and stop phone-dependent work. Do not silently switch hosting, weaken access, or report full success.

## 6. Sharing and control remain separate

- Start system screen sharing in SaySo, not in ChatGPT. The user confirms the actual receiver and the iOS system prompt.
- ChatGPT Voice uses the Live option where available. When ChatGPT asks for approval, the user must use the on-screen controls; spoken approval does not approve it.
- A user who only wants screen guidance does not need the control accessory. Hardware pairing, verified compatibility and control permission are additional gates for input. The DIY firmware installer remains independent and unavailable until a signed accepted release is supplied.
- Screen inspection only follows the user's sharing/request. Device actions require a specific user task and current control authorization; setup does not grant blanket action permission.

## 7. Report state and resume safely

Use concrete states: `needs_sign_in`, `needs_platform_permission`, `deploying`, `service_ready`, `skills_saved_activation_unverified`, `service_ready_phone_handoff_required`, `paired_waiting_for_share`, `screen_ready`, or `control_ready`. Only report a state when its evidence exists.

On retry, reconcile the existing Site, deployment and plugin release before creating anything. Resume the last uncompleted phase. Reissue an expired one-time code only when needed; preserve a still-valid installation identity. Unknown responses require checking the original operation, not automatically duplicating it. Explicit Stop/Cancel wins over recovery.

Public test status: this source snapshot and packaging can be checked offline. A clean new account's complete iPhone flow, real credential handoff and voice skill activation still require independent end-to-end acceptance. No fixed “one tap completes everything” promise is made.

## Update an existing private service / 更新已有私人服务

Reuse the existing owned private Site, database, bucket and canonical plugin. Do not redeem a new pairing code, recreate the Site, change device identity, replace a plugin binding or erase user data as part of a code update. Record the old and new source commit and deployed runtime privately.

1. Pin this source snapshot and verify its manifest. Compare existing owner configuration; preserve the Site origin, project identity and protected secrets. Do not print/export secrets. A valid existing signing key should be preserved: rotating it also invalidates comparison of existing text-request HMACs. Recover uncertain work by original command ID, never automatically send it again with a new key.
2. Stop current control before migration. Apply **all unapplied migrations in order through 0027** through the supported Sites database workflow. Migration 0026 removes text in terminal commands. Migration 0027 erases old unkeyed text digests, retains non-replayable request keys, and cancels pending old text commands or marks attempted input uncertain. Do not skip migrations or run a destructive reset.
3. Replace service code with `mcp/`, retaining actual private bindings and `SAYSO_PUBLIC_ORIGIN`. Configure a valid 64-hex signing key if absent/invalid. Build/test and deploy using the supported Sites workflow; verify the terminal deployment result and authenticated MCP initialization reports **0.13.252**. A repository update alone does not update an existing user Site.
4. Read the existing Site plugin and overlay the versioned companion skills without replacing its private manifests or App binding. Report actual deployed service and skill versions and all remaining phone/firmware setup gaps.
5. Verify stop and original-result recovery without sending new phone input. No physical control, payment, sending, deletion or firmware flashing is an installation smoke test.

中文：复用已有私人服务及其数据库、截图存储和原插件；保留私人配置和有效签名密钥。先停止控制，顺序执行尚未应用的迁移直到0027，再更新代码、部署并核对实际服务版本。不要重建配对或清空数据库。旧请求与换密钥后的请求不能自动换新键重发，应查原命令ID。仓库更新不会自动更新每位用户的私人服务。

### Retention in this snapshot / 本版数据保留

Terminal text is removed by database triggers immediately. Public command responses omit pending text. Expired pending text is ended/redacted by maintenance once over five minutes past its deadline; detailed command payloads/receipts are compacted after seven days. Minimal HMAC/idempotency/scope/order records remain; this is not full record deletion. Session stop removes cloud screen data, and device revocation removes command/session/request records and all image-prefix pages; device and hardware registration records and recent diagnostics are not promised erased by this operation.

Maintenance is opportunistic on engine-backed MCP calls, device heartbeats, stop and authorization changes, as well as image traffic. Without traffic or an independently configured authorized scheduler, idle abandoned text has **no guaranteed wall-clock deletion deadline**. Account deletion is not implemented. Existing backups may contain old text/digests and require their own retention policy. See `mcp/SELF_HOSTING.md` for protected maintenance configuration; no scheduler is activated by installing this source alone.

文字终态立即清除；过期未完成文字依赖维护清理，七天后压缩详细命令与回执，保留防重放和顺序证据。停止会话清除云端屏幕数据，撤销设备清除关联记录。永久闲置且没有外部调度时，无法保证清理期限；账户删除尚未实现。

## T6 companion guidance

Use service 0.13.250 with skills 1.2.41 for final-step handoff: do not click an irreversible final payment/order/send/delete/cancellation/transfer button; park using move_mouse_to, inspect the actual after-image, name the button and ask the user to tap. Hidden screens require stopping input. This is an AI soft rule, not a code-enforced block or C124 approval feature.

## Current guidance update

For runtime 0.13.251 use skills 1.2.42. Never interpret placeholder zero coordinates as a region-center selector: click_at accepts actual original-image pixel coordinates only. Omit bridge_session_id in stop_session to stop all owned ongoing sessions. Returned cleanup failures must be reported; cloud stop is not proof that iOS screen sharing ended. The shorter descriptions are offline-tested, not real-phone A/B accepted.

### Remove retired packaged skill references when upgrading

Before declaring the skill update complete, remove the old SaySo-owned files `skills/sayso-control/references/compatibility.md` and `skills/sayso-control/references/google-maps-live.md` from the existing plugin through the supported file-deletion workflow, if present. Verify these are the old packaged files; preserve unrelated user files, manifests and App bindings. An overlay alone does not remove stale files. Read back the resulting source and run the current reference check.

升级时，若旧插件仍包含上述两份SaySo自带参考文件，核对来源后通过支持的删除流程移除；只覆盖新文件不会清理残留。保留用户其他文件、manifest和App绑定，并读回核对。

Runtime 0.13.252 keeps skills 1.2.42. Both stop tools accept null, empty or malformed selectors as an owner-wide stop request and report that fallback. Valid UUIDs still address only their selected owned target. Do not treat a cleanup failure as completed stopping, and do not equate cloud stop with confirmed iOS sharing termination.
