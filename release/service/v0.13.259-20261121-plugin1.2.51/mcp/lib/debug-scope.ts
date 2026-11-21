import type { McpPerformance } from "./mcp-performance.ts";

export const debugObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const debugUUID = (value: unknown) =>
  typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
export const debugNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
type Scope = {
  owner: string;
  device: string | null;
  session: string | null;
  command: string | null;
  target: string;
};
const scopes = new WeakMap<McpPerformance, Scope>();

/** Request-local only. No text, proofs, idempotency keys or caller labels. */
export function setDebugScope(trace: McpPerformance, owner: string, args: Record<string, unknown>) {
  const target: Record<string, unknown> = {};
  for (const key of [
    "x",
    "y",
    "from_x",
    "from_y",
    "to_x",
    "to_y",
    "dx",
    "dy",
    "steps",
    "image_width",
    "image_height",
  ])
    if (typeof args[key] === "number" && Number.isFinite(args[key])) target[key] = args[key];
  const command = debugUUID(args.command_id),
    session = debugUUID(args.bridge_session_id);
  if (command) target.command = command;
  if (session) target.session = session;
  scopes.set(trace, {
    owner,
    device: debugUUID(args.device_id),
    session,
    command,
    target: JSON.stringify(target),
  });
}
export const getDebugScope = (trace: McpPerformance) => scopes.get(trace);
export async function debugHash(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}

export type DebugSnapshot = {
  device_id: string;
  session_id: string | null;
  broadcast_id: string | null;
  session_state: string | null;
  capture_state: string | null;
  started_at: number | null;
  stopped_at: number | null;
  mouse_enabled: number | null;
  mouse_until: number | null;
  control_epoch: number | null;
  control_stopped: number;
  online: number;
  usb_connected: number | null;
  last_seen: number;
  frame_seq: number | null;
  capture_lower: number | null;
  frame_expires: number | null;
  orientation: string | null;
  repeated: number;
  grant_mode: string | null;
};

/** Explicit columns only; no hardware metadata, frame JSON, images or credentials. */
function snapshotStatement(
  db: D1Database,
  owner: string,
  device: string | null,
  now = Date.now(),
) {
  return db
      .prepare(
        `SELECT d.id AS device_id,s.id AS session_id,s.broadcast_id,s.state AS session_state,s.capture_state,
    s.created_at AS started_at,s.stopped_at,s.mouse_enabled,s.mouse_until,s.control_epoch,
    CASE WHEN s.mouse_grant_request='00000000-0000-4000-8000-000000000000' THEN 1 ELSE 0 END AS control_stopped,
    CASE WHEN d.worker_expires>? THEN 1 ELSE 0 END AS online,h.usb_connected,d.last_seen,
    CASE WHEN f.session_id=s.id THEN f.frame_seq END AS frame_seq,
    CASE WHEN f.session_id=s.id THEN f.capture_lower END AS capture_lower,
    CASE WHEN f.session_id=s.id THEN f.expires_at END AS frame_expires,
    CASE WHEN f.session_id=s.id THEN json_extract(f.metadata,'$.orientation') END AS orientation,
    CASE WHEN f.session_id=s.id AND f.repeat_sequence>0 THEN 1 ELSE 0 END AS repeated,NULL AS grant_mode
    FROM sb_devices d LEFT JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id
    LEFT JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
    LEFT JOIN sb_frames f ON f.device_id=d.id AND f.owner_id=d.owner_id
    WHERE d.owner_id=? AND d.revoked=0 AND (? IS NULL OR d.id=?) ORDER BY d.created_at DESC LIMIT 21`,
      )
      .bind(now, owner, device, device);
}

export async function debugSnapshots(db:D1Database,owner:string,device:string|null,now=Date.now()) {
  return (await snapshotStatement(db,owner,device,now).all<DebugSnapshot>()).results;
}

/** Global location has no owner/device data; the device snapshot keeps its original scope. */
export async function debugEnvironment(db:D1Database,owner:string,device:string|null,now:number) {
  const [devices,location]=await db.batch<Record<string,unknown>>([
    snapshotStatement(db,owner,device,now),
    db.prepare("SELECT d1_placement_json FROM sb_maintenance_state WHERE id=1"),
  ]);
  return {snapshots:devices.results as DebugSnapshot[],placement:location.results[0]?.d1_placement_json};
}

/** Enrich the existing 24h/200-row journal only. Legacy unscoped rows stay private. */
export async function journalDebugData(
  db: D1Database,
  trace: McpPerformance,
  summary: Record<string, unknown>,
  now: number,
) {
  const scope = scopes.get(trace);
  if (!scope) return {};
  const allOwned = summary.scope === "all_owned_devices" || summary.scope === "all_owned_sessions";
  let device = allOwned ? null : (debugUUID(summary.device_id) ?? scope.device);
  const command = debugUUID(summary.command_id) ?? scope.command;
  if (!device && command && !allOwned)
    device =
      (
        await db
          .prepare("SELECT device_id FROM sb_mouse_commands WHERE id=? AND owner_id=?")
          .bind(command, scope.owner)
          .first<{ device_id: string }>()
      )?.device_id ?? null;
  if (!device && scope.session && !allOwned)
    device =
      (
        await db
          .prepare("SELECT device_id FROM sb_sessions WHERE id=? AND owner_id=?")
          .bind(scope.session, scope.owner)
          .first<{ device_id: string }>()
      )?.device_id ?? null;
  const snapshots = await debugSnapshots(db, scope.owner, device, now);
  if (!snapshots.length) return {};
  if (!allOwned && !device && snapshots.length !== 1) return {};
  return {
    scope_owner_hash: await debugHash(scope.owner),
    scope_device_ids: snapshots.map((v) => v.device_id),
    target_key: await debugHash(scope.target),
    device_states: snapshots.map((v) => ({
      device_id: v.device_id,
      session_id: debugUUID(v.session_id),
      broadcast_id: debugUUID(v.broadcast_id),
      capture_state: ["active", "paused", "stopped"].includes(String(v.capture_state))
        ? v.capture_state
        : null,
      mouse_enabled: v.mouse_enabled === 1,
      mouse_until: debugNumber(v.mouse_until),
      control_epoch: debugNumber(v.control_epoch),
      control_stopped: v.control_stopped === 1,
      online: v.online === 1,
      usb_connected: v.usb_connected === 1,
    })),
  };
}
