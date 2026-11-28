import type { BridgeEngine, Device, Session } from "./bridge-engine.ts";
import { deviceNextStep } from "./device-next-step.ts";
import { homeStatus } from "./home-status.ts";
export type StatusFrame = {
  metadata: string;
  capture_lower: number | null;
  received_at: number;
  expires_at: number;
};
export type StatusSession = Pick<
  Session,
  | "id"
  | "broadcast_id"
  | "mode"
  | "capture_state"
  | "control_epoch"
  | "mouse_enabled"
  | "input_end"
  | "diagnostic_enabled"
  | "mouse_grant_request"
> & {control_protocol?:string;grant_source?:string;ui_blocked?:number;idle_seconds?:number;last_activity?:number;worker_id?:string;lease_epoch?:number;intent_seq?:number;automatic?:number;stopped?:number};
export type StatusHardware = {
  hardware_id: string;
  board_boot_id: string;
  metadata: string;
  usb_connected: number;
};
export type StatusDiagnostic = {
  id: string;
  state: string;
  stop_reason: string | null;
  stopped_at: number | null;
};

export function deviceStatus(
  engine: BridgeEngine,
  current: Pick<Device, "id" | "name" | "worker_expires" | "last_seen">,
  session: StatusSession | null,
  frame: StatusFrame | null,
  hardware: StatusHardware | null,
  diagnostic: StatusDiagnostic | null,
) {
  const now = engine.now(),
    capabilities = hardware ? (JSON.parse(hardware.metadata).capabilities ?? {}) : {};
  const shareAllowed=session?.mode==="broadcast" && session.capture_state==="active" && session.mouse_enabled===1
    && current.worker_expires>now && hardware?.usb_connected===1
    && (!session.idle_seconds || (session.last_activity??0)+session.idle_seconds*1000>now)
    && (session.input_end>now || (session.control_protocol==="share.v1" && session.ui_blocked===1));
  const mouse = shareAllowed && session.input_end>now;
  const control =
    mouse ||
    (session?.mode === "foreground_diagnostic" &&
      session.diagnostic_enabled === 1 &&
      current.worker_expires > now &&
      hardware?.usb_connected === 1);
  const home_status = homeStatus({
    online: current.worker_expires > now,
    accessoryBound: hardware !== null,
    usbConnected: hardware?.usb_connected === 1 && current.worker_expires > now,
    session: session ? { ...session, control_enabled: Boolean(shareAllowed),mouse_grant_request:session.stopped===1?"00000000-0000-4000-8000-000000000000":session.mouse_grant_request } : null,
  });
  return {
    control_protocol:session?.control_protocol??"share.v1",
    home_status,
    device_id: current.id,
    name: current.name,
    hardware_id: hardware?.hardware_id ?? null,
    board_boot_id: hardware?.board_boot_id ?? null,
    capabilities: Object.fromEntries(
      ["led.set", "hid.mouse.relative", "hid.mouse.click", "hid.mouse.scroll", "hid.mouse.absolute"]
        .filter((name) => Object.hasOwn(capabilities, name))
        .map((name) => [name, capabilities[name] === true]),
    ),
    usb_connected: hardware?.usb_connected === 1 && current.worker_expires > now,
    next_step: deviceNextStep(
      current.worker_expires > now,
      session
        ? {
            mode: session.mode,
            capture_state: session.capture_state,
            control_enabled: Boolean(control),
          }
        : null,
    ),
    online: current.worker_expires > now,
    last_heartbeat_at: current.last_seen ? new Date(current.last_seen).toISOString() : null,
    session: session
      ? {
          bridge_session_id: session.id,
          broadcast_id: session.mode === "broadcast" ? session.broadcast_id : null,
          worker_id:session.worker_id,lease_epoch:session.lease_epoch,intent_seq:session.intent_seq,automatic_control:session.automatic===1,user_stopped:session.stopped===1,
          mode: session.mode,
          capture_state: session.capture_state,
          control_epoch: session.control_epoch,
          control_enabled: Boolean(control),
          share_allowed:session.control_protocol==="share.v1" && Boolean(shareAllowed),grant_source:shareAllowed?session.grant_source:null,
        }
      : null,
    latest_frame: frame && frame.expires_at > now ? engine.frameMetadata(frame) : null,
    active_tasks: [],
    screen_only: !mouse && session?.mode !== "foreground_diagnostic",
    control_scope: mouse
      ? ["hid.mouse.relative", "hid.mouse.click", "hid.mouse.scroll", "hid.mouse.absolute"].filter(
          (name) => capabilities[name] === true,
        )
      : control
        ? ["led.set"]
        : [],
    last_diagnostic: diagnostic
      ? {
          session_id: diagnostic.id,
          state: diagnostic.state,
          stop_reason: diagnostic.stop_reason,
          stopped_at: diagnostic.stopped_at ? new Date(diagnostic.stopped_at).toISOString() : null,
        }
      : null,
  };
}
