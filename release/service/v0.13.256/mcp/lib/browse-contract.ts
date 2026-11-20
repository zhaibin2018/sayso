import { finite, integer, need, record, text, uuid } from "./bridge-engine.ts";

export const BROWSE_PROTOCOL = "bounded_browse.v1";
/** Native capture geometry for calibration only. Do not rewrite image/OCR
 * coordinates: their encoded dimensions remain in the original metadata. */
export function calibrationGeometry(m:Record<string,unknown>) {
  const imageWidth=integer(m.width,2,8192),imageHeight=integer(m.height,2,8192);
  need((m.native_width_px==null)===(m.native_height_px==null),"CALIBRATION_GEOMETRY_CHANGED");
  const width=integer(m.native_width_px??imageWidth,2,8192),height=integer(m.native_height_px??imageHeight,2,8192);
  need(m.capture_clock_verified===true&&m.orientation==="portrait"&&width<height&&imageWidth<imageHeight&&m.transform_version==="1","CALIBRATION_GEOMETRY_CHANGED");
  need(m.content_rect&&typeof m.content_rect==="object"&&!Array.isArray(m.content_rect),"CALIBRATION_GEOMETRY_CHANGED");
  const rect=record(m.content_rect);
  need(rect.x===0&&rect.y===0&&rect.width===imageWidth&&rect.height===imageHeight&&Math.abs(imageWidth/width-imageHeight/height)<=1/Math.min(width,height),"CALIBRATION_GEOMETRY_CHANGED");
  return {width,height,orientation:"portrait",orientation_epoch:integer(m.orientation_epoch,0),image_width:imageWidth,image_height:imageHeight};
}
export type Region = { x: number; y: number; width: number; height: number };
export type Anchor = { text: string; region: Region };
export type Scene = { required: Anchor[]; forbidden: Anchor[] };
export type BrowseStep = { before: Scene; after: Scene; action: { kind: "click"; target: Anchor } | { kind: "scroll"; steps: number } };
export type QueuedStep = { plan_id: string; step_id: string; index: number; expires_at: number; spec: BrowseStep };
export function exact(value: Record<string, unknown>, allowed: string[]) {
  need(Object.keys(value).every(key => allowed.includes(key)), "UNKNOWN_BROWSE_FIELD", 422);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => JSON.stringify(key) + ":" + canonical(child)).join(",") + "}";
  return JSON.stringify(value);
}
function region(raw: unknown): Region {
  const r = record(raw); exact(r, ["x", "y", "width", "height"]);
  const value = { x: finite(r.x, 0, 1), y: finite(r.y, 0, 1), width: finite(r.width, Number.EPSILON, 1), height: finite(r.height, Number.EPSILON, 1) };
  need(value.x + value.width <= 1 && value.y + value.height <= 1, "INVALID_BROWSE_REGION", 422); return value;
}
function anchor(raw: unknown): Anchor {
  const a = record(raw); exact(a, ["text", "region"]); return { text: text(a.text, 256), region: region(a.region) };
}
function scene(raw: unknown): Scene {
  const s = record(raw); exact(s, ["required", "forbidden"]);
  need(Array.isArray(s.required) && s.required.length >= 1 && s.required.length <= 6, "INVALID_BROWSE_SCENE", 422);
  const forbidden = s.forbidden ?? []; need(Array.isArray(forbidden) && forbidden.length <= 6, "INVALID_BROWSE_SCENE", 422);
  return { required: s.required.map(anchor), forbidden: forbidden.map(anchor) };
}
export function browseSteps(raw: unknown): BrowseStep[] {
  need(Array.isArray(raw) && raw.length >= 1 && raw.length <= 5, "BROWSE_STEP_LIMIT", 422);
  return raw.map(value => {
    const s = record(value); exact(s, ["before", "after", "action"]);
    const before = scene(s.before), after = scene(s.after), action = record(s.action);
    need(canonical(before) !== canonical(after), "AMBIGUOUS_BROWSE_TRANSITION", 422);
    if (action.kind === "click") {
      exact(action, ["kind", "target"]); const target = anchor(action.target);
      need(!/付款|支付|提交订单|立即购买|确认购买|buy\s*now|place\s*order|pay\s*now/i.test(target.text), "BROWSE_NAVIGATION_ONLY", 422);
      return { before, after, action: { kind: "click" as const, target } };
    }
    exact(action, ["kind", "steps"]); need(action.kind === "scroll", "BROWSE_NAVIGATION_ONLY", 422);
    const steps = integer(action.steps, -8, 8); need(steps !== 0, "EMPTY_SCROLL", 422);
    return { before, after, action: { kind: "scroll" as const, steps } };
  });
}
export function key(value: unknown): string {
  const k = text(value, 80); need(/^[A-Za-z0-9_-]+$/.test(k), "INVALID_BROWSE_KEY", 422); return k;
}
export function matches(a: Anchor, document: Record<string, unknown>, minimumConfidence = 0.8): Record<string, unknown>[] {
  const width = integer(document.image_width, 2, 8192), height = integer(document.image_height, 2, 8192);
  return (document.blocks as unknown[]).map(record).filter(block => {
    const bounds = record(block.bounds), x = (Number(bounds.x) + Number(bounds.width) / 2) / width, y = (Number(bounds.y) + Number(bounds.height) / 2) / height;
    return block.text === a.text && Number(block.confidence) >= minimumConfidence && x >= a.region.x && x <= a.region.x + a.region.width && y >= a.region.y && y <= a.region.y + a.region.height;
  });
}
export function sceneMatches(s: Scene, document: Record<string, unknown>): boolean {
  return s.required.every(a => matches(a, document).length === 1 && matches(a,document,0).length===1) && s.forbidden.every(a => matches(a, document,0).length === 0);
}
export function sceneCouldMatch(s:Scene,document:Record<string,unknown>):boolean {
  return s.required.every(a=>matches(a,document,0).length>=1) && s.forbidden.every(a=>matches(a,document,0).length===0);
}
export function targetPoint(step: BrowseStep, document: Record<string, unknown>) {
  need(sceneMatches(step.before, document) && !sceneCouldMatch(step.after, document), "BROWSE_SCENE_MISMATCH");
  if (step.action.kind === "scroll") return null;
  const targets = matches(step.action.target, document); need(targets.length === 1 && matches(step.action.target,document,0).length===1, "AMBIGUOUS_BROWSE_TARGET");
  const b = record(targets[0].bounds); return { x: Number(b.x) + Number(b.width) / 2, y: Number(b.y) + Number(b.height) / 2 };
}

