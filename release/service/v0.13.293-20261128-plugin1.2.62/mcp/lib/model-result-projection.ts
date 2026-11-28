import {quotaErrorText,quotaResultError} from "./quota-errors.ts";
const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const actions = new Set([
  "read_screen",
  "click_at",
  "move_mouse_to",
  "move_mouse",
  "click_mouse",
  "scroll_mouse",
  "drag_at",
  "type_text_in_field",
  "open_system_search",
  "open_app_search",
  "get_mouse_result",
]);
const pick = (v: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => Object.hasOwn(v, k)).map((k) => [k, v[k]]));
const safetyEffect = [
  "typed_count",
  "typed_count_exact",
  "all_released",
  "hid_reports_sent",
  "enter_sent",
  "clear_before_input",
  "input_submitted",
  "ascii_stable",
  "system_search_stable",
];
function receipt(value: unknown) {
  const v = object(value);
  return {
    ...pick(v, [
      "command_id",
      "state",
      "error",
      "subcommand_index",
      "spotlight",
      "cancellation_release",
    ]),
    ...(v.effect ? { effect: pick(object(v.effect), safetyEffect) } : {}),
  };
}
function project(value: Record<string, unknown>): Record<string, unknown> {
  const out = { ...value };
  for (const key of [
    "trace",
    "payload",
    "precondition",
    "pre_age_server_ms_lower",
    "pixel_source",
    "private_pixel_probe_ms",
    "d1_jpeg_chars",
  ])
    delete out[key];
  if (out.recovery) {
    const recovery = pick(object(out.recovery), ["budget_exhausted", "failure", "termination"]);
    if (Object.keys(recovery).length) out.recovery = recovery;
    else delete out.recovery;
  }
  for (const key of ["board_receipt", "cancellation_receipt"])
    if (out[key]) out[key] = receipt(out[key]);
  for (const key of ["after_screen", "move_result", "click_result"])
    if (out[key]) out[key] = project(object(out[key]));
  if (out.after_image_instruction)
    out.after_image_instruction =
      "Inspect after-image; continue from image_handoff. Missing/loading: observe original command ID; never replay input.";
  return out;
}
/** Modern protocol has structured results. Legacy text-only clients keep their full projection. */
export function modelResultProjection(
  tool: string,
  value: Record<string, unknown>,
  modern: boolean,
  text: string,
) {
  if (!modern || !actions.has(tool)) return { summary: value, text };
  const summary: Record<string, unknown> = { ...project(value), result_projection: "compact_v1" };
  const quota=quotaResultError(value);
  if(quota){summary.quota_error=quota;summary.message=quotaErrorText[quota];}
  return {
    summary,
    text: JSON.stringify(
      pick(summary, [
        "state",
        "code",
        "error",
        ...(quota ? ["message","quota_error"] : []),
        "reason",
        "step",
        "command_id",
        "image_ref",
        "input_not_submitted",
        "enter_sent",
        "result_projection",
      ]),
    ),
  };
}
