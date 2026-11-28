import {parsePlacementJSON} from "./d1-placement.ts";
import { BridgeError, integer, type BridgeEngine, type User } from "./bridge-engine.ts";
import {
  debugHash,
  debugNumber,
  debugObject,
  debugEnvironment,
  debugUUID,
  type DebugSnapshot,
} from "./debug-scope.ts";
import { debugCode, debugReasons } from "./debug-reasons.ts";
import { allMcpTools } from "./mcp-tool-catalog.ts";
import { runtimeVersion } from "./runtime-identity.ts";
import { journalTTL } from "./timing-journal.ts";
import {performanceSegments,adjacentResidual} from "./perf-boundaries.ts";
import {observedCallGap} from "./minimal-call-gap.ts";
import {callImageFields} from "./call-image-journal.ts";
import {actionJournalIDs,actionJournalTimes,actionJournalFields} from "./action-journal.ts";
import {maintenanceHealth,retentionInventory} from "./maintenance-health.ts";

const unknown = "未知",
  empty = "—",
  tools = new Set(allMcpTools.map((v) => v.name));
export function debugSGT(value: unknown) {
  const n = debugNumber(value);
  return n === null || n > 8.64e15 - 28_800_000
    ? unknown
    : new Date(n + 28_800_000).toISOString().replace("T", " ").replace("Z", " SGT");
}
const number = (v: unknown) => debugNumber(v) ?? unknown;
const identifier = (v: unknown) => debugUUID(v) ?? unknown;
const bool = (v: unknown) => v === true || v === 1;
const cell = (v: unknown) =>
  String(v ?? empty)
    .replaceAll("|", "\\|")
    .replace(/[\r\n]/g, " ");
const table = (head: string[], rows: unknown[][]) =>
  [
    "| " + head.join(" | ") + " |",
    "|" + head.map(() => "---").join("|") + "|",
    ...rows.map((row) => "| " + row.map(cell).join(" | ") + " |"),
    ...(rows.length ? [] : ["（无可用记录）"]),
  ].join("\n");
