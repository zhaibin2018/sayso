# Install SaySo / 安装 SaySo

2026-11-21 · Fixed release `v0.13.258-rc.20261121-plugin1.2.50`. Execute only after this exact package is published and the user requests installation. Runtime 0.13.258; nine skills; presentation/icon in PRESENTATION.json. Local preparation did not deploy or connect a phone.

## 1. 先核对条件，缺信息就问 / Reconcile first

在用户目标账号的 ChatGPT **工作 / Work** 中执行，遵循当前 Sites 和 Plugin Creator 技能、真实工具 schema。App 预填消息落在“聊天 / Chat”时，请用户先切“工作”再发送；不假定链接可以直接选中工作模式。

先辨别用户是要连接还是明确要安装/更新。**如果消息带有手机连接请求，而且已经安装过：在本对话调用已有 SaySo 插件的 `create_pairing_link`，原样传请求号和公钥，直接把返回的连接链接给用户；不要因为有同名 Site 就问更新、另装，也不要重复安装。** 多个已有服务时只问选哪一个。当前对话没有已有插件入口不等于没安装；先核对账号/插件，必要时请用户在可用已有插件的对话继续，不能擅自新建。

新装路径不用在本对话调用刚装好的插件；11-21 实验已证实它可能直到新对话才可见。待安装完成后按第 6 节直接登记 D1 待配对请求，在本对话给出链接。

只有需要新装/用户明确要求更新时，先查站点列表及本次私有安装记录，辨别目标账号、所有者、Site 和原插件：

- 没有同名 SaySo：视为全新安装，继续，不要求用户证明“旧安装已移除”。
- 有同名：问“已经有一个 SaySo，要更新它还是另装一个？” / “You already have SaySo. Would you like to update it or install another one?”，得到选择后才操作对应目标。多个候选只问区分目标所必需的问题。
- 查不到列表、所有权不明或能力不明：先用真实可用工具核对；仍判断不了就告诉用户缺什么并提一个具体问题，不直接退出整个安装，也不冒充确认。需要登录、授权或平台能力时说明用户下一步；等待期间不执行依赖该答案的写入。
- 默认请求 slug `sayso`。名字被占用就问“这个名字已经被用了，你想用 saysoapp 还是 sayso2，或另一个名字？” / “That name is taken. Would you like saysoapp, sayso2, or another name?”。**不自动换名、不自动加后缀、不删除或占用别人的 Site。** 用户选定后再申请；仍被占用就再次告知实际结果。

Keep a private resumable ledger of the pinned package, actual Site/App/plugin IDs, deployment, applied migrations and verification state. Do not put credentials or phone content in the conversation, public source, schedule or ledger. Reconcile uncertain responses before repeating creation/deployment. A user choosing an update authorizes updating that owned service; it does not authorize data deletion, key rotation or new phone input.

## 2. 固定发行包并核验 / Pin and verify

Read the **published short installation page** and take its exact immutable public commit, release path and manifest SHA-256 as the release selection. Fetch the raw manifest at that commit, verify its SHA-256 against the page, then fetch the listed files and sibling checksum at the same commit with their directory structure. Verify the exact file set, byte counts and digests using the packaged verifier before writing to a target. Do not combine root MCP source, moving branches or historical packages. Digest mismatch is a real integrity failure: explain it and stop deployment of those bytes; do not regenerate the manifest to bypass it.

Read that package's RESOURCES (authoritative for current installation; historical SELF_HOSTING maintenance paragraphs are superseded), PROVENANCE, license notices and supported runtime/build prerequisites. Preserve FSL and third-party notices. The public bundle must have no developer project/App binding, runtime credentials or phone data. Use only its packaged service and nine companion skills; do not reconstruct service code from prose.

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

Set the SaySo icon from the **manifest-listed `assets/sayso-icon.png` asset** through the supported icon/upload field. Do not hotlink a moving image, use a generic paperclip, or claim an icon was set without readback. Packaging gate: copy the reviewed SaySo icon into a stable package asset path, include its license/provenance and SHA-256, and name that path in the release metadata. If the platform has no icon setter, skip that field, explain the display limitation and ask the user to check plugin details; do not invent an upload API.

