import { absoluteMouseRequest } from "./absolute-mouse.ts";
import { integer, need, record, uuid } from "./bridge-engine.ts";

export const DRAG_KIND="pointer.drag_absolute";
export const DRAG_CAPABILITY="hid.mouse.drag_absolute";
export const DRAG_DIRECT_CAPABILITY="hid.mouse.drag_absolute.v2";
export const DRAG_APP_CAPABILITY="sayso.drag_at";
export const DRAG_RELATIVE_CAPABILITY="hid.mouse.drag_relative";
export const DRAG_RELATIVE_APP_CAPABILITY="sayso.drag_relative.v1";
export const DRAG_CAPTURE_GAP_MS=300;
export const DRAG_CALIBRATED_DURATION_MS=350;
export const DRAG_CLOUD_SOURCE_CAPABILITY="sayso.drag_cloud_acceptance.v1";
export const DRAG_CLOUD_SOURCE_CONFIRMATION="server_accepted_geometry.v1";
const relativeDragPreflightErrors=new Set(["DRAG_RELATIVE_CALIBRATION_REQUIRED","DRAG_RELATIVE_DURATION_UNMEASURED",
  "DRAG_RELATIVE_DIRECTION_UNMEASURED","DRAG_RELATIVE_RANGE_UNMEASURED"]);

export function isRelativeDragPreflightError(error:unknown) {
  return typeof error==="string"&&relativeDragPreflightErrors.has(error);
}

export function isDragNoInputPreflightError(error:unknown) {
  return typeof error==="string"&&new Set(["ROTATE_TO_PORTRAIT",
    "DRAG_PAYLOAD_INVALID","DRAG_BOARD_CAPABILITY_UNAVAILABLE","DRAG_APP_CAPABILITY_UNAVAILABLE",
    "DRAG_CONTROL_AUTHORITY_CHANGED","DRAG_CLAIM_ENVELOPE_INVALID","DRAG_START_ENVELOPE_INVALID",
    "DRAG_SOURCE_SCOPE_CHANGED","DRAG_CURRENT_FRAME_UNAVAILABLE","DRAG_SOURCE_REFERENCE_INVALID",
    "DRAG_SOURCE_ORDER_INVALID","DRAG_USB_GEOMETRY_CHANGED","CURRENT_ACTION_PROTOCOL_REQUIRED",
  ]).has(error);
}

export function relativeDragCorrection(value:Record<string,unknown>) {
  // Historical receipts remain readable; no current call suggests an old
  // relative-calibration route or a duration-correction replay.
  void value;return {};
}

export function absoluteDragRequest(args:Record<string,unknown>) {
  const from=absoluteMouseRequest({...args,x:args.from_x,y:args.from_y});
  const to=absoluteMouseRequest({...args,x:args.to_x,y:args.to_y});
  need(from.payload.x!==to.payload.x||from.payload.y!==to.payload.y,"EMPTY_DRAG",422);
  const duration=integer(args.duration_ms??DRAG_CALIBRATED_DURATION_MS,120,1000);
  return {
    device:uuid(args.device_id),
    payload:{from_x:from.payload.x,from_y:from.payload.y,to_x:to.payload.x,to_y:to.payload.y,duration_ms:duration},
    intent:{coordinate_space:"full_screen_image_pixels",source_from_x:from.intent.source_x,source_from_y:from.intent.source_y,
      source_to_x:to.intent.source_x,source_to_y:to.intent.source_y,source_width:from.intent.source_width,
      source_height:from.intent.source_height,orientation_epoch:from.intent.orientation_epoch,
      source_frame_id:uuid(args.source_frame_id),capture_min_gap_ms:integer(args.settle_ms??DRAG_CAPTURE_GAP_MS,0,2000)},
  };
}

function validRelativeDragEffect(effect:Record<string,unknown>,executed:boolean,duration:unknown) {
  if(typeof duration!=="number"||!Number.isInteger(duration)||duration<120||duration>1000)return false;
  const maximum=Math.min(1024,Math.ceil(duration/24)*127);
  const count=(value:unknown)=>typeof value==="number"&&Number.isSafeInteger(value)&&Math.abs(value)<=maximum;
  return Object.keys(effect).length===5&&effect.relative_drag===true&&effect.hid_reports_sent===executed&&
    count(effect.delta_x_sent)&&count(effect.delta_y_sent)&&typeof effect.all_released==="boolean"&&
    (!executed||(effect.all_released&&(effect.delta_x_sent!==0||effect.delta_y_sent!==0)));
}

/** The phone verifies the exact calibrated board request before forwarding its receipt. */
export function validateDragReceipt(receipt:Record<string,unknown>,command:string,boot:string,executed:boolean,duration:unknown,payload?:Record<string,unknown>) {
  const effect=record(receipt.effect),start=receipt.started_uptime_ms,finish=receipt.finished_uptime_ms;
  need(receipt.command_id===command&&receipt.board_boot_id===boot&&receipt.subcommand_index===0&&
    typeof start==="number"&&Number.isSafeInteger(start)&&start>=0&&
    typeof finish==="number"&&Number.isSafeInteger(finish)&&finish>=start,"INVALID_DRAG_RECEIPT",422);
  const absoluteSent=Object.keys(effect).length===1&&effect.hid_reports_sent===true;
  const relative=validRelativeDragEffect(effect,executed,duration);
  const direct=validDirectDragEffect(effect,executed,duration,payload);
  if(executed)need(receipt.state==="executed"&&receipt.error==null&&(absoluteSent||relative||direct),"INVALID_DRAG_RECEIPT",422);
  else need((receipt.state==="failed"||receipt.state==="outcome_unknown")&&
    (receipt.error==null||typeof receipt.error==="string"&&receipt.error.length<=120)&&
    (absoluteSent||relative||direct||Object.keys(effect).length===0),"INVALID_DRAG_RECEIPT",422);
}

function validDirectDragEffect(effect:Record<string,unknown>,executed:boolean,duration:unknown,payload?:Record<string,unknown>) {
  if(!payload||typeof duration!=="number"||!Number.isInteger(duration)||duration<120||duration>1000)return false;
  const steps=Math.ceil(duration/24),count=effect.motion_reports_sent;
  if(Object.keys(effect).length!==8||effect.absolute_drag_v2!==true||effect.hid_reports_sent!==executed||
     effect.button_report_id!==2||effect.position_report_id!==3||typeof effect.all_released!=="boolean"||
     typeof count!=="number"||!Number.isInteger(count)||count<0||count>steps||
     (executed&&(!effect.all_released||count!==steps)))return false;
  for(const axis of ["x","y"]){
    const from=payload["from_"+axis],to=payload["to_"+axis];
    if(typeof from!=="number"||typeof to!=="number"||!Number.isInteger(from)||!Number.isInteger(to)||
       from<0||from>32767||to<0||to>32767||effect["final_"+axis]!==from+Math.trunc((to-from)*count/steps))return false;
  }
  return true;
}
