/** Faithful offline copy of sayso_app/Shared/Storage.swift:111 currentActionCapabilities.
 * The adjacent Swift snapshot is checked against the sibling App source when present.
 * Binding adds hid.keyboard.ascii:false and led_config:null exactly as
 * Shared/ExecutionCoordinator+Hardware.swift:450-460 bindCurrentCapabilities.
 */
export function appCapabilities(raw: Record<string, unknown>, transport = "ncm", simulation = false) {
  const hardware = ["led.set", "hid.mouse.relative", "hid.mouse.click", "hid.mouse.scroll", "hid.mouse.absolute",
    "hid.mouse.drag_absolute", "hid.mouse.drag_absolute.v2", "hid.keyboard.system_search",
    "hid.keyboard.ascii_stable", "hid.keyboard.ascii_clear_stable", "hid.keyboard.ascii_enter_stable"];
  const capabilities: Record<string, unknown> = Object.fromEntries(Object.entries(raw).filter(([key]) => hardware.includes(key)));
  const native = transport === "ncm" && !simulation;
  const point = native && capabilities["hid.mouse.absolute"] === true && capabilities["hid.mouse.click"] === true;
  capabilities["sayso.action_geometry.v1"] = point;
  const text = native && capabilities["hid.keyboard.ascii_stable"] === true;
  capabilities["sayso.focused_text"] = text;
  capabilities["sayso.focused_text.no_visual.v1"] = text;
  capabilities["sayso.focused_text_clear_before_input"] = text && capabilities["hid.keyboard.ascii_clear_stable"] === true;
  capabilities["sayso.focused_text_submit_enter"] = text && capabilities["hid.keyboard.ascii_enter_stable"] === true;
  const drag = point && capabilities["hid.mouse.drag_absolute"] === true && capabilities["hid.mouse.drag_absolute.v2"] === true;
  for (const key of ["sayso.drag_at", "sayso.drag_model_decision.v1", "sayso.drag_cloud_acceptance.v1"]) capabilities[key] = drag;
  const search = native && capabilities["hid.keyboard.system_search"] === true;
  capabilities["sayso.system_search"] = search;
  capabilities["sayso.system_search.scope_only.v1"] = search;
  capabilities["sayso.system_search.raw_claim_5s.v1"] = search;
  return capabilities;
}
export function appBinding(info: Record<string, unknown>) {
  const capabilities = appCapabilities(info.capabilities as Record<string, unknown>);
  capabilities["hid.keyboard.ascii"] = capabilities["hid.keyboard.ascii"] === true;
  return {hardware_id: info.hardware_id, board_boot_id: info.board_boot_id,
    protocol_version: info.protocol_version, descriptor_version: info.descriptor_version,
    transport: "usb_ncm", capabilities, led_config: info.led_config ?? null,
    lease_epoch_floor: info.lease_epoch_floor ?? 0};
}