export type CalibrationCommand = { id: string; owner_id: string; device_id: string; session_id: string; hardware_id: string; board_boot_id: string; control_epoch: number; kind: string; state: string; payload: string; precondition: string | null; receipt: string | null };
export function calibrationRequest(raw: unknown) {
  const p = record(raw); exact(p, ["source", "method", "human_input", "window_width", "window_height", "source_width", "source_height", "canvas", "orientation_epoch", "pointer_settings_hash", "probe_started_at", "samples"]);
  need(p.source === "actual_iphone_uikit_events" && p.method === "uikit_click_9x4" && p.human_input === false, "PHYSICAL_POINTER_PROOF_REQUIRED", 422);
  const width = integer(p.window_width, 2, 8192), height = integer(p.window_height, 2, 8192), sourceWidth = integer(p.source_width, 2, 8192), sourceHeight = integer(p.source_height, 2, 8192);
  const c = record(p.canvas); exact(c, ["x", "y", "width", "height"]);
  const canvas = { x: finite(c.x, 0, width), y: finite(c.y, 0, height), width: finite(c.width, 1, width), height: finite(c.height, 1, height) };
  need(canvas.x + canvas.width <= width && canvas.y + canvas.height <= height, "INVALID_CALIBRATION_CANVAS", 422);
  need(canvas.width >= width*.8 && canvas.height >= height*.8,"CALIBRATION_COVERAGE_TOO_SMALL",422);
  const settings = text(p.pointer_settings_hash, 64); need(/^[a-f0-9]{64}$/.test(settings), "INVALID_POINTER_SETTINGS_HASH", 422);
  const epoch = integer(p.orientation_epoch, 0), started = text(p.probe_started_at, 64); need(Number.isFinite(Date.parse(started)), "INVALID_PROBE_TIME", 422);
  need(Array.isArray(p.samples) && p.samples.length === 36, "POINTER_36_SAMPLES_REQUIRED", 422);
  const samples = p.samples.map(value => {
    const s = record(value); exact(s, ["point", "repetition", "move_id", "click_id", "x", "y", "click_before", "click_after", "before_mono_ms", "observed_mono_ms"]);
    return { point: integer(s.point, 0, 8), repetition: integer(s.repetition, 1, 4), move_id: uuid(s.move_id), click_id: uuid(s.click_id), x: finite(s.x, 0, width - 1), y: finite(s.y, 0, height - 1), click_before: integer(s.click_before), click_after: integer(s.click_after), before_mono_ms: finite(s.before_mono_ms, 0, Number.MAX_SAFE_INTEGER), observed_mono_ms: finite(s.observed_mono_ms, 0, Number.MAX_SAFE_INTEGER) };
  });
  return { width, height, sourceWidth, sourceHeight, canvas, epoch, settings, started, samples };
}
export function verifyCalibration(p: ReturnType<typeof calibrationRequest>, rows: CalibrationCommand[], scope: { owner: string; device: string; session: string; hardware: string; boot: string; control: number }) {
  const commands = new Map(rows.map(row => [row.id, row])), ids = new Set<string>(), positions = new Set<string>(), errors: number[] = [];
  let previousCount: number | null = null, previousMono = -1;
  for (const s of p.samples) {
    const identity = s.point + ":" + s.repetition;
    need(!positions.has(identity) && s.move_id !== s.click_id && !ids.has(s.move_id) && !ids.has(s.click_id), "REUSED_CALIBRATION_SAMPLE", 422);
    positions.add(identity); ids.add(s.move_id); ids.add(s.click_id);
    need(s.click_after === s.click_before + 1 && (previousCount == null || s.click_before === previousCount) && s.observed_mono_ms > s.before_mono_ms && s.before_mono_ms >= previousMono, "INVALID_UIKIT_SAMPLE_SEQUENCE", 422);
    previousCount = s.click_after; previousMono = s.observed_mono_ms;
    const move = commands.get(s.move_id), click = commands.get(s.click_id);
    for (const command of [move, click]) need(command && command.owner_id === scope.owner && command.device_id === scope.device && command.session_id === scope.session && command.hardware_id === scope.hardware && command.board_boot_id === scope.boot && command.control_epoch === scope.control && command.state === "board_acked", "UNCONFIRMED_CALIBRATION_INPUT");
    need(move!.kind === "pointer.move_absolute" && click!.kind === "pointer.click" && move!.precondition && move!.receipt && click!.receipt, "UNCONFIRMED_CALIBRATION_INPUT");
    const pre = record(JSON.parse(move!.precondition!)), m = record(JSON.parse(move!.receipt!)), c = record(JSON.parse(click!.receipt!)), payload = record(JSON.parse(move!.payload)), effect = record(m.effect);
    need(m.state === "executed" && c.state === "executed" && m.command_id === move!.id && c.command_id === click!.id && effect.hid_reports_sent === true && record(c.effect).hid_reports_sent === true && m.board_boot_id === scope.boot && c.board_boot_id === scope.boot, "UNCONFIRMED_CALIBRATION_INPUT");
    need(finite(m.finished_uptime_ms, 0, Number.MAX_SAFE_INTEGER) <= finite(c.started_uptime_ms, 0, Number.MAX_SAFE_INTEGER), "CALIBRATION_INPUT_ORDER");
    const x = p.canvas.x + p.canvas.width * (s.point % 3 + 1) / 4, y = p.canvas.y + p.canvas.height * (Math.floor(s.point / 3) + 1) / 4;
    const imageWidth=integer(pre.source_width,2,8192),imageHeight=integer(pre.source_height,2,8192);
    const captureWidth=integer(pre.capture_width??imageWidth,2,8192),captureHeight=integer(pre.capture_height??imageHeight,2,8192);
    need(pre.coordinate_space === "full_screen_image_pixels" && pre.orientation === "portrait" && pre.orientation_epoch === p.epoch && captureWidth === p.sourceWidth && captureHeight === p.sourceHeight&&imageWidth<imageHeight&&Math.abs(imageWidth/captureWidth-imageHeight/captureHeight)<=1/Math.min(captureWidth,captureHeight), "CALIBRATION_GEOMETRY_CHANGED");
    need(Math.abs(Number(pre.source_x) - x / (p.width - 1) * (imageWidth - 1)) < .00001 && Math.abs(Number(pre.source_y) - y / (p.height - 1) * (imageHeight - 1)) < .00001, "CALIBRATION_GRID_MISMATCH");
    const hx = Math.round(x / (p.width - 1) * 32767), hy = Math.round(y / (p.height - 1) * 32767);
    need(payload.x === hx && payload.y === hy && effect.absolute_requested_x === hx && effect.absolute_requested_y === hy, "CALIBRATION_AXES_MISMATCH");
    errors.push(Math.hypot(s.x - x, s.y - y));
  }
  errors.sort((a,b) => a-b); const p95 = errors[Math.ceil(errors.length * .95) - 1], hitRate = errors.filter(x => x <= 12).length / errors.length;
  need(positions.size === 36 && p95 <= 12 && hitRate >= .95, "POINTER_CALIBRATION_FAILED");
  return { samples: 36, points: 9, p95_error_px: p95, hit_rate: hitRate, verification: "device_authenticated_uikit_and_recorded_hid_evidence" };
}
