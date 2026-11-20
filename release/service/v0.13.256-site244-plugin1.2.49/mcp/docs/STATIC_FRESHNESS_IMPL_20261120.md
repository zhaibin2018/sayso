# 静止画面新鲜度：离线实现记录

日期：2026-11-20。依据：`CODEX_PROMPT_STATIC_FRESHNESS_IMPL_20261120.md`、`DESIGN_STATIC_SCREEN_FRESHNESS_20261120.md` 第二、三节，以及 `ORIENTATION_FIX_RUN_20261120.md` 第 3、4 部分及续篇。

**状态：离线实现候选，等待 Claude 评审和另行授权的部署、装机、真机验证。T52 未结案。** 本轮没有使用任何手机、板、WDA、SaySo 实时工具或私人 Site；没有部署、签名、安装、推送或输出真实凭证。Mac mini 仅作为局域网内的隔离编译机。

## 隔离与提交

两个仓库各自从指定基线新建 `codex/static-freshness-20261120` 分支：

| 仓库 | 基线 | 独立 worktree | 本地提交 |
|---|---|---|---|
| App | `bf7afb1` | `C:/Users/USER/Documents/Playground/sayso-static-freshness-20261120/app` | `3166c95a2e2ccdb1a51301408c3c2aee77dabec2` |
| Worker / Site 242 基线 | `f654165` | `C:/Users/USER/Documents/Playground/sayso-static-freshness-20261120/worker` | `d8fbcdbbae8f40287b6e04fc4f8c3a4fbd3a3516` |

原 App 目录未写入，原 Worker 的 `lib/led-control.ts` 既有未提交修改保留；未操作 L04 的 `codex/l04-data-retention-20261120` 分支（核对时仍为 `be4b084`）。主 SaySo 仓库只提交本文，不纳入其他执行者的修改。

源码、测试、构建证据在独立目录 `C:/Users/USER/Documents/Playground/sayso-static-freshness-20261120/evidence/`。依赖来自复制现有本地 `node_modules`，没有运行安装命令。Worker 构建关闭遥测、远程 Cloudflare fetch 和 npm 在线行为，并移除继承的凭证环境变量。

## 现状和根因对应

现有两条链路需要区分：

1. `frame-observation` 来自新的捕获元数据。有效事务可保留相同 JPEG 字节，同时推进服务端的 `frame_id`、`frame_seq`、捕获下界和有效期；`NEED_IMAGE` 有上传本次 JPEG 的有界回退。
2. 独立 `worker/heartbeat` 的 `repeated_frame` 来自 `ExecutionCoordinator.repeatPresentation`。既有时钟探针、内容哈希、方向、尺寸、会话和租约校验可证明重复呈现仍在进行，但不证明最后一次 ReplayKit 回调就是服务端这一帧。

公开 `read_screen` 经过 `visualReadArgs`，仍显式保持 `allow_repeated=false`。原实现要求真实捕获的年龄严格小于 2000 ms，响应交付前还会复核。因此屏幕静止、没有新视频回调时，活跃的重复呈现心跳不能使旧捕获通过。这与取证中横屏静止页的 `NO_FRESH_FRAME` 对应。

本次增加专用的静止证明分支，没有直接打开通用 `allow_repeated`，也没有把心跳时间改写成捕获时间。

## App 实现

新增 `CaptureCallbackFreshness`，在每次视频回调开始时推进 `source_seq`，这个序号随实际媒体进入既有发布链路。即使回调因无图像、节流、拷贝失败等原因未上传，也会推进序号，因而不能把上一张成功上传的图当作最新回调对应的图。

现有心跳新增 `capture_freshness` 对象：

| 字段 | 含义 |
|---|---|
| `last_callback_age_ms` | 距最后视频回调的时间间隔 |
| `last_callback_source_seq` | 最后视频回调的源帧序号，与上传元数据的 `source_seq` 对照 |
| `sharing_state` | 共享状态；只有 `active` 能提供证明 |