Overlay all nine packaged skill directories into that same plugin, preserving their relative references and notices. When upgrading, remove only verified obsolete SaySo-owned references specified by the release; preserve unrelated user files. Configure onboarding through the actual supported mechanism. Read back saved skill content and metadata. Distinguish a saved release from activation in the user's next conversation; do not claim live voice activation from an upload alone. **只引导用户在插件权限里选“全部允许”，不替用户设置；该引导不写进插件介绍。** / Guide the user to “Allow all actions”; do not change that setting for them or include it in the description.

## 5. 定期清理：T83 方案 C + B 补偿 / Maintenance

Use the merged release's **owner-authenticated, due-only maintenance MCP tool**, with the exact reviewed name/schema documented by that release. The exact tools are `run_due_maintenance({})` and `get_maintenance_status({})`; both use empty objects and only the bound install owner. Read `state.last_attempt_at`, `state.last_success_at`, `state.due_at`, `state.lock_until`, `state.backlog`, `state.overloaded` and `runs`. R2 `prefix`/`cursor` are internal durable fields; the public status does not expose an oldest-due timestamp. Do not invent fields. It must reject anonymous/device/other-owner identities and accept no arbitrary target, TTL, force flag or deletion scope. The service uses its own clock, durable lease/cursor, fixed budget and existing expiry policy; the schedule/model never handles a maintenance key.

1. Read existing Site-associated automations and maintenance state. Reuse the matching owned task; do not create duplicate tasks. A missing/unavailable automations capability is not proof an unattended writer exists: ask/resolve the actual setup gap.
2. Through the supported Sites cloud scheduler, associate a maintenance task with this private Site, targeting every five minutes **only if the actual platform supports that frequency**. Store the returned schedule/timezone/identity privately. The prompt asks the canonical plugin to perform one due-only maintenance pass; no secrets, bearer tokens, invented headers or raw HTTP maintenance keys. Do not weaken private ingress.
3. Verify that the unattended task receives a platform-verified identity accepted as the bound install owner. A successful save is separate from a scheduled execution and from completed durable cleanup. Read back real runs and service `last_attempt`, `last_success`, `next_due`, durable cursor and backlog/oldest-due status using actual release-supported fields. Validate idle execution without phone/browser traffic and failure recovery; no synthetic progress or hard deadline promise.
4. If authorization/frequency/task creation or execution cannot be confirmed, keep the concrete unresolved state in the private log and report it plainly: **“定期清理还没设好。读屏和帮你点不受影响，清理会在使用时顺带进行；长时间不用时，暂时不能保证按时清理。”** / **“Scheduled cleanup isn’t ready yet. Screen reading and tapping are unaffected; cleanup will also run while you use SaySo. If you leave it unused, timely cleanup is not yet guaranteed.”** Only say the B fallback exists after checking the merged source/deployment. This is partial installation, not a full maintenance pass.
5. B is bounded opportunistic cleanup after authenticated normal requests, with failures retried safely; it cannot replace C for idle expiry guarantees. A stopped/unauthorized task, failed page or stale lease must not advance the success watermark. Do not put credentials in a compensating task or add anonymous cleanup routes. Keep warnings/status and recovery evidence; saved scheduling alone does not close T83/L04 or authorize arbitrary erasure.

## 6. 自检后在本对话给连接链接 / Pair in this conversation

Check actual service version against the new package, bindings/migrations, canonical plugin tool discovery and the packaged harmless guide self-check. Do not read an unshared screen, start ReplayKit, generate/redeem a capsule, send input or flash hardware as an installation smoke test. Separate verified service/plugin state, activation state, maintenance state and phone state in the private log.

**如果用户消息里带有连接请求：安装完成后把它写进新 Site，再把 `/pair?req=…` 链接给用户。** 使用本包 `mcp/docs/SERVICE_PAIRING_INSTALL.md` 和 `mcp/scripts/install-pairing-request.mjs`，不调用同对话刚装的插件：