type Stored = {
  received_utc_ms: number;
  data_json: string;
  command_state: string | null;
  command_error: string | null;
  command_id: string | null;
  parent_command_id: string|null;child_command_id:string|null;command_timing_json:string|null;
};
type Operation = {
  time: string;
  request: string;
  tool: string;
  result: string;
  error: string | null;
  step: string;
  elapsed: number | null;
  command: string | null;
  frame: number | null;
  attempt: number | null;
  success: boolean;
};
type Event = { at: number; event: string; detail: string };
const inputTools = new Set([
  "click_at",
  "drag_at",
  "move_mouse_to",
  "move_mouse",
  "click_mouse",
  "scroll_mouse",
  "type_text_in_field",
  "open_system_search",
  "open_app_search",
]);
const controlErrors = new Set([
  "START_MOUSE_SHARING",
  "FIELD_CONTROL_CHANGED_OR_BUSY",
  "MOUSE_BUSY_OR_CONTROL_CHANGED",
  "REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED",
  "REVIEWED_POINT_NOT_READY",
  "DRAG_FRAME_OR_CONTROL_CHANGED",
  "SYSTEM_SEARCH_FRAME_OR_CONTROL_CHANGED",
  "EXPIRED_OR_CONTROL_CHANGED",
  "MOUSE_EXPIRED_OR_CONTROL_CHANGED",
  "MOUSE_NOT_CONNECTED",
  "SCREEN_CHANGED_SINCE_IMAGE",
]);
// Stored journals, including legacy rows, are untrusted display input.
function safeCallRow(data: Record<string, unknown>, legacy = false) {
  const member = (value: unknown, allowed: string[]) =>
    typeof value === "string" && allowed.includes(value) ? value : value == null ? empty : unknown;
  const parameters = debugObject(data.parameters), safe: Record<string, unknown> = {};
  if (Object.hasOwn(parameters, "result_projection"))
    safe.result_projection = member(parameters.result_projection, ["image_only", "compact", "compact_v1", "full"]);
  for (const key of ["wait_for_new_ms", "max_age_ms", "after_command_min_gap_ms", "settle_ms", "text_chars"])
    if (Object.hasOwn(parameters, key)) safe[key] = number(parameters[key]);
  for (const key of ["include_read_timing", "submit", "clear_before_input", "if_unchanged_since",
    "after_command_id", "device_id", "source_frame_id", "idempotency_key"])
    if (Object.hasOwn(parameters, key)) safe[key] = typeof parameters[key] === "boolean" ? parameters[key] : unknown;
  return [
    member(legacy ? data.rpc : data.method, ["server/discover", "initialize", "notifications/initialized", "tools/list", "tools/call",
      "ping", "resources/list", "resources/templates/list", "resources/read", "prompts/list", "prompts/get",
      "notifications/cancelled", "notifications/progress", "logging/setLevel", "completion/complete"]),
    typeof data.tool === "string" && tools.has(data.tool) ? data.tool : data.tool == null ? empty : unknown,
    identifier(data.request_id),
    typeof data.runtime_version === "string" && /^\d{1,4}\.\d{1,4}\.\d{1,6}$/.test(data.runtime_version) ? data.runtime_version : unknown,
    ...["received_utc_ms", "released_utc_ms", "boundary_elapsed_ms"].map(key => number(data[key])),
    member(data.outcome, ["ok", "error", "incomplete"]), debugCode(data.error_code), debugCode(data.result_code),
    member(data.result_state, ["queued", "claimed", "executing", "board_acked", "failed", "outcome_unknown",
      "cancelled", "expired", "available", "repeated", "unavailable", "pending", "unchanged", "paused", "error"]),
    ...["image_count", "image_bytes", "text_utf8_bytes", "structured_utf8_bytes", "response_bytes"].map(key => number(data[key])),
    ...callImageFields.map(key => data[key] == null ? empty : key === "returned_frame_id" ? identifier(data[key]) :
      key === "image_sha256" ? typeof data[key] === "string" && /^[a-f0-9]{64}$/.test(data[key]) ? data[key] : unknown :
      key === "clock_verified" || key === "static_repeated" ? typeof data[key] === "boolean" ? data[key] : unknown : number(data[key])),
    ...actionJournalIDs.map(key=>data[key]==null?empty:identifier(data[key])),
    JSON.stringify(Array.isArray(data.child_command_ids)?data.child_command_ids.slice(0,8).map(identifier):[]),
    ...actionJournalTimes.map(key=>data[key]==null?empty:number(data[key])),
    typeof data.mcp_session_hash === "string" && /^[a-f0-9]{24}$/.test(data.mcp_session_hash) ? data.mcp_session_hash : empty,
    JSON.stringify(safe),
  ];
}
function stateText(s: DebugSnapshot | undefined, now: number) {
  const active = s?.session_state === "active",
    sharing = active && s?.capture_state === "active";
  const enabled =
    sharing &&
    s?.mouse_enabled === 1 &&
    (s?.input_end ?? 0) > now &&
    s?.online === 1 &&
    s?.usb_connected === 1;
  const control =
    s?.control_stopped === 1
      ? "已停止"
      : enabled
        ? "已允许"
        : s?.mouse_enabled === 1 && (s.input_end ?? 0) <= now
          ? "输入已暂停"
          : "未允许";
  const liveFrame = sharing && (s?.frame_expires ?? 0) > now && debugNumber(s?.frame_seq) !== null;
  return {
    sharing: !s
      ? unknown
      : sharing
        ? "共享中"
        : s.capture_state === "paused"
          ? "已暂停"
          : active
            ? "未共享"
            : "已结束或未开始",
    started: debugSGT(s?.started_at),
    control: !s ? unknown : control,
    grant_mode: s?.grant_mode ?? unknown,
    remaining: s ? Math.max(0, Math.floor(((s.input_end ?? 0) - now) / 1000)) : null,
    epoch: debugNumber(s?.control_epoch),
    accessory: !s ? unknown : s.online === 1 && s.usb_connected === 1 ? "已连接" : "未连接",
    heartbeat: debugSGT(s?.last_seen || null),
    frame: liveFrame ? debugNumber(s?.frame_seq) : null,
    age:
      liveFrame && debugNumber(s?.capture_lower) !== null
        ? Math.round(Math.max(0, now - s!.capture_lower!) / 100) / 10
        : null,
    orientation: liveFrame
      ? ((
          {
            portrait: "竖屏",
            portrait_upside_down: "倒竖屏",
            landscape_left: "横屏",
            landscape_right: "横屏",
          } as Record<string, string>
        )[String(s?.orientation)] ?? unknown)
      : unknown,
    repeated: liveFrame ? (s?.repeated === 1 ? "是" : "否") : unknown,
  };
}

