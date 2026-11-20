import { finite, need, record, text, uuid } from "./bridge-engine.ts";

export const spotlightKind = "spotlight.type_google_map";
export const spotlightCapability = "sayso.spotlight_wired";
export const spotlightProbeCapability = "sayso.spotlight_wired_probe";
export const spotlightStableCapability = "hid.keyboard.spotlight_stable";
export const focusedTextKind = "keyboard.type_text";
export const focusedTextCapability = "sayso.focused_text";
export const noVisualFieldCapability = "sayso.focused_text.no_visual.v1";
export const noVisualFieldProtocol = "no_visual_v1";
export const stableASCIICapability = "hid.keyboard.ascii_stable";
export const modelReviewedFieldProtocol = "model_reviewed_field_crops.v1";
export const modelReviewedFieldCapability = "sayso."+modelReviewedFieldProtocol;
export const extendedModelReviewedFieldProtocol = "model_reviewed_field_crops.v2";
export const extendedModelReviewedFieldCapability = "sayso."+extendedModelReviewedFieldProtocol;
export const extendedModelReviewedFieldAgeMS = 10000;
export const focusedTextSubmitEnterCapability = "sayso.focused_text_submit_enter";
export const stableASCIIEnterCapability = "hid.keyboard.ascii_enter_stable";
export const focusedTextClearCapabilities = ["sayso.focused_text_clear_before_input", "hid.keyboard.ascii_clear_stable"] as const;
// Reserve time for the select/delete reports and optional Return in the board's fixed lease.
export const focusedTextClearMaxLength = 60;
export const focusedTextEnterCapabilities = [focusedTextCapability, stableASCIICapability,
  focusedTextSubmitEnterCapability, stableASCIIEnterCapability] as const;
export const focusedTextLinkedAfterEnterCapability = "sayso.focused_text_linked_after_enter.v1";
export const focusedTextLinkedAfterEnterCapabilities = [...focusedTextEnterCapabilities,
  extendedModelReviewedFieldCapability, focusedTextLinkedAfterEnterCapability] as const;
export const spotlightLandmarks = ["Siri Suggestions", "App Suggestions", "Suggestions", "Siri 建议", "应用建议", "App 建议", "建議", "建议"];

function region(value: unknown) {
  const v = record(value);
  need(Object.keys(v).length === 4, "INVALID_SPOTLIGHT_REGION", 422);
  const x = finite(v.x, 0, 1), y = finite(v.y, 0, 1), width = finite(v.width, 0.01, 1), height = finite(v.height, 0.015, 0.15);
  need(x + width <= 1 && y + height <= 1 && width * height <= 0.15, "INVALID_SPOTLIGHT_REGION", 422);
  return { x, y, width, height };
}

function focusRegions(args:Record<string,unknown>,spotlight:boolean) {
  const source_frame_id = uuid(args.source_frame_id), field = region(args.field), anchor = record(args.landmark);
  const label = text(anchor.text, spotlight?32:80), landmark = { text: label, region: region(anchor.region) }, target = landmark.region;
  need(Object.keys(anchor).length === 2 && (spotlight?spotlightLandmarks.includes(label):label.trim().length>0) &&
    field.width >= (spotlight?0.2:0.08) && field.height <= (spotlight?0.12:0.15),
    spotlight?"INVALID_SPOTLIGHT_FOCUS":"INVALID_FIELD_FOCUS", 422);
  need(field.x + field.width <= target.x || target.x + target.width <= field.x ||
    field.y + field.height <= target.y || target.y + target.height <= field.y, "SPOTLIGHT_REGIONS_OVERLAP", 422);
  return {source_frame_id,field,landmark};
}

export function spotlightPayload(args: Record<string, unknown>) {
  need(args.probe_keyboard===undefined || typeof args.probe_keyboard==="boolean", "INVALID_SPOTLIGHT_PROBE", 422);
  return {...focusRegions(args,true),...(args.probe_keyboard===true?{probe_keyboard:true}:{})};
}