**新增对象不包含原始开机时间或新的绝对时间字段。** 既有重复呈现/时钟协议保持兼容。重复呈现和回调间隔使用同一个本机采样时刻，避免异步取值把动作后的回调误算到动作前。

`starting`、`paused`、`finished`、`failed` 和 `unproven` 均不能提供静止证明；暂停后恢复必须见到新回调。授权撤销也会使证明不可用。新增状态更新只撤销图像证明，原有停止、释放、取消和远程停会话的执行顺序保持原样。

## Worker 实现

复用重复呈现事务，将验证后的证明保存在当前 `sb_frames.metadata._static_freshness`。这是服务端字段，客户端上传携带它会被既有帧字段白名单拒绝。无需新增表或 D1 迁移。

每个成功取得当前心跳 nonce 的新心跳先清除旧证明，再由本次有效重复呈现补充证明。旧序号心跳不能恢复暂停状态或旧证明；新 JPEG 和新 observation 替换元数据时自然清除它。

只有以下条件同时满足，过龄捕获才能作为静止图返回：

- 当前 owner、设备、广播、会话、worker 和租约一致；共享 active、worker 在线、图像未到期，原捕获时钟已验证。
- 心跳接收时间和既有探针核验的重复呈现时间均在最近 2000 ms 内；较小的调用方 `max_age_ms` 仍约束证明年龄。
- 心跳序号是设备当前心跳序号；最后回调源帧序号严格等于这一帧的 `source_seq`。
- 既有重复呈现内容哈希、几何和时钟校验通过；回调间隔与原捕获的本机时钟顺序一致。
- 捕获之后没有已确认或可能已经执行的点击、输入、滚动、拖动等命令。正在执行、结果未知、缺少可靠回执时钟的记录采用保守拒绝。

仍在正常年龄范围内的普通捕获继续走原有新帧路径。静止图返回 `state=repeated`，保留原始捕获下界和 `age_ms`，添加 `metadata.static_screen.proven=true`、回调源序号、间隔及 `unchanged_for_ms` 和中英文说明。返回图不生成可复用的 `image_ref`、输入定位证明或 `image_handoff`，并明确 `usable_for_input=false`。

### 动作后没有新画面

先尝试原有动作后新帧路径。只有原命令为同范围的 `board_acked`，证明最后回调早于该回执，且重复呈现时已距回执至少 1500 ms，没有另一条可能执行的后续动作，才允许返回动作前图。

该图标记 `ACTION_NO_SCREEN_CHANGE`，`after_command.relation=no_callback_after_phone_board_ack`、`app_effect_observed=false`；中英文明确说明“可能没有点中或没有生效”。原始硬件回执不变，不宣称 App 效果成功，也不重新发送命令。`read_screen(after_command_id=...)` 和原命令的 `get_mouse_result(include_after_screen=true)` 都覆盖了此路径。

MCP 在序列化后的交付边界再次检查证明年龄，并重新查询当前授权、同一帧和动作屏障。期间若暂停、停止、撤销、收到更新回调或执行了动作，图片会被撤下；与该图关联的“动作后没有变化”说明也会撤下。数据库或时钟复核失败同样拒绝交付。

横屏控制门禁未放宽。所有停止相关产品逻辑保持原路径。

## 文件

App 共 9 个文件：

- `Core/CaptureCallbackFreshness.swift`、`CoreTests/CaptureCallbackFreshnessTests.swift`：回调证明和离线测试。
- `Broadcast/SaySoBroadcastHandler.swift`、`Broadcast/CapturePipeline.swift`：回调源序号、生命周期和依赖接线。
- `Shared/ExecutionCoordinator.swift`、`Shared/ExecutionCoordinator+Capture.swift`、`Shared/ExecutionCoordinator+Session.swift`：复用现有重复呈现/心跳。
- `NetworkTests/HeartbeatAppliedTests.swift`：实际心跳请求体中的新增字段和不发送绝对时间的检查。
- `NetworkTests/Contracts/current-actions.json`：同步生成的工具说明。

Worker 共 11 个文件：

