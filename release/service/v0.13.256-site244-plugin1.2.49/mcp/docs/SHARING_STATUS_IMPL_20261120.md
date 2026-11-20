# 屏幕共享状态：离线实现记录

日期：2026-11-20。任务依据：`docs/CODEX_PROMPT_SHARING_STATUS_20261120.md`、D85 / D103 / D105，以及独立 App worktree 的 `Core/HomePresentation.swift`、`Core/UserExperienceState.swift`、`App/UserExperienceModel.swift`。

本轮已完成离线实现与验证。没有连接手机、配件、WDA、SaySo 实时工具或 Mac；没有部署、安装、推送或输出真实凭证。离线测试不代表 ChatGPT Live 或真机验证结果。

## 工作位置与本地提交

所有实现均在既有独立 worktree 上完成，未改原 Worker / App 工作目录。

| 仓库 | 独立 worktree | 分支 | 实现提交 |
|---|---|---|---|
| Worker | `C:/Users/USER/Documents/Playground/sayso-static-freshness-20261120/worker` | `codex/static-freshness-20261120` | `5ec3720ceab0f21625944a344696db8aeedd4fac` |
| App（仅生成合同） | `C:/Users/USER/Documents/Playground/sayso-static-freshness-20261120/app` | `codex/static-freshness-20261120` | `d7991e86d8da5342e7ef2960295fc1531144672e` |

Worker 从已完成的工具文案提交 `5a15c96` 开始；App 基线为 `2a04e1b`。本文另存于 Worker 分支的 `docs/SHARING_STATUS_IMPL_20261120.md`，主 SaySo 仓库本轮只提交本文。

## 新返回字段

`GET /v1/device/status` 与 `list_devices` 的每台手机增加同一个 `home_status`，按首页四行顺序返回：

| 字段 | 固定代码 | 判定 |
|---|---|---|
| `service` | `connected` | 这次经过身份验证的服务请求可达；不代表手机共享租约有效 |
| `screen_sharing` | `active` / `not_started` / `paused` / `interrupted` | 无当前广播或已停止为 `not_started`；当前广播的租约过期为 `interrupted`；有效租约内按 active / paused 区分，其他未能证明活跃的状态为 `interrupted` |
| `accessory` | `connected` / `not_connected` / `not_needed` | 有效租约且 USB 已连接为 `connected`；有绑定记录但不满足连接条件为 `not_connected`；没有绑定记录且没有连接为 `not_needed` |
| `tapping_for_you` | `allowed` / `not_allowed` / `stopped` / `paused` / `not_needed` | 不需要配件时为 `not_needed`；已有显式停止标记为 `stopped`；共享暂停/中断为 `paused`；当前鼠标会话可用为 `allowed`；从未允许为 `not_allowed`；既往会话已失效按停止、拔出或到期区分 |

`summary_zh` / `summary_en` 各用一句话描述这四行，例如：

> SaySo 服务已连接，屏幕正在共享，SaySo 设备已连接，帮你点未允许。

`online=false` 从不被解释成 App 已关闭。旧 `screen_only` 在从未允许帮你点时也可能为真，因此没有用它代替配件绑定状态。只读屏、未绑定配件的手机返回两项 `not_needed`；已绑定但拔出的配件返回 `not_connected`。

现有 Worker 不接收 App 的所有本地界面状态，例如 `UIScreen.main.isCaptured`、`screenOnlyMode` 偏好和本地 `uxControlStopped`。本次四行来自当前服务快照，不能据此声称读取到了这些本地标记；本地启动/结束动画归并到任务要求的四种共享代码。没有增加设备协议字段、表或迁移。

## 无图与说明

