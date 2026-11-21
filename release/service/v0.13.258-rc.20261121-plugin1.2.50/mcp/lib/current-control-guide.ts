import {
  phoneWorkflowInstructions,
  interactionPolicyVersion,
  afterImageInstruction,
} from "./interaction-guidance.ts";
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
  "type_text_in_field enters the requested app name without Return. Only in system search to find an app, use app-name pinyin (for example taobao); do not transliterate Chinese elsewhere. From its actual after-image, click the installed result once.",
  "Reuse the launch after-image. Do not blindly submit the first suggestion or open a web/store result.",
];
const input = [
  "Identify the requested field from the preceding actual image. Click once if focus is needed.",
  "type_text_in_field uses current focus and the accessory max_text_len (candidate 150; legacy append 64, clear 60). Split longer printable ASCII at spaces or punctuation without losing characters. Clear only the first segment in a single-line field; append all later segments. Inspect each actual after-image and recheck authorization before the next segment; submit=enter only on the final segment when authorized.",
  "A counted unknown result remains locked to its original command/key. When recovery_eligible=true, read_screen, inspect the actual new image and continue explicitly with reviewed_input_command_id and reviewed_frame_id, with the unchanged source_point_proof in reviewed_frame_proof when available, a new key and clear_before_input=false. For a partial segment send only its exact unsent suffix; no automatic retry or repeated Return. Missing or inexact count, uncertain release or changed scope remains blocked.",
  "Clear only single-line fields. In Notes, email bodies and documents append with clear_before_input=false. Never enter full card numbers, CVV, banking passwords or one-time codes; ask the user to enter them. After typing, pinyin candidates or garbled text mean stop and ask for English (ABC), without retyping.",
  "For an in-app search use submit=enter. Omit submit for app discovery and fill-only drafts; never submit unrelated messages or payments.",
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
      "Only in system search to find an app, enter the app name in pinyin (for example taobao). Elsewhere, do not transliterate Chinese into pinyin. Use the English (ABC) keyboard; inspect the after-image and stop on pinyin candidates or garbled text without retyping.",
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
      "On stop/wait/pause/?/??/??, first call cancel_current_operation; stop_mouse and stop_session are cancellation aliases. Running and queued operations are cancelled; sharing and permission remain on. Missing selectors cover all owned devices.",
      "Read the screen again before the next user instruction (D131). No renewed permission is needed. To disable tapping or end sharing, ask the user to tap Stop tapping / ????? or End this use / ?????? in SaySo.",
    ],
    limits:
      "??????????????????????????????? Landscape is view-only; ask for portrait before input without repeated attempts. Original receipts contain available typed_count and release evidence; unknown counts remain unknown.",
  },
};
export function controlGuide(workflow: ControlWorkflow) {
  return {
    state: "guidance_only",
    guide_revision: "2.7.0",
    interaction_policy_version: interactionPolicyVersion,
    current_workflow: phoneWorkflowInstructions,
    workflow,
    device_readiness: "not_checked",
    ...guides[workflow],
    invariants: [
      afterImageInstruction,
      "Text results carry facts, original IDs, image geometry and reason codes. Full receipts and diagnostics remain in structuredContent. A board_acked receipt confirms the board only; inspect actual pixels for app effect. Pending or missing images never justify repeating input.",
      "Static image: static_screen.proven and usable_for_input=true permit normal targeting with the exact source. Preserve original capture age; execution rechecks the unchanged scene. SCREEN_CHANGED_SINCE_IMAGE requires read_screen. ACTION_NO_SCREEN_CHANGE means the action may have missed or had no effect; this warning image cannot target input or establish success.",
      "T6: for final payments, orders, sends, deletions, subscription cancellations or transfers, do not call click_at. Park with move_mouse_to, inspect its actual after-image, name the exact button and ask the user to tap. Do not substitute Return or another input. This is a soft instruction, not code enforcement.",
      "Inspect actual image blocks, not metadata alone. Ordinary visual reads remain strictly below 2000 ms at Sites release.",
      "Reuse the preceding after-image and its exact device/frame/geometry/proof. No routine extra read_screen or OCR.",
      "Keep owner, device, sharing/control scope, coordinate geometry, command deadline, signed release and idempotency checks.",
      "Unknown input permits original-ID/key reads only, except explicit image-bound continuation of a recovery_eligible counted terminal input. A missing record never authorizes resubmission.",
      "A confirmed action with a missing/loading image permits one bounded original-ID get_mouse_result observation.",
      "A device acknowledgement alone does not establish the visible app effect.",
      "Do not invoke retired preparation, layout, source-query or parked-resume paths. Missing capability requires the current app, not a fallback.",
    ],
  };
}
