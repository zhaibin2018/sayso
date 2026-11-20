# NEXT INSTALL — 草稿 / Not an executable release

2026-11-21 · 第一批 D / T81。**仅供下一次重新打包评审。不得覆盖当前固定包的 INSTALL、manifest、校验文件或源码，也不得让当前短链接执行本草稿。**

正式替换条件：A 的 L06、T79 和 T83/L04 维护接线合并并完成评审；从合并后的服务源码重新打不可变发行包，加入图标和中英文介绍，生成新的 manifest 和外部 SHA-256。核对实际迁移、工具、运行版本和配对契约后，将本文调整为该包的 INSTALL.md，并只更新官网短链接页的固定版本依据及能力说明。不能只改版本字符串或沿用 244 的源码/哈希冒充新版本。

## 1. 先核对条件，缺信息就问 / Reconcile first

在用户目标账号的 ChatGPT **工作 / Work** 中执行，遵循当前 Sites 和 Plugin Creator 技能、真实工具 schema。App 预填消息落在“聊天 / Chat”时，请用户先切“工作”再发送；不假定链接可以直接选中工作模式。

先查站点列表及本次私有安装记录，辨别目标账号、所有者、Site 和原插件：

- 没有同名 SaySo：视为全新安装，继续，不要求用户证明“旧安装已移除”。
- 有同名：问“已经有一个 SaySo，要更新它还是另装一个？” / “You already have SaySo. Would you like to update it or install another one?”，得到选择后才操作对应目标。多个候选只问区分目标所必需的问题。
- 查不到列表、所有权不明或能力不明：先用真实可用工具核对；仍判断不了就告诉用户缺什么并提一个具体问题，不直接退出整个安装，也不冒充确认。需要登录、授权或平台能力时说明用户下一步；等待期间不执行依赖该答案的写入。
- 默认请求 slug `sayso`。名字被占用就问“这个名字已经被用了，你想用 saysoapp 还是 sayso2，或另一个名字？” / “That name is taken. Would you like saysoapp, sayso2, or another name?”。**不自动换名、不自动加后缀、不删除或占用别人的 Site。** 用户选定后再申请；仍被占用就再次告知实际结果。

Keep a private resumable ledger of the pinned package, actual Site/App/plugin IDs, deployment, applied migrations and verification state. Do not put credentials or phone content in the conversation, public source, schedule or ledger. Reconcile uncertain responses before repeating creation/deployment. A user choosing an update authorizes updating that owned service; it does not authorize data deletion, key rotation or new phone input.

## 2. 固定发行包并核验 / Pin and verify

Read the **published short installation page** and take its exact immutable public commit, release path and manifest SHA-256 as the release selection. Fetch the raw manifest at that commit, verify its SHA-256 against the page, then fetch the listed files and sibling checksum at the same commit with their directory structure. Verify the exact file set, byte counts and digests using the packaged verifier before writing to a target. Do not combine root MCP source, moving branches or historical packages. Digest mismatch is a real integrity failure: explain it and stop deployment of those bytes; do not regenerate the manifest to bypass it.

Read that package's RESOURCES, PROVENANCE, license notices and supported runtime/build prerequisites. Preserve FSL and third-party notices. The public bundle must have no developer project/App binding, runtime credentials or phone data. Use only its packaged service and seven companion skills; do not reconstruct service code from prose.

## 3. 私人服务安装 / Install privately

Create or resume the user-selected **private** Site through the supported Sites source workflow. Retain its actual origin, project, DB, private bucket and canonical App/plugin binding. Use the release's configuration helper and actual returned identity; never reuse a developer origin, project ID or private configuration. Do not make the service public to bypass access problems.

