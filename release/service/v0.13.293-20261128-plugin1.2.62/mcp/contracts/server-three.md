# 服务端三项候选（基线 6a364e5，离线）

## 返回投影清单（先于实现冻结）

| 处理 | 字段 |
|---|---|
| 保留，原名原值 | state/error/reason、所有原命令 ID、move/click 分别结果、verification、input_attempted/input_not_submitted、typed_count/typed_count_exact、取消与松键状态、after_screen、metadata、source_*_proof、image_handoff、静止/图龄/帧/几何及 after_command 证明 |
| 从模型投影删除 | trace.native_transport、逐次 recovery 诊断、payload、precondition、已验签 board_receipt 的签名/详细硬件字段；完整领域结果仍供服务端放行检查 |
| 收敛 | 回执中的计数、enter_sent、all_released 和 cancellation_release 提升为安全摘要；move_result 仅删除诊断及已验签签名，保留分步状态 |
| 缩短 | 2026-07-28 且显式 result_projection=compact_v1 的 text 为简短 JSON 状态；完整决策投影位于 structuredContent。省略参数或旧协议继续原 text/structuredContent，兼容旧客户端及全部原合同测试 |
| 改名 | 无；安全字段与技能引用名不改 |

适用于 read_screen 和动作/原 ID 观察；管理、配对、指南及调试报告的合同保持原格式。新增参数在 schema 中明确宣告；插件 1.2.55 在支持时选择。压缩版标记 result_projection=compact_v1。图片字节及最后放行 guard 不变。未知、部分输入、未提交、取消与缺图不得改写成成功。

## 最小记录

生产与诊断开关分离。只保存枚举、服务端请求 UUID、UTC/单调钟起止、结果、体积和内部 owner/device/session 隔离标识；不保存参数、内容、坐标、proof、URL 或凭证。24h TTL，每设备 200 条，全表最小记录 2000 条。

最终放行后只能把完整记录放入有界内存队列，在**下一次已有写批次**中附带 upsert/清理；不创建日志专用 D1 往返。最后一条的持久化依赖后续已有写流量；进程退出可能丢失队尾。报告明确标注此覆盖限制，间隔只称观测到的边界外等待，不称纯模型推理。队列最多 200 条、每批最多 16 条，失败重排且不重试原业务。

## open_app_search

命名表示只准备 App 搜索结果，不承诺已打开 App。输入 device_id/app_name/idempotency_key；App 名遵守现有 printable ASCII 与系统搜索别名/拼音例外。内部搜索与输入各一次，无 Return 参数。持久化父操作先占位，重复/并发/崩溃重连只观察原子命令，绝不继续或重发。

搜索 ACK、同作用域新后图和现有 system_search_stable 就绪证明齐备，才允许输入。每次准入事务再次检查父操作未停止、原 session/worker/lease/control/hardware/boot 与几何；输入还校验原搜索回执、无后续输入、当前同内容图。取消事务同时关闭父操作，无组合大锁。返回一个最新步骤图片，operation_id、search_command_id、type_command_id、原 command_id、step_command_id、step、code、enter_sent=false。子命令 ID 在父操作中预分配，D1/响应未知时仍可查原 ID；command_ids_preallocated=true 不证明已准入，查不到也不得重发。SEARCH_NOT_OPEN/TEXT_UNCONFIRMED/STOPPED/OPERATION_UNCONFIRMED/NEEDS_TARGET_REVIEW 均不代表 App 已打开。父占位事务是取消边界；父操作建立后，任何后续准入都受同事务取消检查约束。

失败时保留最后已观察且仍通过原放行规则的图片；若它在未确认步骤之前，标为 image_observation=before_unconfirmed_step / image_usable_for_input=false，不产生 image_handoff 或新操作 proof。过期或作用域失效仍丢图，不能把失败前图片当作该输入成功后的图片。