export function authorizedFieldText(args:Record<string,unknown>) {
  const value=text(args.text,64);
  need(!/[^\x20-\x7e]/u.test(value),"UNSUPPORTED_TEXT_CHARACTERS",422);
  need((args.submit===undefined||args.submit==="enter")&&args.submit_enter===undefined,"INVALID_FIELD_SUBMIT",422);
  need(args.clear_before_input===undefined||typeof args.clear_before_input==="boolean","INVALID_FIELD_CLEAR",422);
  need(args.clear_before_input!==true||value.length<=focusedTextClearMaxLength,"FIELD_CLEAR_TEXT_TOO_LONG",422);
  return {text:value,...(args.submit==="enter"?{submit_enter:true as const}:{}),
    ...(args.clear_before_input===true?{clear_before_input:true as const}:{})};
}

export function focusedTextPayload(args:Record<string,unknown>) {
  const payload=authorizedFieldText(args),placeholder=args.placeholder===undefined?undefined:text(args.placeholder,80);
  need(!payload.clear_before_input,"FOCUSED_TEXT_CLEAR_NOT_READY");
  need(placeholder===undefined||placeholder.trim().length>0,"INVALID_FIELD_PLACEHOLDER",422);
  return {...focusRegions(args,false),text:payload.text,...(placeholder===undefined?{}:{placeholder}),
    ...(payload.submit_enter?{submit_enter:true as const}:{})};
}
/** Geometry/placeholder evidence without implying a text submission. */
export function focusedFieldEvidence(args:Record<string,unknown>){
  const focus=focusRegions(args,false),placeholder=text(args.placeholder,80);
  need(placeholder.trim().length>0,"INVALID_FIELD_PLACEHOLDER",422);
  return {...focus,placeholder};
}

export function spotlightReceipt(body: Record<string, unknown>, receipt: Record<string, unknown>, command: string, oldBoot: string,
  stableUSB=false,focused=false,submitEnter=false,noVisual=false,clearBeforeInput=false) {
  const focus = body.spotlight_focus_frame_id == null ? null : uuid(body.spotlight_focus_frame_id);
  const restored = body.restored_mouse_boot_id == null ? null : uuid(body.restored_mouse_boot_id);
  const recovered = body.original_receipt_read === true;
  if(noVisual)need(stableUSB&&focused&&focus===null,"INVALID_FOCUSED_TEXT_RECEIPT",422);
  need((body.mouse_mode_confirmed === true) === (restored !== null) &&
    (stableUSB ? restored===null||restored===oldBoot : restored!==oldBoot), "INVALID_SPOTLIGHT_RESTORE", 422);
  if (body.state === "board_acked") {
    const keyboardBoot = uuid(receipt.board_boot_id), effect=record(receipt.effect);
    const bootProof=stableUSB
      ? keyboardBoot===oldBoot&&restored===oldBoot&&effect[focused?"ascii_stable":"spotlight_stable"]===true&&effect.all_released===true
      : keyboardBoot!==oldBoot&&keyboardBoot!==restored&&effect.spotlight_stable!==true;
    need(receipt.command_id === command && bootProof && (focus || noVisual&&body.input_submitted===true&&receipt.error==null&&body.error==null) &&
      receipt.state === "executed" && receipt.subcommand_index === 0 && effect.hid_reports_sent === true,
      "INVALID_SPOTLIGHT_RECEIPT", 422);
    if(submitEnter)need(stableUSB&&focused&&receipt.error==null&&body.error==null&&effect.enter_sent===true,
      "INVALID_FOCUSED_TEXT_ENTER_RECEIPT",422);
    else if(focused)need(effect.enter_sent!==true,"UNEXPECTED_FOCUSED_TEXT_ENTER_RECEIPT",422);
    if(clearBeforeInput)need(noVisual&&effect.clear_before_input===true,"INVALID_FOCUSED_TEXT_CLEAR_RECEIPT",422);
    else if(focused)need(effect.clear_before_input!==true,"UNEXPECTED_FOCUSED_TEXT_CLEAR_RECEIPT",422);
  } else {
    need(Object.keys(receipt).length === 0 && !recovered, "INVALID_SPOTLIGHT_RECEIPT", 422);
  }
  return { ...receipt, spotlight: { focus_frame_id: focus, restored_mouse_boot_id: restored,
    mouse_mode_confirmed: restored !== null, original_receipt_read: recovered, ...(stableUSB?{transport:"stable_usb"}:{}),
    ...(submitEnter&&body.state==="board_acked"?{enter_sent:true}:{}),
    ...(clearBeforeInput&&body.state==="board_acked"?{clear_sent:true}:{}) } };
}