Use the platform-issued private ingress gate and the merged package's reviewed pairing-gate adapter. A random locally generated string is not a platform-issued gate. Store the real gate only through protected runtime tools; preserve an existing valid gate. Generate only genuinely missing per-instance signing/diagnostic/retention keys through a CSPRNG and protected secret tools, using the exact names/format in RESOURCES. Never print, paste or put credentials in a URL, schedule prompt, public file or chat. If protected issuance is unavailable, ask the user to complete the supported access/setup step; keep the deployment phase pending.

Provision bindings and apply the **actual packaged SQL inventory** in order. For updates, inspect existing schema/ledger and apply only missing migrations, preserve data and valid secrets, and arrange a quiet window if control is active. Do not reset storage, re-pair devices or rotate keys as a routine update. Do not hardcode the old 0000–0028 limit: the merged L06/L04 package has additional migrations whose exact order must be rechecked at packaging.

Install locked dependencies and run the packaged validation, type checks, contract/source checks and production build. Deploy through the owner's Sites workflow; wait for terminal deployment success and read back the real source/runtime identity. Verify private access policy and authenticated MCP discovery. Saving source or building locally is not deployment success. Resume errors from the original operation identity; do not resend uncertain device input under a new command ID.

## 4. 同一个插件、按语言介绍、带图标 / Same plugin, localized presentation

Read the Site-generated canonical plugin/App and preserve its identity, audience, App dependency, interface, permissions and unrelated files. Use the real supported creation/update capability with the current release ID for concurrency protection; do not create a second wrapper plugin. Do not replace platform-owned manifests/IDs with neutral packaged examples.

语言按用户当前对话选择。中文用下面中文组，英文用英文组；不能确定就问。平台支持多语言字段时两组都填；只支持一组时用用户语言。

| Field | 中文 | English |
| --- | --- | --- |
| Title | SaySo | SaySo |
| Short description | iPhone 读屏和帮你点 | Read your iPhone screen and tap for you |
| Long description | SaySo 读取已共享的 iPhone 画面；连接 SaySo 配件后，可帮你点、输入和滚动。停止帮你点与结束共享可在 SaySo App 中完成。 | SaySo reads the iPhone screen you choose to share. With a SaySo accessory connected, it can tap, type and scroll for you. Stop tapping or end sharing in the SaySo app. |

**Unsupported display fields are not a failed installation.** Inspect the actual tool fields first. Set all supported title/description/localization fields; skip an unsupported long-description or locale field. Never invent a schema property or demand an unavailable editor. Record what could not be set and, after installation, say “插件介绍以平台显示为准，请打开插件详情核对” / “The platform controls the displayed description; please open the plugin details to check it.” Do not treat a local manifest as proof the live App description changed.

Set the SaySo icon from the **new package's manifest-listed icon asset** through the supported icon/upload field. Do not hotlink a moving image, use a generic paperclip, or claim an icon was set without readback. Packaging gate: copy the reviewed SaySo icon into a stable package asset path, include its license/provenance and SHA-256, and name that path in the release metadata. If the platform has no icon setter, skip that field, explain the display limitation and ask the user to check plugin details; do not invent an upload API.

Overlay all seven packaged skill directories into that same plugin, preserving their relative references and notices. When upgrading, remove only verified obsolete SaySo-owned references specified by the release; preserve unrelated user files. Configure onboarding through the actual supported mechanism. Read back saved skill content and metadata. Distinguish a saved release from activation in the user's next conversation; do not claim live voice activation from an upload alone. **只引导用户在插件权限里选“全部允许”，不替用户设置；该引导不写进插件介绍。** / Guide the user to “Allow all actions”; do not change that setting for them or include it in the description.

## 5. 定期清理：T83 方案 C + B 补偿 / Maintenance

Use the merged release's **owner-authenticated, due-only maintenance MCP tool**, with the exact reviewed name/schema documented by that release. This draft deliberately does not invent the tool name. It must reject anonymous/device/other-owner identities and accept no arbitrary target, TTL, force flag or deletion scope. The service uses its own clock, durable lease/cursor, fixed budget and existing expiry policy; the schedule/model never handles a maintenance key.