- `lib/static-screen-freshness.ts`：证明验证、同一快照中的动作屏障、输出和交付复核。
- `lib/repeat-presentation.ts`、`lib/bridge-engine.ts`、`lib/screen-snapshot-query.ts`：既有事务和读屏接线。
- `lib/mouse-control.ts`、`lib/mcp-protocol.ts`、`lib/mcp-performance.ts`：原命令后图、最终交付和文本警告。
- `lib/mcp-tool-catalog.ts`：中英文语义和图片转交说明。
- `tests/bridge.test.ts`：真实内存 SQLite、模拟 R2 和实际 MCP 响应的回归用例。
- `contracts/current-actions.json`、`contracts/openapi.json`：同步生成的工具说明。

## 离线验证

最终候选已包含同步后的合同说明，验证结果如下。所有测试均为离线软件证据，不代表真机验收。

| 最终全量检查 | 结果 | 证据 |
|---|---|---|
| App `swift test` | 765 项，2 项跳过，0 失败；运行约 120 秒 | `evidence/app-full-tests.log`、`evidence/checks.json` |
| App `iphoneos / test-dual` 无签名构建 | 通过 | `evidence/app-unsigned-test-dual.log` |
| App `iphoneos / production` 无签名构建 | 通过 | `evidence/app-unsigned-production.log` |
| Worker 全量测试 | 879 项，876 通过，3 项跳过，0 失败；运行约 158 秒 | `evidence/worker-full-tests-release-candidate.log` |
| Worker `tsc --noEmit` | 通过 | `evidence/worker-typecheck-final.log`（无错误输出） |
| Worker `npm run build` 及 postbuild | 通过 | `evidence/worker-build.log`、`evidence/worker-build-result.json` |

Worker 的 3 项跳过均为隔离 worktree 未携带插件技能包的检查。App 的 2 项为既有 `LocalReadyCueTests.testMapTileCueSeparatesActualBlankAndRenderedPhoneMaps`、`ReviewedParkedPressTests.testActualParkedCursorMustStillMatchTargetAndLandmarkExactly` 条件跳过；完整名称及原因保留在日志。

专项及静态验证：

| 检查 | 结果 |
|---|---|
| Worker 静止新鲜度专项 | 51 项通过，0 失败 |
| 冻结 `f654165` 加相同回归用例 | 已执行的 45 项中有 6 项按预期失败，包括两种方向的静止读屏、动作后无变化和长时间静止；证明测试能够检出原缺陷 |
| 工具目录对照 | 公开 15 个、开发目录共 27 个；递归移除 `description` 后与基线完全相同 |
| 三份生成合同对照 | Worker 两份和 App 一份均只有 `description` 变化 |
| 合同生成检查 | `--check --ios ../app` 通过，指向独立 App worktree |
| App 停止顺序 | 3 项通过；`CapturePipeline.finish` 和 `AppModel.stopSharing` 与基线逐字比较相同 |
| App 接线 / 授权检查 | 2 项 / 6 项通过 |
| 两仓库源码预算 | 通过，未提高预算限制 |
| Worker 类型检查、离线构建 | 通过；构建后 61 个 JS artifact 的生产诊断边界检查通过 |

专项覆盖：静止超过 2 秒、60 秒静止、失去上传回执后的 latest-accepted 心跳、心跳中断/过期/边界值、回调帧号不一致、回调先到但图片未上传、共享暂停/恢复/错误/未证明状态、跨 owner/会话/租约、捕获时钟未知、图像过期、执行点击/输入/滚动/拖动后拒绝普通放宽、1500 ms 前后动作后图、另一动作和未确认动作、共享停止清图、交付期间状态变化、数据库复核失败，以及撤下图片时撤下旧警告。App 离线用例另覆盖静止证明存在时横屏控制仍拒绝。

首轮 App 测试暴露的 URLProtocol 流式请求体读取问题已修正测试桩；早期 Worker 检查暴露的工具文案长度、图片转交提示和生成合同不同步均已修正。初始失败日志留在证据目录，最终结果单独保存。

