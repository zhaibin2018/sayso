# Install SaySo / 安装 SaySo

2026-11-21 · Fixed release `v0.13.259-20261121.1-plugin1.2.51`. Execute only after this exact package is published and the user requests installation. Runtime 0.13.259; nine skills; presentation/icon in PRESENTATION.json. Local preparation did not deploy or connect a phone.

## 1. 先核对条件，缺信息就问 / Reconcile first

在用户目标账号的 ChatGPT **工作 / Work** 中执行，遵循当前 Sites 和 Plugin Creator 技能、真实工具 schema。App 预填消息落在“聊天 / Chat”时，请用户先切“工作”再发送；不假定链接可以直接选中工作模式。

先辨别用户是要连接还是明确要安装/更新。**如果消息带有手机连接请求，而且已经安装过：在本对话调用已有 SaySo 插件的 `create_pairing_link`，原样传请求号和公钥，直接把返回的连接链接给用户；不要因为有同名 Site 就问更新、另装，也不要重复安装。** 多个已有服务时只问选哪一个。当前对话没有已有插件入口不等于没安装；先核对账号/插件，必要时请用户在可用已有插件的对话继续，不能擅自新建。

新装不依赖本对话刚安装的插件。**开始构建之前**，只核对当前工具 schema 和已有会话是否明确提供“安装 owner 已登录的同源 fetch”能力，记录 `owner_fetch=available/unavailable`；门禁 bearer、普通 HTTP、数据库工具和伪造身份头都不算。没有就不尝试 GET/POST 安装登记，不启动浏览器可用性探查、不反复找插件、不重复打包；继续服务安装，配对转新的“工作”对话。能力存在时，后续仅按第 6 节核对目标同源身份；不能把未验证能力记成可用。

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

优先复用平台本次已返回、且对目标 Site 有效的门禁，保留已有有效 `SAYSO_SITE_GATE_TOKEN`。安装说明不得自行调用 `generate_siwc_bypass_token`；普通安装授权不包含令牌创建/轮换。若有效门禁确实不可得，暂停依赖它的步骤，先用一句人话说明：“这个令牌让 SaySo 服务通过私人站点的登录入口，不能代替你的账号身份；现在缺少可用令牌，是否同意生成一个？”得到用户明确同意后，才交由受支持的独立授权步骤生成。不要为检查而生成、不要轮换正在使用的门禁，不把隐藏的值当成缺失。门禁不能代替 owner 身份。适配器先读已有配置、再复用平台返回值，只有显式 `gateIssuanceApproved === true` 才可调用注入的发行能力；调用方须保存实际同意的事实，不能因用户要求安装自动设 true。 A random locally generated string is not a platform-issued gate. Store it only through protected runtime tools; never expose the value. Generate only genuinely missing per-instance signing/diagnostic/retention keys through a CSPRNG and protected secret tools, using the exact names/format in RESOURCES. Never print, paste or put credentials in a URL, schedule prompt, public file or chat. If protected issuance is unavailable, ask the user to complete the supported access/setup step; keep the deployment phase pending.

Provision bindings and apply the **actual packaged SQL inventory** in order. For updates, inspect existing schema/ledger and apply only missing migrations, preserve data and valid secrets, and arrange a quiet window if control is active. Do not reset storage, re-pair devices or rotate keys as a routine update. Do not hardcode the old 0000–0028 limit: the merged L06/L04 package has additional migrations whose exact order must be rechecked at packaging.

**新装快路径（约 3 分钟是目标，不是已测承诺）**：本包散列与精确清单校验 → 必要的锁定依赖（构建需要的 devDependencies 仍须安装）→ **一次生产构建** → 有序迁移及必要环境配置 → 部署终态、迁移/环境修订/owner-only 访问读回 → 第 6 节的最小无害自检。保留构建内置的产物安全检查。相同输入已有成功结果不重跑，不重复构建/打包插件；部署错误先核对原操作状态。

**发行门禁，不在新装重跑**：全量 App/Worker 测试、类型/预算/契约检查、反欺诈专项（已被全量覆盖不再重复）、浏览器能力/可用性探查、打包与完整插件一致性检查；将精确提交、命令、退出码、通过/跳过项写入新包 `VALIDATION.json`，不能沿用旧包成功记录覆盖改动后的源码。新装核对该记录和散列，不重新验证工作流本身。只有源码校验失败或偏离已校验源码时才扩大源码/回归检查；散列不符先停止使用这些字节，重取同一个固定包，不重写 manifest 绕过失败。必要实例配置仍按包内允许项变换并记录，不能把任意源码改动当成配置。