1. Read existing Site-associated automations and maintenance state. Reuse the matching owned task; do not create duplicate tasks. A missing/unavailable automations capability is not proof an unattended writer exists: ask/resolve the actual setup gap.
2. Through the supported Sites cloud scheduler, associate a maintenance task with this private Site, targeting every five minutes **only if the actual platform supports that frequency**. Store the returned schedule/timezone/identity privately. The prompt asks the canonical plugin to perform one due-only maintenance pass; no secrets, bearer tokens, invented headers or raw HTTP maintenance keys. Do not weaken private ingress.
3. Verify that the unattended task receives a platform-verified identity accepted as the bound install owner. A successful save is separate from a scheduled execution and from completed durable cleanup. Read back real runs and service `last_attempt`, `last_success`, `next_due`, durable cursor and backlog/oldest-due status using actual release-supported fields. Validate idle execution without phone/browser traffic and failure recovery; no synthetic progress or hard deadline promise.
4. If authorization/frequency/task creation or execution cannot be confirmed, keep the concrete unresolved state in the private log and report it plainly: **“定期清理还没设好。读屏和帮你点不受影响，清理会在使用时顺带进行；长时间不用时，暂时不能保证按时清理。”** / **“Scheduled cleanup isn’t ready yet. Screen reading and tapping are unaffected; cleanup will also run while you use SaySo. If you leave it unused, timely cleanup is not yet guaranteed.”** Only say the B fallback exists after checking the merged source/deployment. This is partial installation, not a full maintenance pass.
5. B is bounded opportunistic cleanup after authenticated normal requests, with failures retried safely; it cannot replace C for idle expiry guarantees. A stopped/unauthorized task, failed page or stale lease must not advance the success watermark. Do not put credentials in a compensating task or add anonymous cleanup routes. Keep warnings/status and recovery evidence; saved scheduling alone does not close T83/L04 or authorize arbitrary erasure.

## 6. 只读自检，回手机连接 / Verify and return to the phone

Check actual service version against the new package, bindings/migrations, canonical plugin tool discovery and the packaged harmless guide self-check. Do not read an unshared screen, start ReplayKit, generate/redeem a connection, send input or flash hardware as an installation smoke test. Separate verified service/plugin state, activation state, maintenance state and phone state in the private log.

Tell the user to return to SaySo and tap **“连接 ChatGPT” / “Connect ChatGPT”**. With a later user-supplied App pairing request, follow that release's onboarding skill, preserving the App's request ID, protocol and public key. The user sends the prefilled message, opens the returned link, taps **“生成连接” / “Generate connection”**, then personally taps **“回到 SaySo 完成连接” / “Return to SaySo to connect”**. Switching apps alone is not a completed handoff. Respect expiry, cancel/restart and single use; never expose the connection capsule, gate or device token. Pairing does not start sharing or grant tapping permission.

Public App Store release and accessory firmware remain unavailable until separately released. Do not promise the next flow works with the old 244 package. Shared-screen access, phone pairing, accessory pairing, control permission and final irreversible actions remain separate user choices.

## 7. 用用户的话汇报 / User-facing completion

Keep the reply short and in the user's language. Say what was actually installed, what remains and the next action. Detailed test totals, migration/file counts, runtime IDs and technical statuses go only in the private installation log. Do not claim a phone is connected until verified.

中文正常例子：“SaySo 服务和插件装好了。回到 SaySo，点‘连接 ChatGPT’，跟着页面完成连接。”

English: “Your SaySo service and plugin are installed. Return to SaySo, tap ‘Connect ChatGPT’, and follow the connection steps.”

Append the platform-description check only when a display field was unsupported, and the maintenance limitation only when unresolved. If blocked, explain the exact step and ask a specific next question in ordinary language. Do not report “everything is ready” while maintenance or handoff remains unverified. Stop/Cancel always wins over recovery.