Mac 最终候选目录：`/Users/david/Developer/SaySo-candidates/static-freshness-20261120-candidate/`。源码由独立 App worktree 的受版本管理文件及本次新增 Swift 文件打包，280 个文件逐项 SHA-256 核对，未复制本地配置、签名材料或旧构建目录。无签名构建只使用 `generic/platform=iOS` 和 `CODE_SIGNING_ALLOWED=NO`。

## 真机待验证与部署前事项

本轮没有执行以下项目，也没有据离线结果关闭 T52：

1. iPhone 11 横屏静止读屏 3 次、全屏相册 2 次、竖屏静止 60 秒 2 次，检查实际图片和静止标注。
2. 动作后无变化 1 次，核对至少 1.5 秒后的旧图、明确警告和没有重复输入；另验证有新帧时仍返回动作后新图。
3. 共享暂停、结束、心跳断开时无图；横屏控制仍拒绝，原停止与释放行为回归。离线停止顺序检查不代表真机“两秒停止”性能验收。
4. iPhone 16 Pro 竖屏静止亲测，确认灵动岛录屏标记是否进入截图。该项不能由 iPhone 11 或代码推断替代。

按设计先由 Claude 评审；部署和装机需另行取得用户授权。需要成套核对 App/Worker 版本和工具说明缓存：旧 App 不提供回调证明时，新 Worker 继续拒绝过龄图；旧 Worker 也不会自动获得本次静止能力。无需 D1 迁移。复用现有单帧及重复呈现有效期，没有新增截图历史存储。

上线后重点观察保守拒绝：若最后回调未成为成功上传帧、存在时钟不明的历史命令或网络/探针失效，将继续没有图；这些情况不能以放宽序号、哈希或动作屏障来掩盖。静止图保留真实旧图龄，仅供描述；不能冒充动作后新帧或可执行输入的定位证明。

## Claude 评审（2026-11-20 13:45）

**整体通过**：只在"心跳证明之后没有新回调、期间没执行动作"时放宽，复用重复呈现链路，交付前再复核，停止和横屏控制都没动，冻结版本加同样的用例能测出原缺陷，测试有效。

**要改一处（重要）**：现在静止图标了 `usable_for_input=false`，不能拿来定位点击。这样在画面不动的页面上（比如设置首页），AI 能读到图，却**点不了**：它拿这张图去点，会因为没有可用的定位证明被拒绝。iPhone 16 Pro 这类灵动岛机型画面经常是静止的，**控制在静止页面上会整个用不了**。

**改法**：静止证明成立的图，也可以用来定位输入，但要加两道检查：
1. 发出图的时候，静止证明成立（现在已经有）；
2. **执行点击、输入的那一刻再核对一次**：从这张图的帧之后仍然没有新回调、没有别的动作执行过、心跳在 2 秒内。只要有一条不满足，就拒绝执行，返回明确的原因码（例如 `SCREEN_CHANGED_SINCE_IMAGE`），让 AI 重新读屏。

这样"画面没变"时可以点，画面一变就拒绝，和"不拿旧图做判断"的原则一致。动作后没变化的警告图（`ACTION_NO_SCREEN_CHANGE`）仍然不能用于输入，要先重新读屏。

改完后补测试：静止图点击成功；点击前来了新回调就拒绝；点击前执行过别的动作就拒绝；心跳过期就拒绝；警告图不能用于输入。


## 静止图输入修订结果（2026-11-20）

按 `CODEX_PROMPT_STATIC_INPUT_20261120.md` 和上节 Claude 评审完成离线修订。本节更新前文“静止图仅供描述、`usable_for_input=false`、不提供输入定位证明”的历史结论；`ACTION_NO_SCREEN_CHANGE` 警告图继续不可用于输入。仍为离线候选，T52 未结案。

### 最终行为与执行关口

