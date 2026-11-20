/** Hints describe effects, not an approval bypass. ChatGPT permission decisions remain external.
 * Official guidance: false destructiveHint is for tools that do not delete/overwrite user data.
 * stop_session clears cloud images, so it remains destructive; both Stops are repeat-safe.
 * Pointer positioning/navigation do not intentionally replace user content. Click, drag and text can do so.
 * T6 is not enforcement; keep click/drag conservative during the owner's default-low-risk trial.
 */
const reads = new Set([
  "read_screen",
  "list_devices",
  "get_mouse_state",
  "get_mouse_result",
  "get_control_guide",
]);
const inputs = new Set([
  "open_system_search",
  "move_mouse_to",
  "scroll_mouse",
  "type_text_in_field",
  "click_at",
  "drag_at",
]);
export function publicToolRisk(name: string) {
  if (reads.has(name))
    return {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    };
  if (inputs.has(name))
    return {
      readOnlyHint: false,
      destructiveHint: ["click_at", "drag_at", "type_text_in_field"].includes(name),
      idempotentHint: true,
      openWorldHint: true,
    };
  if (name === "stop_mouse" || name === "stop_session")
    return {
      readOnlyHint: false,
      destructiveHint: name === "stop_session",
      idempotentHint: true,
      openWorldHint: false,
    };
  if (name === "revoke_device" || name === "create_pairing_code")
    return {
      readOnlyHint: false,
      destructiveHint: name === "revoke_device",
      idempotentHint: false,
      openWorldHint: false,
    };
  return undefined;
}
