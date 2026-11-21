type Fields = Record<string, unknown>;
const object = (value: unknown): Fields =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Fields) : {};
const pick = (value: Fields, keys: string[]) =>
  Object.fromEntries(
    keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]),
  );
const actionTools = new Set([
  "read_screen",
  "click_at",
  "move_mouse_to",
  "move_mouse",
  "click_mouse",
  "scroll_mouse",
  "drag_at",
  "type_text_in_field",
  "open_system_search",
  "get_mouse_result",
  "cancel_current_operation",
  "stop_mouse",
  "stop_session",
]);

/** Text-only projection. Never edits the domain result, images or structuredContent. */
export function conciseToolText(
  tool: string,
  value: Fields,
  fallback: string,
  compact = fallback,
): string {
  if (!actionTools.has(tool) && (value.error || value.invalid_arguments))
    return JSON.stringify({ ...JSON.parse(compact), ...pick(value, ["reason", "input_length"]) });
  if (["cancel_current_operation","stop_mouse","stop_session"].includes(tool)) return JSON.stringify(value);
  if (tool === "get_control_guide") return JSON.stringify(value);
  if (["create_pairing_code", "revoke_device", "get_profile"].includes(tool))
    return JSON.stringify(value);
  if (tool === "list_devices")
    return JSON.stringify({
      devices: ((value.devices as Fields[]) ?? []).map((device) =>
        pick(device, ["device_id", "name", "online", "home_status", "next_step"]),
      ),
      ...pick(value, ["error", "reason", "mcp_request_id"]),
    });
  if (tool === "get_mouse_state")
    return JSON.stringify(
      pick(value, [
        "device_id",
        "device_name",
        "bridge_session_id",
        "enabled",
        "online",
        "usb_connected",
        "grant_remaining_ms",
        "control_epoch",
        "control_scope",
        "screen_geometry",
        "capabilities",
        "point_protocol",
        "absolute_supported",
        "action_geometry_ready",
        "system_search_ready",
        "system_search_scope_only_ready",
        "focused_text_ready",
        "focused_text_no_visual_ready",
        "focused_text_submit_enter_ready",
        "focused_text_clear_before_input_ready",
        "max_text_len",
        "max_clear_text_len",
        "drag_at_ready",
        "privacy_storage_ready",
        "signing_available",
        "error",
        "reason",
        "mcp_request_id",
      ]),
    );
  if (!actionTools.has(tool)) return fallback;
  const summary: Fields = JSON.parse(compact);
  const counted=object(object(value.cancellation_receipt).effect??object(value.board_receipt).effect),textInput=object(value.text_input);
  if(typeof counted.typed_count==="number")Object.assign(summary,{
    typed_count:counted.typed_count,typed_count_exact:counted.typed_count_exact,
    recovery_eligible:textInput.recovery_eligible===true,
  });
  Object.assign(
    summary,
    pick(value, [
      "reason",
      "device_id",
      "kind",
      "input_length",
      "app_effect_observed",
      "input_attempted",
      "scope_matched",
      "failed_devices",
      "stopped_devices",
      "stop_reason",
    ]),
  );
  if (summary.selector_notice)
    summary.selector_notice = `${value.selector_fallback_reason === "invalid_id" ? "Invalid ID" : value.selector_fallback_reason === "stale_session" ? "Session already stopped" : "No matching target"}; see scope and stop result.`;
  if (summary.after_image_instruction)
    summary.after_image_instruction =
      "Inspect this after-image; continue from image_handoff. Missing/loading: query the original ID once; never replay input.";
  if (summary.click_at_instruction)
    summary.click_at_instruction =
      value.input_not_submitted === true
        ? "Input not submitted; query the original move_command_id and click_command_id separately with get_mouse_result."
        : "Use exact source geometry and original-image pixels. T6: move_mouse_to, inspect after-image, then user taps. Unknown input: original ID only.";
  const after = object(value.after_screen);
  const screen = after.state ? after : value;
  const metadata = object(screen.metadata);
  const staticScreen = object(metadata.static_screen);
  if (screen.state === "repeated" && staticScreen.proven === true) {
    const observation = {
      ...pick(screen, ["state", "warning", "after_command"]),
      metadata: pick(metadata, [
        "device_id",
        "frame_id",
        "width",
        "height",
        "orientation_epoch",
        "age_ms",
        "stale",
        "is_repeated",
        "usable_for_input",
        "static_screen",
      ]),
      note:
        screen.warning === "ACTION_NO_SCREEN_CHANGE"
          ? "动作后画面没有变化，可能未生效。 No screen change; action may have had no effect."
          : "画面没有变化；变更后重新读屏。 Static screen; re-read on SCREEN_CHANGED_SINCE_IMAGE.",
    };
    if (after.state) {
      summary.after_screen = observation;
      summary.after_image_instruction = observation.note;
    } else Object.assign(summary, observation);
    if (metadata.usable_for_input === true && !screen.warning && value.image_handoff) {
      const source = object(value.image_handoff);
      summary.click_at_source = {
        ...pick(source, [
          "device_id",
          "source_frame_id",
          "image_width",
          "image_height",
          "orientation_epoch",
        ]),
        ...pick(value, ["source_point_proof"]),
      };
    }
  }
  // Pending/no-image results still explain what happened, without copying receipts or payloads.
  if (after.state && !after.release_failure && !summary.after_screen)
    summary.after_screen = pick(after, ["state", "reason", "error"]);
  return JSON.stringify(summary);
}