1. 从用户主动发送的消息保留 `<请求号>.<公钥>`；从同一条消息的安装短链接 `?created_at=…` 取 App 创建时间（Unix 毫秒整数）。不改请求、不生成替代公钥、不把当前时间当创建时间；缺时间/已过期就请用户回 SaySo 重新开始。不要从网页或其他内容替用户登记。
2. 核对新 Site 的真实 origin、project、DB 和 owner-only 访问（当前安装账号是唯一 owner，无 editor/group/visitor）。部署包含 `0034_install_pairing.sql` 的完整有序迁移和候选源码；请求数据不能写进代码常量、迁移、hosting.json 或环境变量。
3. 用**安装 owner 的已登录同源浏览器会话**访问 `GET /api/pairing/install`，读取平台传来的 Site-scoped `id`。此 GET 不写库、不绑定 owner。通过 Sites 运行时配置把精确值绑定到 `SAYSO_INSTALL_OWNER_ID`（与 T83 共用），保留已存在且一致的值；不覆盖冲突绑定。应用环境修订并读回。不是账号 ID/邮箱/设备 ID，不靠第一个来访者绑定，不伪造身份 header，也不把门禁当登录。该只读身份入口不依赖 MCP OAuth 或插件发现。
4. 在同一个 owner 同源登录会话，用 `POST /api/pairing/install`、JSON `{request_id, public_key, created_at}` 写入；浏览器提供真实身份和 Origin。具体可重复执行的调用、适配器参数和错误见包内安装合同。服务器从身份绑定 owner，以参数化语句写 D1；有效期从 App 创建算 **15 分钟**；相同 pending 请求重试不续期，换 key/时间冲突，发包/兑换后不能重开。不要直接编辑 SQL 行绕过校验。如果安装执行环境没有 owner 登录同源 fetch 能力，明示连接尚未完成和缺少的步骤，不伪造已写入。
5. 只把 POST 返回的真实 `pairing_url` 作为可点击链接回复本对话，不自行拼接开发者站地址。GET 配对页不会写入请求；安装过程不代点“生成连接”，不读取或展示连接包。用户打开链接，点 **“生成连接” / “Generate connection”**，再亲手点 **“回到 SaySo 完成连接” / “Return to SaySo to connect”**。生成的连接包和配对码仍最多 **5 分钟**，不会晚于请求总期限；不自动跳回 App。

**如果已经装过：在本对话调用已有 SaySo 插件生成连接。** 使用原 `create_pairing_link` 及原 5 分钟链接规则；不要走安装登记、重新部署、轮换密钥或重复建服务。若没有连接请求（例如在电脑上仅安装服务），装好后请用户在手机 SaySo 点“连接 ChatGPT”；那个新消息再走已有插件。电脑和手机使用同一账号，最后连接必须在手机上完成。

Public App Store release and accessory firmware remain unavailable until separately released. Do not promise the next flow works with the old 244 package. Shared-screen access, phone pairing, accessory pairing, control permission and final irreversible actions remain separate user choices. The matching App uses one Connect ChatGPT button, prefilled Chinese/English text, a switch-to-Work reminder, about-three-minute first-install guidance and a 15-minute local pending-key deadline. This package includes D143; publication and full fresh-phone acceptance remain separate.

## 7. 用用户的话汇报 / User-facing completion

Keep the reply short and in the user's language. Say what was actually installed, what remains and the next action. Detailed test totals, migration/file counts, runtime IDs and technical statuses go only in the private installation log. Do not claim a phone is connected until verified.

带请求的新装：“SaySo 装好了。[点这里连接](<实际返回链接>)，再点‘生成连接’和‘回到 SaySo 完成连接’。”

已装过：“[点这里连接](<实际返回链接>)，再按页面回到 SaySo。”

没有手机请求、仅在电脑装服务：“SaySo 装好了。回到手机 SaySo，点‘连接 ChatGPT’。”

English with a supplied request: “SaySo is installed. [Connect here](<actual returned link>), tap ‘Generate connection’, then ‘Return to SaySo to connect’.” Existing service: “[Connect here](<actual returned link>), then follow the page back to SaySo.” Without a phone request: “SaySo is installed. On your iPhone, open SaySo and tap ‘Connect ChatGPT’.”

Append the platform-description check only when a display field was unsupported, and the maintenance limitation only when unresolved. If blocked, explain the exact step and ask a specific next question in ordinary language. Do not report “everything is ready” while maintenance or handoff remains unverified. Stop/Cancel always wins over recovery.