- 普通静止证明成立时，保留 `state=repeated`、原始捕获时间和真实旧图龄，设置 `usable_for_input=true`，签发带 `staticScreen=true` 的既有 HMAC frame reference，提供 `source_point_proof` 和 `image_handoff`。不伪造新捕获，不放开普通 repeated 图。
- 定位点击与拖动绑定实际交付的静止来源。当前无来源参数的输入、滚动及单独移指针继承最近一次交付的静止参考，不增加工具参数。静止参考在交付前保存，避免下一次调用先于后台保存发生。
- 入队事务、直接授予执行许可的 raw claim、以及传统 `/start` 均复核：原帧 ID/序号/源回调序号/哈希/几何仍一致，最新回调仍对应原帧，没有别的已执行或可能执行的动作，心跳接收和已验证的重复呈现均严格未满 2000 ms，owner/共享会话/广播/worker/租约/控制/硬件一致且授权有效。即使新回调的像素相同，也不能沿用旧静止参考。
- 失效时拒绝新入队，或把已排队/已 claim 的原命令及配套 embedded click 标为 `failed / SCREEN_CHANGED_SINCE_IMAGE / input_attempted=false`，不授予执行许可，不发送输入，不重发原动作。过期、撤权等既有独立门禁继续生效。
- `ACTION_NO_SCREEN_CHANGE` 继续 `usable_for_input=false`，不签发定位证明和 handoff；中英文说明继续提示可能未点中或未生效。`read_screen` 说明及公共工作流增加“静止图可操作；收到 `SCREEN_CHANGED_SINCE_IMAGE` 重新读屏；警告图不可作为输入依据”。
- D1 实际解析器暴露了新增条件树超过深度 100 的问题；已将静止执行校验独立 materialize，并平衡条件树。没有删减校验条件。传统 `/start` 保持一个原子语句，保留原来的剩余执行预算。

Worker 新增 `static-input-freshness.ts`；为保持原源码预算，将既有视觉来源和拒绝诊断函数移至 `visual-point-source.ts`、`point-admission-diagnostic.ts`。未提高源码预算，未新增工具、参数、D1 表或迁移。App 本轮只更新生成合同的说明文字，Swift 实现未改。

### 本轮验证

证据目录：`C:/Users/USER/Documents/Playground/sayso-static-freshness-20261120/evidence/static-input/`。所有新测试均为离线软件夹具，不代表真机验收。全量的 3 项跳过来自隔离 worktree 缺少插件技能包的既有条件跳过。

| 检查 | 最终结果 | 证据 |
|---|---|---|
| Worker 全量测试 | 936 项，933 通过、3 跳过、0 失败；约 147 秒 | `worker-full-tests.log`、`worker-full-tests.json` |
| 新增静止输入专项 | 57 项通过，0 失败 | `targeted-input-final.log`；最终全量包含相同用例 |
| 类型检查 | `tsc --noEmit` 通过 | `worker-typecheck.log` |
| 离线构建及 postbuild | 通过；61 个 JS artifact 的生产诊断边界通过 | `worker-build.log` |
| D1 本地真实解析器 | 点击、输入、滚动、拖动、单独移指针相关 SQL 的 EXPLAIN 通过；外发请求为 0 | 全量中的 `static input: execution SQL fits the actual offline D1 parser` |
| 生成合同及目录对照 | 三份 JSON 仅 description 变化；公开 15 个、开发目录共 27 个，移除 description 后与基线一致 | `artifact-comparison.json`、`catalog-comparison.json`、`worker-contracts.log` |
| 源码预算、格式 | 通过，预算未提高 | `worker-source-budgets.log`、`worker-format.log` |
| App 本轮本地源码检查 | 停止顺序 3 项、接线 2 项、授权 6 项及源码预算全部通过 | `app-stop.log`、`app-wiring.log`、`app-consent.log`、`app-source-budgets.log` |

评审要求的五种情况均有覆盖：静止图点击获准；执行前新回调拒绝；其他动作拒绝；心跳到 2000 ms 边界即拒绝；警告图不能生成输入参考。另覆盖四类动作的入队/排队后检查、会话/租约变化、传统 start、相同像素的新回调、幂等回读及单独移指针。

