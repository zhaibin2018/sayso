/** Four home rows, derived from the authenticated service snapshot. */
export type HomeStatus = {
  service: "connected";
  screen_sharing: "active" | "not_started" | "paused" | "interrupted";
  accessory: "connected" | "not_connected" | "not_needed";
  tapping_for_you: "allowed" | "not_allowed" | "stopped" | "paused" | "not_needed";
  summary_zh: string;
  summary_en: string;
};

export const stoppedMouseGrant = "00000000-0000-4000-8000-000000000000";

export function homeStatus(input: {
  online: boolean;
  accessoryBound: boolean;
  usbConnected: boolean;
  session: {
    mode: string;
    capture_state: string;
    control_enabled: boolean;
    mouse_enabled: number;
    mouse_grant_request: string | null;
  } | null;
}): HomeStatus {
  const session = input.session?.mode === "broadcast" ? input.session : null;
  // A lease says nothing about whether the foreground App is open.
  const sharing: HomeStatus["screen_sharing"] =
    !session || session.capture_state === "stopped"
      ? "not_started"
      : !input.online
        ? "interrupted"
        : session.capture_state === "paused"
          ? "paused"
          : session.capture_state === "active"
            ? "active"
            : "interrupted";
  const accessory: HomeStatus["accessory"] = input.usbConnected
    ? "connected"
    : input.accessoryBound
      ? "not_connected"
      : "not_needed";
  const tapping: HomeStatus["tapping_for_you"] =
    accessory === "not_needed"
      ? "not_needed"
      : session?.mouse_grant_request === stoppedMouseGrant
        ? "stopped"
        : sharing === "paused" || sharing === "interrupted"
          ? "paused"
          : sharing === "active" && session?.control_enabled
            ? "allowed"
            : session?.mouse_grant_request && accessory === "not_connected"
              ? "paused"
              : session?.mouse_grant_request && session.mouse_enabled === 0
                ? "stopped"
                : session?.mouse_grant_request
                  ? "paused"
                  : "not_allowed";
  const zhSharing = {
    active: "屏幕共享中",
    not_started: "屏幕共享未开始",
    paused: "屏幕共享已暂停",
    interrupted: "屏幕共享已中断",
  };
  const enSharing = {
    active: "Sharing",
    not_started: "Sharing not started",
    paused: "Sharing paused",
    interrupted: "Sharing interrupted",
  };
  const zhTapping = {
    allowed: "帮你点已允许",
    not_allowed: "帮你点未允许",
    stopped: "已停止帮你点",
    paused: "帮你点已暂停",
    not_needed: "可以看屏幕",
  };
  const enTapping = {
    allowed: "tapping allowed",
    not_allowed: "tapping off",
    stopped: "tapping stopped",
    paused: "tapping paused",
    not_needed: "view only",
  };
  const accessoryMissing = accessory === "not_connected" && tapping !== "stopped";
  const zhDetail = accessoryMissing ? "配件未连接" : zhTapping[tapping];
  const enDetail = accessoryMissing ? "accessory disconnected" : enTapping[tapping];
  return {
    service: "connected",
    screen_sharing: sharing,
    accessory,
    tapping_for_you: tapping,
    summary_zh: `${zhSharing[sharing]}${sharing === "active" ? "，" + zhDetail : ""}。`,
    summary_en: `${enSharing[sharing]}${sharing === "active" ? "; " + enDetail : ""}.`,
  };
}

export const sharingStatusInstruction =
  "For a screen request when sharing is uncertain, first call list_devices and answer from home_status; if sharing is not active, say: Please tap Start screen sharing in SaySo. 用户请求涉及屏幕且不确定是否共享时，先调用 list_devices，按 home_status 回答；未在共享时说：请在 SaySo 里点开始屏幕共享。";