- 工具目录的 `list_devices` 说明和 MCP `initialize.instructions` 共享同一段中英文文案：屏幕相关请求且不确定是否共享时先调用 `list_devices`，按 `home_status` 回答；未在共享时提示“请在 SaySo 里点开始屏幕共享”。新增说明遵循 D105。
- `read_screen` 最终没有图片时，在图片交付检查之后，增加一次有 owner 范围的只读状态快照，把相同的 `home_status` 放进 `structuredContent` 和新增文本块；保留原来的 state、reason、文本和元数据。图片在序列化后被撤下，也会补当前状态。
- 成功交付图片或成功复用 `unchanged` 引用时，不增加状态查询。
- 明确指定设备时按该设备筛选，支持默认列表 20 台上限以外的已拥有设备；外部 owner 或已失效的明确选择不会换成另一台手机。
- 无明确选择且有多台手机时，顶层 `home_status=null`，`home_status_devices` 提供各台手机的同结构状态；已有 `choose_device.devices` 逐项增加状态，避免把某台状态套到另一台。无已配对设备时给出服务已连接、共享未开始的状态。
- 若补充状态查询本身失败，保留原来的无图结果，返回 `home_status=null` 与 `home_status_error=STATUS_UNAVAILABLE`，不编造共享状态。

## 改动位置

- `lib/home-status.ts`：四行映射、中英文摘要和共享查询说明。
- `lib/device-status.ts`：抽出原状态格式化逻辑并追加新对象；旧字段语义保持不变。
- `lib/bridge-engine.ts`：两种状态入口复用格式化逻辑；列表单一快照增加已有的 `mouse_grant_request`，用于区分停止状态；保留默认 20 台上限。
- `lib/missing-screen-status.ts`、`lib/mcp-protocol.ts`：最终无图补充状态及失败处理。
- `lib/mcp-tool-catalog.ts`、`lib/interaction-guidance.ts`：共享中英文说明。
- `tests/home-status.test.ts`、`tests/bridge.test.ts`：映射、真实内存 SQLite / MCP 回归；无图查询计数断言同步适配，并继续断言没有写操作。
- Worker `contracts/current-actions.json` / `contracts/openapi.json`、App `NetworkTests/Contracts/current-actions.json`：同步生成的说明文字。App Swift 源码未改。

## 最终离线验证

证据根目录：`C:/Users/USER/Documents/Playground/sayso-static-freshness-20261120/evidence/sharing-status/`。

| 检查 | 结果 | 证据 |
|---|---|---|
| Worker 全量测试 | 989 项，989 通过，0 跳过，0 失败 | `worker-full-tests.log`、`checks.json` |
| 类型检查 | `tsc --noEmit` 通过 | `worker-typecheck.log` |
| 离线构建及生产产物检查 | 通过 | `worker-build.log`、`worker-postbuild.log` |
| 合同同步 | 三份生成合同 `--check --ios ../app` 通过 | `worker-contracts.log` |
| 源码预算 | 通过，未提高限制 | `worker-source-budgets.log` |
| 格式 | 仓库格式检查及新文件检查通过 | `worker-format.log`、`new-files-format.log` |
| 新行为及相关回归专项 | 29 项通过，0 失败；完整最终测试包含相应用例 | `targeted-final.log` |
| 旧状态字段对照 | 864 组输入，移除新增对象后与 `5a15c96` 原格式化函数完全一致 | `audit.ts`、`baseline-status.ts`、`audit.json` |
| 工具目录及合同结构对照 | 公开 15 个、开发目录共 27 个；三份合同递归移除 `description` 后与各自基线完全一致 | `audit.json` |

映射专项包含 64 组租约、捕获与配件组合及 11 组帮你点分支；集成测试覆盖 App 开着但共享租约无效、未开始共享、暂停、中断、停止帮你点、配件拔出、会话到期、只读屏、多手机与 owner 范围、超过列表上限的明确选择、交付前撤图，以及状态数据库不可用。

构建和测试使用现有本地依赖，禁用遥测及 Cloudflare 远程 fetch，移除继承的凭证类环境变量；没有安装依赖。App 本轮仅同步合同文本，未重新运行 Swift / Xcode 构建。

首轮日志保留在 `worker-full-tests-initial.log` / `checks-initial.json`：发现并修正了旧 `next_step` 文案兼容检查、无图多一次状态查询的计数断言，以及补充查询失败时影响原响应的问题。新增上限测试最初出现的夹具 token_hash 重复已修正。最终结论以上表日志为准。
