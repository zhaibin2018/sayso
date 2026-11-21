import { BridgeError } from "./bridge-engine.ts";
const mcpInputs = new Set([
  "read_screen",
  "get_mouse_state",
  "open_system_search",
  "type_text_in_field",
  "click_at",
  "move_mouse_to",
  "move_mouse",
  "click_mouse",
  "scroll_mouse",
  "drag_at",
  "set_led",
]);
const deviceInputs = new Set([
  "frame",
  "observation",
  "clockProbe",
  "mouseClaim",
  "mouseStart",
  "ledClaim",
  "ledStart",
]);
export function requireMcpSigning(name: string, available: boolean) {
  if (!available && mcpInputs.has(name))
    throw new BridgeError("SIGNING_CONFIGURATION_INVALID", 503);
}
export function requireDeviceSigning(
  operation: string,
  available: boolean,
  body?: Record<string, unknown>,
) {
  if (
    !available &&
    (deviceInputs.has(operation) || (operation === "mouseGrant" && body?.control_enabled !== false))
  )
    throw new BridgeError("SIGNING_CONFIGURATION_INVALID", 503);
}