/** All reads are owner + single-device scoped. No retention sweep, write, image load or phone action. */
export async function getDebugReport(
  service: Pick<BridgeEngine, "db" | "now">,
  user: User,
  args: Record<string, unknown>,
  hostname: string,
  maintenanceOwnerID?: string,
) {
  const minutes = integer(args.minutes === undefined ? 15 : args.minutes, 1, 60),
    limit = integer(args.limit === undefined ? 20 : args.limit, 1, 50);
  const device = args.device_id === undefined ? null : debugUUID(args.device_id);
  if (args.device_id !== undefined && !device) throw new BridgeError("INVALID_ARGUMENTS", 422);
  const now = service.now(),
    since = now - minutes * 60_000;
  const {snapshots,placement,maintenance} = await debugEnvironment(service.db, user.id, device, now);
  const health=maintenanceHealth(maintenance,maintenanceOwnerID,now);
  const inventory=health.owner_configured&&user.id===maintenanceOwnerID?await retentionInventory(service.db,now):null;
  const location=parsePlacementJSON(placement);
  if (device && !snapshots.length) throw new BridgeError("NOT_FOUND", 404);
  if (snapshots.length > 1) throw new BridgeError("CHOOSE_DEVICE", 409);
  const snapshot = snapshots[0],
    selected = snapshot?.device_id ?? null,
    events: Event[] = [],
    operations: Operation[] = [],performanceRows:unknown[][]=[],residualRows:unknown[][]=[],associationRows:unknown[][]=[],callRows:unknown[][]=[];
  let retained = 0;
  if (selected) {
    const rows = (
      await service.db
        .prepare(
          `SELECT j.received_utc_ms,j.data_json,c.state AS command_state,c.error AS command_error,c.id AS command_id,
      p.id AS parent_command_id,ch.id AS child_command_id,t.data_json AS command_timing_json
      FROM sb_timing_journal j LEFT JOIN sb_mouse_commands c ON c.id=json_extract(j.data_json,'$.command_id') AND c.owner_id=? AND c.device_id=?
      LEFT JOIN sb_mouse_commands p ON p.id=c.predecessor_id AND p.owner_id=c.owner_id AND p.device_id=c.device_id
      LEFT JOIN sb_mouse_commands ch ON ch.id=json_extract(c.precondition,'$.point.click_command_id') AND ch.owner_id=c.owner_id AND ch.device_id=c.device_id
      LEFT JOIN sb_timing_journal t ON t.record_key=CASE WHEN EXISTS(SELECT 1 FROM sb_timing_journal production
        WHERE production.record_key='minimal:command:'||c.id) THEN 'minimal:command:'||c.id ELSE 'command:'||c.id END
        AND t.received_utc_ms>=? AND t.received_utc_ms<=?
      WHERE json_valid(j.data_json) AND j.received_utc_ms>=? AND j.received_utc_ms<=?
      AND json_extract(j.data_json,'$.scope_owner_hash')=?
      AND (EXISTS(SELECT 1 FROM json_each(j.data_json,'$.scope_device_ids') WHERE value=?) OR json_extract(j.data_json,'$.scope_kind')='owner')
      AND (json_extract(j.data_json,'$.record_kind')='complete_call' OR j.record_key NOT LIKE 'minimal:%' OR NOT EXISTS(SELECT 1 FROM sb_timing_journal detail WHERE detail.record_key=json_extract(j.data_json,'$.request_id')))
      ORDER BY j.received_utc_ms DESC,j.id DESC LIMIT 200`,
        )
        .bind(user.id, selected, now-journalTTL, now, now - journalTTL, now, await debugHash(user.id), selected)
        .all<Stored>()
    ).results.reverse();
    const companions=rows.map(r=>debugObject(JSON.parse(r.data_json)));
    const seenRequests=new Set<string>();
    let priorCall:Record<string,unknown>|undefined;
    const attempts = new Map<string, { at: number; count: number }>();
    let previous: Record<string, unknown> | undefined;
    for (const row of rows) {
      const data = debugObject(JSON.parse(row.data_json));
      if(data.record_kind!=="complete_call"){
        for(const key of actionJournalIDs)data[key]=null;
        Object.assign(data,{command_id:row.command_id,parent_command_id:row.parent_command_id,
          child_command_ids:row.child_command_id?[row.child_command_id]:[]});
      }
      const commandTiming=row.command_timing_json?debugObject(JSON.parse(row.command_timing_json)):{};
      for(const key of actionJournalTimes)if(commandTiming[key]!=null)data[key]=commandTiming[key];
      if(data.rpc==="tools/call"&&typeof data.request_id==="string"){
        if(data.record_kind!=="complete_call"&&companions.some(v=>v.record_kind==="complete_call"&&v.request_id===data.request_id))continue;
        if(seenRequests.has(data.request_id))continue;
        seenRequests.add(data.request_id);
      }
      if(data.record_kind==="complete_call"&&row.received_utc_ms>=since){
        callRows.push(safeCallRow(data));
      }
      if (
        data.rpc !== "tools/call" ||
        typeof data.tool !== "string" ||
        !tools.has(data.tool) ||
        data.tool === "get_debug_report"
      )
        continue;
      const states = Array.isArray(data.device_states) ? data.device_states.map(debugObject) : [];
      const state = states.find((v) => v.device_id === selected) ?? {};
      if(row.received_utc_ms>=since){
        const observed=observedCallGap(priorCall,data);
        if(data.record_kind!=="complete_call"&&!companions.some(v=>v.record_kind==="complete_call"&&v.request_id===data.request_id)){
          callRows.push(safeCallRow(data, true));
        }
        const command=row.command_timing_json?debugObject(JSON.parse(row.command_timing_json)):
          companions.find(v=>v.record_kind==="command_companion"&&v.command_id===data.command_id)??{};
        const frame=companions.find(v=>v.source==="frame_commit_observed"&&v.frame_id===data.frame_id&&v.frame_history_kind==="upload")??companions.find(v=>v.source==="frame_commit_observed"&&v.frame_id===data.frame_id)??{};
        const clock=debugObject(data.event_clock);
        associationRows.push([identifier(data.request_id),identifier(row.command_id),identifier(row.parent_command_id),identifier(row.child_command_id),
          identifier(data.frame_id),identifier(clock.clock_domain_id??frame.clock_domain_id),debugNumber(data.lookup_attempts)??unknown,debugNumber(data.release_retry_attempts)??unknown]);
        for(const segment of performanceSegments(data,command,frame))performanceRows.push([
          identifier(data.request_id),segment.stage,segment.duration_ms??unknown,segment.error_ms??"未知",segment.source,segment.missing_reason??empty]);
        const gap=adjacentResidual(priorCall,data);
        residualRows.push([identifier(data.request_id),identifier(gap.previous_request_id),gap.O_i??unknown,gap.P_i??unknown,gap.G_i??unknown,
          gap.missing_reason??gap.qualification]);
      }
      priorCall=data;
      const target =
        typeof data.target_key === "string" && /^[0-9a-f]{64}$/.test(data.target_key)
          ? data.target_key
          : null;
      const key = JSON.stringify([data.tool, target, debugUUID(state.session_id)]),
        prior = attempts.get(key);
      const attempt = target
        ? prior && row.received_utc_ms - prior.at <= 60_000
          ? prior.count + 1
          : 1
        : null;
      if (attempt !== null) attempts.set(key, { at: row.received_utc_ms, count: attempt });
      if (row.received_utc_ms >= since) {
        retained++;
        const code = debugCode(data.error_code ?? data.reason_code ?? row.command_error);
        const rawState = data.result_state ?? row.command_state;
        const failed =
          data.outcome === "error" || ["failed", "cancelled", "expired"].includes(String(rawState));
        const success =
          !failed && data.outcome!=="incomplete" &&
          (rawState != null
            ? rawState === "board_acked"
            : inputTools.has(data.tool)
              ? false
              : data.tool === "read_screen"
                ? ["available", "repeated", "unchanged"].includes(String(data.read_screen_state))
                : data.outcome === "ok");
        let step = code ? (debugReasons[code] ?? "未知检查（原因码未收录）") : empty;
        if (code && controlErrors.has(code) && state.control_stopped === true)
          step = "控制许可已停止";
        else if (
          code &&
          controlErrors.has(code) &&
          state.mouse_enabled === true &&
          debugNumber(state.input_end) !== null &&
          Number(state.input_end) <= row.received_utc_ms
        )
          step = "短执行窗口已关闭";
        operations.push({
          time: debugSGT(row.received_utc_ms),
          request: identifier(data.request_id),
          tool: data.tool,
          result: failed
            ? "失败"
            : success
              ? inputTools.has(data.tool)
                ? "成功（配件回执）"
                : "成功"
              : rawState === "outcome_unknown"
                ? "结果未知"
                : "待确认",
          error: code,
          step,
          elapsed: debugNumber(data.boundary_elapsed_ms)??debugNumber(data.handler_to_release_ms)??debugNumber(data.server_elapsed_ms),
          command: debugUUID(row.command_id),
          frame: debugNumber(data.frame_seq),
          attempt,
          success,
        });
        if (data.tool === "stop_mouse" && data.outcome === "ok")
          events.push({
            at: row.received_utc_ms,
            event: "帮你点停止",
            detail: "服务器处理停止请求；不代表配件已确认松键",
          });
        if (previous && state.session_id === previous.session_id) {
          const changes: [string, string, string][] = [
            ["capture_state", "屏幕共享", "状态"],
            ["mouse_enabled", "帮你点", "允许状态"],
            ["usb_connected", "配件", "USB 连接状态"],
            ["online", "设备", "在线状态"],
          ];
          for (const [field, event, detail] of changes)
            if (
              Object.hasOwn(state, field) &&
              Object.hasOwn(previous, field) &&
              state[field] !== previous[field]
            )
              events.push({
                at: row.received_utc_ms,
                event: event + "变化（观测）",
                detail: detail + "在相邻记录间变化；此时间为观测时间",
              });
        }
      }
      if (Object.keys(state).length) previous = state;
    }
    const sessions = (
      await service.db
        .prepare(
          `SELECT created_at,stopped_at FROM sb_sessions WHERE owner_id=? AND device_id=? AND mode='broadcast'
      AND (created_at BETWEEN ? AND ? OR stopped_at BETWEEN ? AND ?) ORDER BY created_at DESC LIMIT 200`,
        )
        .bind(user.id, selected, since, now, since, now)
        .all<{ created_at: number; stopped_at: number | null }>()
    ).results;
    for (const s of sessions) {
      if (s.created_at >= since && s.created_at <= now)
        events.push({ at: s.created_at, event: "共享开始", detail: "会话创建记录" });
      if (s.stopped_at !== null && s.stopped_at >= since && s.stopped_at <= now)
        events.push({ at: s.stopped_at, event: "共享结束", detail: "会话停止记录" });
    }
    if (
      snapshot.mouse_enabled === 1 &&
      (snapshot.input_end ?? 0) >= since &&
      (snapshot.input_end ?? Infinity) <= now
    )
      events.push({
        at: snapshot.input_end!,
        event: "短执行窗口结束",
        detail: "最后确认的执行窗口截止时间",
      });
  }
  const current = stateText(snapshot, now),
    counts = new Map<string, { calls: number; success: number }>(),
    errors = new Map<string, number>();
  for (const op of operations) {
    const count = counts.get(op.tool) ?? { calls: 0, success: 0 };
    count.calls++;
    count.success += Number(op.success);
    counts.set(op.tool, count);
    if (op.error) errors.set(op.error, (errors.get(op.error) ?? 0) + 1);
  }
  const site = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/i.test(hostname) ? hostname.split(".")[0] : unknown;
  const report = [
    "SaySo 调试报告",
    `生成时间：${debugSGT(now)}（UTC+8）`,
    `范围：最近 ${minutes} 分钟，最多 ${limit} 条`,
    "",
    "【环境】",
    `Runtime：${runtimeVersion}｜Site：${site}｜App：未知｜固件：未知`,
    location ? `数据库位置：${location.served_by_region??"地区未知"} / ${location.served_by_colo??"机房未知"}（${location.served_by_primary===true?"主库":location.served_by_primary===false?"副本":"主副库未知"}；记录于 ${debugSGT(location.recorded_at_ms)}）` : "数据库位置：还没有记录",
    `维护健康：${JSON.stringify(health)}`,
    ...(!health.owner_configured?["维护告警：MAINTENANCE_OWNER_NOT_CONFIGURED；安装未完成，需安装者绑定 owner 并验证维护执行。"]:[]),
    ...(health.warning?["维护告警：MAINTENANCE_BACKLOG_HIGH（已达阈值 70%）；到期分页将加速追赶。"]:[]),
    ...(health.overdue?["维护告警：MAINTENANCE_OVERDUE；检查请求触发与云调度。"]:[]),
    ...(inventory?[`维护计数时间：${debugSGT(inventory.measured_at)}`,table(["保留策略表","到期待处理","未到期或无需处理"],inventory.tables.map(r=>[r.table,r.due,r.not_due])),`存储保护计数：${JSON.stringify(inventory.storage)}`]:[]),
    `设备 ID：${identifier(selected)}｜会话 ID：${identifier(snapshot?.session_id)}｜广播 ID：${identifier(snapshot?.broadcast_id)}`,
    "",
    "【当前状态】",
    `屏幕共享：${current.sharing}（开始于 ${current.started}）`,
    `帮你点：${current.control}（允许方式${current.grant_mode}；短执行窗口剩余 ${number(current.remaining)} 秒；代数 ${number(current.epoch)}）`,
    `配件：${current.accessory}（USB/NCM；最后心跳 ${current.heartbeat}）`,
    `最新画面：帧 #${number(current.frame)}，年龄 ${number(current.age)} 秒，${current.orientation}，静止=${current.repeated}`,
    "",
    "【最近操作】（新的在上）",
    table(
      [
        "时间（SGT）",
        "请求 ID",
        "工具",
        "结果",
        "错误码",
        "卡在哪一步",
        "耗时 ms",
        "命令号",
        "后图帧",
        "第几次尝试",
      ],
      operations
        .slice(-limit)
        .reverse()
        .map((v) => [
          v.time,
          v.request,
          v.tool,
          v.result,
          v.error,
          v.step,
          v.elapsed,
          v.command,
          v.frame,
          v.attempt ?? unknown,
        ]),
    ),
    "",
    "【每次调用分段】（阶段可并行，不相加）",
    table(["请求 ID","命令","父命令","子命令","最终帧 UUID","广播时钟域","查图次数","放行重试"],associationRows.slice(-limit)),
    table(["请求 ID","阶段","时长 ms","误差 ms","来源","缺失原因"],performanceRows.slice(-limit*16)),
    "App 本机阶段未上传；不能用迟写日志时间替代发生时间。跨 Worker/D1 墙钟误差未知。",
    "【完整调用记录】",
    table(["method","tool","request_id","runtime_version","received_utc_ms","released_utc_ms","boundary_elapsed_ms","outcome","error_code","result_code","result_state","image_count","image_bytes","text_utf8_bytes","structured_utf8_bytes","response_bytes",...callImageFields,...actionJournalFields,"mcp_session_hash","parameters"],callRows.slice(-limit)),
    ...(callRows.length?[]:["未保留调用记录；不能推断操作次数为零。"]),
    "每个 MCP 请求在响应放行后由 waitUntil 独立写入；写入失败只丢该行。字段和参数按原样输出，不翻译。保留 24 小时，每范围 200 条、全局 2000 条。",
    "此间隔含网络、宿主、模型处理及用户暂停；不是纯模型思考时间。",
    "【相邻调用】",
    table(["当前请求","前一次请求","O_i ms","P_i ms","G_i ms","资格/缺失原因"],residualRows.slice(-limit)),
    "O_i 是前一次服务端边界内单调耗时；G_i 是服务端边界外残差。设备时间顺序不证明因果，人工暂停及宿主排队无法排除。",
    "",
    "【最近状态变化】",
    table(
      ["时间（SGT）", "事件", "说明"],
      events
        .sort((a, b) => b.at - a.at)
        .slice(0, limit)
        .map((v) => [debugSGT(v.at), v.event, v.detail]),
    ),
    "说明：仅列现存记录；未记录的开启、暂停、连接、断开或续租失败不推断时间。",
    "",
    "【汇总】",
    table(
      ["操作", "调用次数", "成功次数"],
      [...counts].sort().map(([tool, v]) => [tool, v.calls, v.success]),
    ),
    table(
      ["错误码", "出现次数"],
      [...errors].sort().map(([code, count]) => [code, count]),
    ),
    `汇总范围：窗口内现存 ${retained} 条操作（不受显示条数限制）；T36 最多保留 24 小时 / 200 条，旧的无归属记录不公开。`,
    "成功次数：输入操作以配件回执为准，看屏幕以可用画面或未变化结果为准；不代表 App 效果。",
    "尝试次数：同工具、同目标与同会话的相邻调用间隔不超过 60 秒累计；基于现存 24 小时 / 200 条记录，保留窗口前的连续重试。",
  ].join("\n");
  return { report };
}