App 的 280 个文件与上一轮编译候选逐项 SHA-256 对照，只有 `NetworkTests/Contracts/current-actions.json` 改动，且仅 description 变化。**本轮 Windows 环境没有重新运行 `swift test` 或 Xcode 构建**；沿用前文 765 项 Swift 测试（2 项跳过、0 失败）和 test-dual / production 两种无签名构建证据。源码一致性与既有检查结果保存在 `artifact-comparison.json`，不将旧构建表述为本轮重跑。

早期失败包括目录文案长度、图片转交提示，以及 D1 条件树深度；均已修正，保留对应日志。最终结果使用上表所列文件。新源码清单见 `worker-input-source-manifest.json`。

### 本地提交与边界

| 仓库 | 分支 | 本轮本地提交 |
|---|---|---|
| Worker 独立 worktree | `codex/static-freshness-20261120` | `7dcc9ae4d31f21785008240566540146b1b1a6ba` |
| App 独立 worktree | `codex/static-freshness-20261120` | `809b1e5358d06d0926fc3829afd8973056cd7c8c` |

主 SaySo 仓库本轮只提交本文。原 App、原 Worker 工作目录及其他执行者的改动未写入；本轮未连接 Mac 编译机、iPhone、板、WDA 或 SaySo 实时工具，未部署、安装、推送或输出凭证。后续部署、装机和真机验收仍需另行授权；不能据离线通过宣称真机控制或 T52 已验收。

## Claude 评审静止图输入修订（2026-11-20 14:15）

**通过**，一处必须改：

- 静止证明要求"心跳接收和重复呈现都严格未满 **2000 ms**"。这是 Claude 设计里写错的数（设计已更正）：心跳每 2.5 秒一次，请求本身约 1 秒，两次心跳成功之间常有 3 秒多。按 2 秒，静止读屏和静止点击会经常被拒，静止画面等于没修好。**改成 5000 ms**（约两个心跳周期），读屏放宽和执行时复核两处都改；常量写明理由；补边界测试（4999 通过、5000 拒绝、心跳间隔 3.6 秒的正常情况通过）。
- 执行时的复核放在服务端入队、领取、开始这几处，和原有的执行检查在同一个事务里，不多一次网络往返。和 Claude 跟用户说的"在手机上比对"不同，但延迟同样可以忽略，接受这个做法。
- 其余（警告图不能用于输入、失效返回 `SCREEN_CHANGED_SINCE_IMAGE`、不发输入不重发）都符合要求。

## 静止证明五秒上限修订结果（2026-11-20）

按 `CODEX_PROMPT_STATIC_5S_20261120.md`、已更正的设计及 D104 完成离线修订。本节替代前文关于静止证明“严格未满 2000 ms”和“较小 max_age_ms 约束证明年龄”的历史结论；仍为离线候选，T52 未结案。

### 实现与语义

- `lib/static-screen-freshness.ts` 的唯一常量 `staticHeartbeatLimitMS` 改为 `5000`。注释说明：心跳每 2.5 秒一次，请求约 1 秒，成功心跳常相隔 3 秒多，5 秒约两个周期。心跳接收与已验证重复呈现的年龄均须非负且严格小于此值；4999 ms 可用，5000 ms 拒绝。
- 静止读屏 SQL、交付前 SQL、静止输入入队、raw claim 和传统 start 原本共用 `staticScreenSQL`，因而统一使用这一常量；执行关口仍在原有事务内，没有增加网络往返。
- 已拆开三处与调用方图龄的耦合：`staticFrameEligible` 不再接收 `maxAge`；取图后的通用 repeated 年龄检查仅用于非静止分支；MCP 最终序列化交付的 `staticScreenAtRelease` 不再接收 `maximum`，内部也不再取 `Math.min(maximum, staticHeartbeatLimitMS)`。`max_age_ms` 继续约束普通捕获的图龄，不缩短静止证明的五秒期限。
- 静止图仍保留原始捕获时间和真实旧图龄。来源、回调序号、动作屏障、授权、方向和警告图规则沿用既有实现；`ACTION_NO_SCREEN_CHANGE` 仍不能签发输入参考。App 本轮没有任何源码或合同改动，无需 D1 迁移。

