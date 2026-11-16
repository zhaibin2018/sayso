import {need,uuid,record,text} from "./bridge-engine.ts";

export const PAIRED_MOUSE_POINT="paired_mouse_point.v1";
export type PointRow={id:string;owner_id:string;device_id:string;session_id:string;hardware_id:string;board_boot_id:string;kind:string;payload:string;precondition:string|null;predecessor_id:string|null;worker_id:string;lease_epoch:number;control_epoch:number;expires_at:number};
export function pointSpec(precondition:unknown){
  if(precondition==null)return null;
  const value=record(typeof precondition==="string"?JSON.parse(precondition):precondition).point;
  if(value===undefined)return null;
  const p=record(value);
  need(Object.keys(p).length===2&&p.protocol===PAIRED_MOUSE_POINT,"INVALID_POINT_SPEC",422);
  return {protocol:PAIRED_MOUSE_POINT,click_command_id:uuid(p.click_command_id)};
}
export type PointPart={state:"board_acked"|"failed"|"outcome_unknown";receipt:Record<string,unknown>;ack:number|null;error:string|null;attempted:boolean};
const noInputErrors=new Set(["MOUSE_DISPATCH_BUDGET_EXPIRED","MOUSE_PRECONDITION_FAILED","POINT_CLICK_NOT_SUBMITTED","POINT_ADMISSION_INVALID","POINT_JOURNAL_UNAVAILABLE",
  "ABSOLUTE_COORDINATES_OUT_OF_RANGE","ABSOLUTE_GEOMETRY_UNAVAILABLE","ABSOLUTE_GEOMETRY_CHANGED","ABSOLUTE_GEOMETRY_TOO_OLD","ABSOLUTE_MAPPING_MISMATCH"]);
function part(value:Record<string,unknown>,command:PointRow):PointPart{
  need(["board_acked","failed","outcome_unknown"].includes(String(value.state))&&typeof value.input_submitted==="boolean","INVALID_POINT_PART",422);
  const state=value.state as PointPart["state"],attempted=value.input_submitted,receipt=record(value.board_receipt);
  let ack:number|null=null;
  if(state==="board_acked"||Object.keys(receipt).length){
    need(attempted&&uuid(receipt.command_id)===command.id&&uuid(receipt.board_boot_id)===command.board_boot_id&&receipt.state==="executed"&&receipt.error==null,"INVALID_POINT_RECEIPT",422);
    const effect=record(receipt.effect);need(effect.hid_reports_sent===true,"INVALID_POINT_RECEIPT",422);
    if(command.kind==="pointer.move_absolute"){
      const p=record(JSON.parse(command.payload));need(effect.absolute_requested_x===p.x&&effect.absolute_requested_y===p.y,"ABSOLUTE_RECEIPT_MISMATCH",422);
    }
    const clock=value.finished_client_mono_ms;
    need(typeof clock==="number"&&Number.isFinite(clock)&&clock>=0&&clock<=Number.MAX_SAFE_INTEGER,"INVALID_POINT_CLOCK",422);ack=clock;
  }else need(value.finished_client_mono_ms==null,"POINT_CLOCK_WITHOUT_RECEIPT",422);
  if(state==="board_acked")need(value.error==null,"INVALID_POINT_SUCCESS",422);
  if(state==="failed")need(!attempted&&Object.keys(receipt).length===0,"POINT_FAILURE_MAY_HAVE_INPUT",422);
  if(state==="outcome_unknown")need(attempted,"INVALID_POINT_UNKNOWN",422);
  const error=value.error==null?null:text(value.error,120);
  need(state==="board_acked"||error!==null,"POINT_ERROR_REQUIRED",422);
  if(state==="failed")need(error!==null&&noInputErrors.has(error),"POINT_NO_INPUT_ERROR_REQUIRED",422);
  return {state,receipt,ack,error,attempted};
}
export function validatePointResult(move:PointRow,click:PointRow,body:Record<string,unknown>){
  const spec=pointSpec(move.precondition),point=record(body.point_result);
  need(spec&&point.protocol===PAIRED_MOUSE_POINT&&move.kind==="pointer.move_absolute"&&click.kind==="pointer.click"&&click.id===spec.click_command_id&&click.id!==move.id&&click.predecessor_id===move.id,"POINT_CHILD_MISMATCH",422);
  for(const key of ["owner_id","device_id","session_id","hardware_id","board_boot_id","worker_id","lease_epoch","control_epoch","expires_at"] as const){
    need(move[key]===click[key],"POINT_SCOPE_MISMATCH",422);
  }
  const payload=record(JSON.parse(click.payload));need(Object.keys(payload).length===1&&payload.button==="left","INVALID_POINT_CLICK",422);
  const m=part(body,move),c=part(record(point.click),click);
  if(m.state!=="board_acked")need(c.state==="failed"&&!c.attempted&&c.error==="POINT_CLICK_NOT_SUBMITTED","POINT_CLICK_WITHOUT_MOVE",422);
  if(c.state==="board_acked")need(m.ack!==null&&c.ack!==null&&c.ack>=m.ack,"POINT_ACK_ORDER",422);
  return {move:m,click:c,noInput:!m.attempted&&!c.attempted};
}