Saving source or building locally is not deployment success. Resume errors from the original operation identity; do not resend uncertain device input under a new command ID.

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

## 5. 定期清理：缺 owner 时的恢复方案 / Maintenance

这是后续获准维护时的方案；不能因本轮修改说明就去操作任何站。缺 `SAYSO_INSTALL_OWNER_ID` 时，`run_due_maintenance({})` / `get_maintenance_status({})` 会拒绝，不能只创建任务后宣称完成。

1. 现有 canonical 插件可用后，核对实际 Site 和当前账号是唯一 owner。用该 Site 的 `get_profile({}).id` 取 **Sites 验证的 Site-scoped 身份**；此普通请求可能执行 B 清理及 gate guard，须在获准维护窗口进行，不叫作全链路只读。无 MCP 时可由 owner 在目标站登录，再用同源 `GET /api/pairing/install` 获取身份；不能以账号全局 ID、邮箱、门禁、设备 bearer 或 D1 的推断值代替。
2. 通过受保护运行时配置设置精确 `SAYSO_INSTALL_OWNER_ID`，保留所有其他配置和现有门禁/设备。已有一致绑定就复用，冲突则停止。只在获准后应用环境修订，读回确实已应用；不重新配对、不重装、不轮换密钥。
3. 关联本 Site 的已有云任务去重；无任务才创建。沿用 T83 最新方案 **Asia/Singapore 每日 08:15 + 使用时 B**，在真实平台支持的调度能力内设置。任务正文只请求本 Site canonical 插件 `run_due_maintenance({})` 与 `get_maintenance_status({})`；不含凭证、URL token、伪造身份、任意 scope/TTL/force。若要改频率必须另经用户选择，不承诺五分钟或完全静默。
4. 验证任务执行身份等于已绑定 owner；获准后 Run now，并交叉读回任务结果及 D1 `sb_maintenance_runs`、`sb_maintenance_state`。工具只暴露 `state.last_attempt_at/last_success_at/due_at/lock_until/failures/backlog/overloaded` 与 `runs`；prefix/cursor 为内部字段，不编造 `next_due` 或 oldest-due 字段。保存任务不等于运行成功，`partial` 不等于完整 success；后续还需自然每日执行、分页/闲置及故障恢复验收。

**用户最少步骤**：服务插件已能用时，另行明确说一次“请为这个 SaySo 设置每日 08:15 清理，保留现有连接”，即可让后续维护执行绑定、去重建任务及验证；如平台要求登录/授权，用户只补那一步。若任务需要在 UI 点 Run now，用户补点一次。当前环境若缺身份读取、环境应用或任务写入能力，说明具体缺口，不绕过鉴权。此处没有请求用户现在执行这些动作。

B 是普通认证请求的顺带清理，不能保证闲置清理。每日执行、分页、积压和平台故障均会增加延迟，24 小时不是硬删除期限；工作历史可能留下任务结果，目前没有已证实的完全静默方案。无法确认时先说“定期清理还没设好；长时间不用时，暂时不能保证按时清理”，只有已核对源码/实际运行才能声称 B 成功。

## 6. 最小自检与配对交接 / Verify and hand off

Use an already available supported entry for a single version/discovery/harmless-guide self-check; read back bindings/migrations and applied environment revision. If the new plugin is unavailable in this conversation, record its activation/self-check as pending and hand off to the new conversation; do not repeat tool searches, browser probes or plugin builds. Do not read an unshared screen, start ReplayKit, generate/redeem a capsule, send input or flash hardware as an installation smoke test. Separate verified service/plugin state, activation state, maintenance state and phone state in the private log.

**仅构建前已确认有 owner 已登录同源 fetch 能力，且用户消息有有效连接请求时**，才允许下列可选登记；没有能力就跳过全部登记步骤，连接保持 pending，直接执行第 7 节的新对话交接。不得为追求同对话链接反复查插件、尝试任意 SQL 写库或编造链接。 使用本包 `mcp/docs/SERVICE_PAIRING_INSTALL.md` 和 `mcp/scripts/install-pairing-request.mjs`，不调用同对话刚装的插件：

