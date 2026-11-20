/** Capability declarations describe the current protocol; they never grant control. */
export const currentCapabilityContract = {
  hardware: [
    "led.set",
    "hid.mouse.relative",
    "hid.mouse.click",
    "hid.mouse.scroll",
    "hid.mouse.absolute",
    "hid.mouse.drag_absolute",
    "hid.mouse.drag_absolute.v2",
    "hid.keyboard.system_search",
    "hid.keyboard.ascii_stable",
    "hid.keyboard.ascii_clear_stable",
    "hid.keyboard.ascii_enter_stable",
  ],
  app: [
    "sayso.action_geometry.v1",
    "sayso.drag_at",
    "sayso.drag_model_decision.v1",
    "sayso.drag_cloud_acceptance.v1",
    "sayso.system_search",
    "sayso.system_search.scope_only.v1",
    "sayso.system_search.raw_claim_5s.v1",
    "sayso.focused_text",
    "sayso.focused_text.no_visual.v1",
    "sayso.focused_text_clear_before_input",
    "sayso.focused_text_submit_enter",
  ],
};
export function currentActionCapabilities(
  raw: Record<string, unknown>,
  transport: unknown,
): Record<string, boolean> {
  const result: Record<string, boolean> = {
    "led.set": raw["led.set"] === true,
  };
  for (const name of [
    "hid.mouse.relative",
    "hid.mouse.click",
    "hid.mouse.scroll",
    "hid.mouse.absolute",
  ])
    if (typeof raw[name] === "boolean") result[name] = raw[name];
  if (transport !== "usb_ncm") return result;
  const retain = (keys: string[]) => {
    if (keys.every((key) => raw[key] === true)) for (const key of keys) result[key] = true;
  };
  if (result["hid.mouse.absolute"] && result["hid.mouse.click"]) {
    retain(["sayso.action_geometry.v1"]);
    if (result["sayso.action_geometry.v1"]) {
      retain(["hid.mouse.drag_absolute", "hid.mouse.drag_absolute.v2", "sayso.drag_at"]);
      if (result["sayso.drag_at"])
        retain(["sayso.drag_model_decision.v1", "sayso.drag_cloud_acceptance.v1"]);
    }
  }
  retain([
    "hid.keyboard.system_search",
    "sayso.system_search",
    "sayso.system_search.scope_only.v1",
  ]);
  if (result["sayso.system_search.scope_only.v1"]) retain(["sayso.system_search.raw_claim_5s.v1"]);
  retain(["hid.keyboard.ascii_stable", "sayso.focused_text", "sayso.focused_text.no_visual.v1"]);
  if (result["sayso.focused_text"]) {
    retain(["hid.keyboard.ascii_clear_stable", "sayso.focused_text_clear_before_input"]);
    retain(["hid.keyboard.ascii_enter_stable", "sayso.focused_text_submit_enter"]);
  }
  return result;
}