### 本轮离线验证

证据目录：`C:/Users/USER/Documents/Playground/sayso-static-freshness-20261120/evidence/static-5s/`。使用已有本地依赖；检查进程移除继承的凭证环境变量，关闭遥测、远程 Cloudflare fetch 和 npm 在线行为。没有运行安装命令。

| 检查 | 结果 | 证据 |
|---|---|---|
| 修改前新增回归 | 在旧实现下按预期失败，包含 3.6 秒读屏/点击和五秒边界通过情形 | `worker-regression-before.log` |
| 静止读屏与输入全部专项 | 140 项通过，0 失败、0 跳过 | `worker-static-tests.log` |
| Worker 全量测试 | 968 项，965 通过、3 跳过、0 失败，约 150 秒 | `worker-full-tests.log`、`worker-full-tests.json` |
| 类型检查 | `tsc --noEmit` 通过 | `worker-typecheck.log` |
| 离线构建及 postbuild | 通过；61 个 JS 产物的生产诊断边界检查通过 | `worker-build.log` |
| D1 本地真实解析器 | 五类输入 SQL 的 EXPLAIN 通过；该用例外发请求为 0 | 全量及专项中的 `static input: execution SQL fits the actual offline D1 parser` |
| 工具目录及生成合同 | 工具共 27 个，公开 15 个；移除 description 后与原基线一致；本轮目录源码与三份合同也与 `7dcc9ae` / `809b1e5` 逐字一致（仅归一化换行） | `catalog-comparison.json`、`artifact-comparison.json` |
| 合同检查 | `--check --ios ../app` 通过，指向独立 App worktree | `worker-contracts.log` |
| 源码预算及格式 | 全部通过，预算没有提高 | `worker-source-budgets.log`、`worker-format.log` |
| App | worktree 干净，仍为 `809b1e5358d06d0926fc3829afd8973056cd7c8c`；本轮未重跑 Swift 测试或 Xcode 构建 | `artifact-comparison.json` |

三个全量跳过仍为隔离目录没有插件技能包导致的既有条件跳过，不是本轮新跳过。

新增测试分别对心跳接收和重复呈现时间检查：读屏的 3600 / 4999 / 5000 ms，序列化后交付的 4999 / 5000 ms，以及入队、raw claim、传统 start 三个执行关口的 3600 / 4999 / 5000 ms。读屏显式传入更小的 `max_age_ms=1000`。另有真实推进测试时钟 3600 ms、没有补发心跳的完整链路：能读到静止图、保留超过 6.6 秒的真实图龄、随后点击获得执行许可及配套点击命令。

原有心跳过期测试改到五秒边界；排队输入测试单独将证明时间置为过期，避免推进五秒时同时触发命令自身 TTL 而掩盖证明拒绝原因。首轮测试因此暴露的命令过期断言冲突已修正，仅调整测试夹具，原命令 TTL 未变；初始失败日志保留为 `worker-static-tests-initial.log`。

### 隔离、记录和本地提交

Worker 继续在 `C:/Users/USER/Documents/Playground/sayso-static-freshness-20261120/worker`、`codex/static-freshness-20261120` 分支上修改，起点为 `7dcc9ae4d31f21785008240566540146b1b1a6ba`。本轮提交包含三个实现文件、一个测试文件及本文的独立副本；最终提交号由本次中文汇报及该 worktree 的 Git HEAD 记录。

用户本轮明确要求“不动原工作目录”，优先于任务文件末项“主仓库只提交这份文档”。因此原 SaySo、App、Worker 工作目录均没有写入，未在主 SaySo 仓库提交；本文从原记录复制后仅在独立 Worker worktree 的 `docs/STATIC_FRESHNESS_IMPL_20261120.md` 追加并本地提交。证据保存在上述独立目录。

本轮没有连接任何设备、Mac 编译机、板、WDA 或 SaySo 实时工具；没有部署、安装、推送或输出凭证。离线通过不代表真机验收。
