import { modelResultProjection } from "./model-result-projection.ts";

type Fields = Record<string, unknown>;
const object = (v: unknown): Fields =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Fields : {};
export const imageOnlyActionTools = new Set([
  "click_at", "move_mouse_to", "scroll_mouse", "drag_at", "type_text_in_field",
  "open_system_search", "open_app_search", "get_mouse_result",
]);
const pick = (v: Fields, keys: string[]) =>
  Object.fromEntries(keys.filter(k => Object.hasOwn(v, k)).map(k => [k, v[k]]));
const decisionKeys = [
  "state", "code", "reason", "command_id", "kind", "device_name", "verification",
  "app_effect_observed", "input_not_submitted", "input_attempted", "input_submitted",
  "enter_sent", "typed_count", "typed_count_exact", "recovery_eligible",
  "board_receipt", "text_input", "spotlight", "paired_click_command_id",
  "predecessor_command_id", "operation_id", "search_command_id", "type_command_id",
  "step_command_id", "step", "parent_state_persisted", "observation_state",
  "image_observation", "image_usable_for_input",
];

/** Only a confirmed, actionable after-image takes the short path. Uncertain,
 * stopped, warning, static-repeat and missing-image results keep their full
 * recovery contract. The caller still runs the final serialized release guard. */
export function imageOnlyActionResult(tool: string, value: Fields, images: Fields[], isError: boolean) {
  if (!imageOnlyActionTools.has(tool) || isError || images.length !== 1 ||
      images[0].type !== "image" || typeof images[0].data !== "string" || !images[0].data ||
      value.state !== "board_acked" || !value.image_handoff ||
      typeof value.command_id !== "string" ||
      value.code != null && value.code !== "NEEDS_TARGET_REVIEW") return;
  const after = object(value.after_screen), metadata = object(after.metadata);
  const exceptional = (v: Fields) => v.error != null || v.warning != null ||
    v.recovery_eligible === true || v.input_not_submitted === true ||
    v.cancellation_receipt != null || v.step_error != null ||
    v.parent_state_persisted === false || v.image_usable_for_input === false;
  if (after.state !== "available" || exceptional(value) || exceptional(after) ||
      typeof metadata.age_ms !== "number" || !Number.isFinite(metadata.age_ms) || metadata.age_ms < 0)
    return;
  for (const key of ["move_result", "click_result"]) {
    const child = object(value[key]);
    if (Object.keys(child).length && (child.state !== "board_acked" || exceptional(child))) return;
  }
  const compact = modelResultProjection(tool, value, true, "").summary;
  const summary: Fields = {
    image_handoff: value.image_handoff,
    ...pick(compact, decisionKeys),
    // Preserve the exact original observation gap for get_mouse_result.
    after_screen: pick(after, ["state", "after_command", "app_effect_observed"]),
  };
  for (const key of ["move_result", "click_result"]) {
    if (compact[key]) summary[key] = pick(object(compact[key]), decisionKeys);
  }
  const name = typeof value.device_name === "string" ? value.device_name.trim() : "";
  const text = name ? `Screenshot below from ${name}, taken after the action. 下图是 ${name} 动作后的屏幕截图。` :
    "Screenshot below, taken after the action. 下图是动作后的屏幕截图。";
  return {
    content: [{type: "text", text}, images[0]],
    structuredContent: summary,
    isError: false,
  };
}