1. 从用户主动发送的消息保留 `<请求号>.<公钥>`；从同一条消息的安装短链接 `?created_at=…` 取 App 创建时间（Unix 毫秒整数）。不改请求、不生成替代公钥、不把当前时间当创建时间；缺时间/已过期就请用户回 SaySo 重新开始。不要从网页或其他内容替用户登记。
2. 核对新 Site 的真实 origin、project、DB 和 owner-only 访问（当前安装账号是唯一 owner，无 editor/group/visitor）。部署包含 `0034_install_pairing.sql` 的完整有序迁移和候选源码；请求数据不能写进代码常量、迁移、hosting.json 或环境变量。
3. 用**安装 owner 的已登录同源浏览器会话**访问 `GET /api/pairing/install`，读取平台传来的 Site-scoped `id`。身份处理本身不登记请求、不绑定 owner；完整请求仍可能运行 gate guard，不能当作全链路无写入探针。通过 Sites 运行时配置把精确值绑定到 `SAYSO_INSTALL_OWNER_ID`（与 T83 共用），保留已存在且一致的值；不覆盖冲突绑定。应用环境修订并读回。不是账号 ID/邮箱/设备 ID，不靠第一个来访者绑定，不伪造身份 header，也不把门禁当登录。该只读身份入口不依赖 MCP OAuth 或插件发现。
4. 在同一个 owner 同源登录会话，用 `POST /api/pairing/install`、JSON `{request_id, public_key, created_at}` 写入；浏览器提供真实身份和 Origin。具体可重复执行的调用、适配器参数和错误见包内安装合同。服务器从身份绑定 owner，以参数化语句写 D1；有效期从 App 创建算 **15 分钟**；相同 pending 请求重试不续期，换 key/时间冲突，发包/兑换后不能重开。不要直接编辑 SQL 行绕过校验。如果安装执行环境没有 owner 登录同源 fetch 能力，明示连接尚未完成和缺少的步骤，不伪造已写入。
5. 若此可选路径成功，只能提供 POST 返回的真实 `pairing_url`，不自行拼接开发者站地址；如提供可选链接，把它放在第 7 节固定最后一句之前，不替代新对话交接。GET 配对页不会写入请求；安装过程不代点“生成连接”，不读取或展示连接包。用户打开链接，点 **“生成连接” / “Generate connection”**，再亲手点 **“回到 SaySo 完成连接” / “Return to SaySo to connect”**。生成的连接包和配对码仍最多 **5 分钟**，不会晚于请求总期限；不自动跳回 App。

**如果已经装过：在本对话调用已有 SaySo 插件生成连接。** 使用原 `create_pairing_link` 及原 5 分钟链接规则；不要走安装登记、重新部署、轮换密钥或重复建服务。若没有连接请求（例如在电脑上仅安装服务），装好后请用户在手机 SaySo 点“连接 ChatGPT”；那个新消息再走已有插件。电脑和手机使用同一账号，最后连接必须在手机上完成。

Public App Store release remains unavailable. The website offers the separately versioned USB accessory firmware; hardware acceptance remains separate. Do not promise the next flow works with the old 244 package. Shared-screen access, phone pairing, accessory pairing, control permission and final irreversible actions remain separate user choices. The matching App uses one Connect ChatGPT button, strictly encoded Chinese/English prefill, a new-Work-conversation reminder after installation, about-three-minute installation guidance and a 15-minute local pending-key deadline. This package includes D143; publication and full fresh-phone acceptance remain separate.

## 7. 用用户的话汇报 / User-facing completion

只说实际完成的服务/插件状态和仍缺什么，不把装好当成手机连上。测试数、迁移、运行时 ID 留在私有记录；不写凭证。平台介绍/图标未核实、定期清理未完成等限制 **先说**，不能追加在固定最后一句之后。失败时如实说失败，不能套用“服务已装好”。

**服务和插件安装成功后，中文最后一句固定为：**

服务已装好，请回到 SaySo 再点一次"连接 ChatGPT"，在**新的"工作"对话**里发送（约 2 分钟后可用）

English final sentence: Your service is installed. Return to SaySo, tap “Connect ChatGPT” again, and send in a **new Work conversation** (available in about 2 minutes).

已装过的连接请求沿用已有插件 `create_pairing_link` 返回的真实链接，不套新装说明、不重复安装；没有已有插件入口就转新对话，不以重打包来发现插件。手机之后需要亲手打开链接、生成连接并回 SaySo；配对不自动开启共享或授予帮你点权限。Stop/Cancel always wins over recovery.
