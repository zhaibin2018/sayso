import { phoneWorkflowInstructions, interactionPolicyVersion } from "./interaction-guidance.ts";
export const controlWorkflows = [
  "overview",
  "open_app",
  "field_input",
  "pointer",
  "local_plan",
  "search_taobao",
  "scroll",
  "drag",
  "maps",
  "clipboard",
  "stop",
] as const;
export type ControlWorkflow = (typeof controlWorkflows)[number];
const open = [
  "Use the previous actual image; click the installed target directly if visible.",
  "Otherwise use open_system_search once without a source frame. Reuse its original full-size JPEG.",
  "type_text_in_field enters the requested app name without Return. From its actual after-image, click the installed result once.",
  "Reuse the launch after-image. Do not blindly submit the first suggestion or open a web/store result.",
];
const input = [
  "Identify the requested field from the preceding actual image. Click once if focus is needed.",
  "type_text_in_field uses current focus, clearing first by default: 1–60 printable ASCII characters. Intentional append uses clear_before_input=false, 1–64.",
  "For an in-app search use submit=enter; the user need not say Return. Omit submit for app discovery and fill-only drafts; never submit unrelated messages or payments.",
  "Inspect and reuse its same-call after-image. No caret, empty-field, source-age, pixel-equality or layout-probe check is required.",
];
const guides: Record<ControlWorkflow, Record<string, unknown>> = {
  overview: {
    purpose: "Live makes visual decisions BETWEEN calls; SaySo and C124 execute bounded actions.",
    sequence: [
      "Read once only if no usable action image exists.",
      "Perform one action, inspect its after-image and continue directly from it.",
    ],
    voice_start:
      "Use the user's current SaySo project conversation and language. Preserve Live continuity.",
  },
  open_app: { sequence: open },
  field_input: { sequence: input },
  pointer: {
    sequence: [
      "For ordinary targets only (T6 final actions are excluded), choose original-image pixel coordinates and call click_at once with its exact source proof when supplied.",
      "Use move_mouse_to to position the pointer before a wheel action. Use click_at for ordinary source-bound clicks; T6 uses move_mouse_to and a verified after-image before asking the user to tap, then reuse its actual after-image.",
    ],
    limits: "Move ACK does not prove a click or app effect.",
  },
  local_plan: {
    implementation_status: "No older visual-plan fallback in the current primitive workflow.",
    sequence: ["Compose current primitives through Live decisions and their after-images."],
  },
  search_taobao: {
    sequence: [...open, ...input],
    limits:
      "Generic installed-app example; no hardcoded coordinates. Pinyin needs user permission.",
  },
  maps: {
    sequence: [...open, ...input],
    limits: "Generic example; no app-specific recognition or field coordinates.",
  },
  scroll: {
    sequence: [
      "Use move_mouse_to to place the pointer inside the intended scrollable content unless its current visible position is already suitable. Do not leave it on a panel handle after dragging.",
      "Use bounded scroll_mouse steps. Determine the sign from actual content displacement on this device; do not assume negative means down.",
      "Inspect the returned image and continue toward the visible goal. A modal, boundary or wrong region can explain no movement; do not blindly repeat or drag over clickable content.",
    ],
  },
  drag: {
    sequence: [
      "Select visible endpoints from the prior image, using original-image pixel coordinates and geometry.",
      "drag_at uses direct absolute HID; omit duration for 350 ms. No mouse calibration or relative fallback.",
      "Sites binds the accepted original frame; the phone checks current scope, geometry and order without fetching or comparing old JPEG pixels.",
      "Inspect and reuse the same-call after-image.",
    ],
    limits:
      "No original-image 4/10-second cutoff. Current capture, authorization, deadlines and release remain required. A board ACK is not visible effect.",
  },
  clipboard: {
    implementation_status: "Deferred from the first release; no clipboard MCP tool.",
    limits:
      "Printable ASCII only. Do not silently truncate or transliterate Unicode, Emoji or long text.",
  },
  stop: {
    sequence: [
      "Call stop_mouse immediately without readiness checks. If the user did not select a device, omit device_id to stop all owned devices. Never block Stop on CHOOSE_DEVICE or missing readiness. Sharing continues; board release must be confirmed separately.",
      "Use stop_session when the user wants sharing ended; omit bridge_session_id to stop all their ongoing sessions without a prior list_devices call. Verify iOS system termination separately.",
    ],
    limits: "Never automatically re-enable after Stop.",
  },
};
export function controlGuide(workflow: ControlWorkflow) {
  return {
    state: "guidance_only",
    guide_revision: "2.1.0",
    interaction_policy_version: interactionPolicyVersion,
    current_workflow: phoneWorkflowInstructions,
    workflow,
    device_readiness: "not_checked",
    ...guides[workflow],
    invariants: [
      "T6: use the final-step handoff in click_at guidance and shared Skill workflows; do not submit the irreversible final action.",
      "Inspect actual image blocks, not metadata alone. Ordinary visual reads remain strictly below 2000 ms at Sites release.",
      "Reuse the preceding after-image and its exact device/frame/geometry/proof. No routine extra read_screen or OCR.",
      "Keep owner, device, sharing/control scope, coordinate geometry, command deadline, signed release and idempotency checks.",
      "Unknown input permits original-ID/key reads only; a missing record does not authorize resubmission.",
      "A confirmed action with a missing/loading image permits one bounded original-ID get_mouse_result observation.",
      "Distinguish real-device outcomes, historical-image replay and synthetic fixtures. ACK alone is not app success.",
      "Do not invoke retired preparation, layout, source-query or parked-resume paths. Missing capability requires the current app, not a fallback.",
    ],
  };
}
