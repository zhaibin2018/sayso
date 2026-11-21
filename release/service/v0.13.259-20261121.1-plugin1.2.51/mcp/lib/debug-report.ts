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
function stateText(s: DebugSnapshot | undefined, now: number) {
  const active = s?.session_state === "active",
    sharing = active && s?.capture_state === "active";
  const enabled =
    sharing &&
    s?.mouse_enabled === 1 &&
    (s?.mouse_until ?? 0) > now &&
    s?.online === 1 &&
    s?.usb_connected === 1;
  const control =
    s?.control_stopped === 1
      ? "已停止"
      : enabled
        ? "已允许"
        : s?.mouse_enabled === 1 && (s.mouse_until ?? 0) <= now
          ? "已到期"
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
    grant_mode: unknown,
    remaining: s ? Math.max(0, Math.floor(((s.mouse_until ?? 0) - now) / 1000)) : null,
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
) {
  const minutes = integer(args.minutes === undefined ? 15 : args.minutes, 1, 60),
    limit = integer(args.limit === undefined ? 20 : args.limit, 1, 50);
  const device = args.device_id === undefined ? null : debugUUID(args.device_id);
  if (args.device_id !== undefined && !device) throw new BridgeError("INVALID_ARGUMENTS", 422);
  const now = service.now(),
    since = now - minutes * 60_000;
  const {snapshots,placement} = await debugEnvironment(service.db, user.id, device, now);
  const location=parsePlacementJSON(placement);
  if (device && !snapshots.length) throw new BridgeError("NOT_FOUND", 404);
  if (snapshots.length > 1) throw new BridgeError("CHOOSE_DEVICE", 409);
  const snapshot = snapshots[0],
    selected = snapshot?.device_id ?? null,
    events: Event[] = [],
    operations: Operation[] = [],performanceRows:unknown[][]=[],residualRows:unknown[][]=[],associationRows:unknown[][]=[];
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
      LEFT JOIN sb_timing_journal t ON t.record_key='command:'||c.id AND t.received_utc_ms>=? AND t.received_utc_ms<=?
      WHERE json_valid(j.data_json) AND j.received_utc_ms>=? AND j.received_utc_ms<=?
      AND json_extract(j.data_json,'$.scope_owner_hash')=?
      AND EXISTS(SELECT 1 FROM json_each(j.data_json,'$.scope_device_ids') WHERE value=?)
      ORDER BY j.received_utc_ms,j.id LIMIT 200`,
        )
        .bind(user.id, selected, now-journalTTL, now, now - journalTTL, now, await debugHash(user.id), selected)
        .all<Stored>()
    ).results;
    const companions=rows.map(r=>debugObject(JSON.parse(r.data_json)));
    let priorCall:Record<string,unknown>|undefined;
    const attempts = new Map<string, { at: number; count: number }>();
    let previous: Record<string, unknown> | undefined;
    for (const row of rows) {
      const data = debugObject(JSON.parse(row.data_json));
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
        const command=row.command_timing_json?debugObject(JSON.parse(row.command_timing_json)):{};
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
          !failed &&
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
          debugNumber(state.mouse_until) !== null &&
          Number(state.mouse_until) <= row.received_utc_ms
        )
          step = "控制许可已过期";
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
      (snapshot.mouse_until ?? 0) >= since &&
      (snapshot.mouse_until ?? Infinity) <= now
    )
      events.push({
        at: snapshot.mouse_until!,
        event: "帮你点到期",
        detail: "当前会话许可截止时间",
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
    `设备 ID：${identifier(selected)}｜会话 ID：${identifier(snapshot?.session_id)}｜广播 ID：${identifier(snapshot?.broadcast_id)}`,
    "",
    "【当前状态】",
    `屏幕共享：${current.sharing}（开始于 ${current.started}）`,
    `帮你点：${current.control}（允许方式${current.grant_mode}；剩余 ${number(current.remaining)} 秒；代数 ${number(current.epoch)}）`,
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
    "成功次数：输入操作以配件回执为准，读屏以可用画面或未变化结果为准；不代表 App 效果。",
    "尝试次数：同工具、同目标与同会话的相邻调用间隔不超过 60 秒累计；基于现存 24 小时 / 200 条记录，保留窗口前的连续重试。",
  ].join("\n");
  return { report };
}
