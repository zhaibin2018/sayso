import {need,record} from "./bridge-engine.ts";

/** Older firmware only supplied the generic HID success flag. */
export function hasPacedWheelEvidence(receipt:Record<string,unknown>) {
  const effect=receipt.effect;
  return effect!==null&&typeof effect==="object"&&!Array.isArray(effect)&&
    (Object.hasOwn(effect,"wheel_reports_sent")||Object.hasOwn(effect,"wheel_units_sent"));
}

export function validatePacedWheelReceipt(receipt:Record<string,unknown>,command:string,boot:string,steps:unknown,executed:boolean) {
  const effect=record(receipt.effect),start=receipt.started_uptime_ms,finish=receipt.finished_uptime_ms;
  const units=effect.wheel_units_sent,reports=effect.wheel_reports_sent,hidReportsSent=effect.hid_reports_sent;
  const integer=(value:unknown):value is number=>typeof value==="number"&&Number.isSafeInteger(value);
  need(receipt.command_id===command&&receipt.board_boot_id===boot&&receipt.subcommand_index===0&&
    integer(start)&&start>=0&&integer(finish)&&finish>=start&&integer(steps)&&steps!==0&&Math.abs(steps)<=8&&
    Object.keys(effect).length===3&&typeof hidReportsSent==="boolean"&&integer(units)&&integer(reports)&&
    reports===Math.abs(units)&&Math.abs(units)<=Math.abs(steps)&&(units===0||Math.sign(units)===Math.sign(steps)),
    "INVALID_WHEEL_RECEIPT",422);
  if(executed)need(receipt.state==="executed"&&receipt.error==null&&hidReportsSent&&units===steps,"INVALID_WHEEL_RECEIPT",422);
  // The executor can finish the full wheel sequence before Guard loses
  // authority at terminal commit. Only the signed terminal state proves ACK.
  else if(hidReportsSent)need(receipt.state==="outcome_unknown"&&receipt.error===null&&units===steps,"INVALID_WHEEL_RECEIPT",422);
  else need((receipt.state==="failed"||receipt.state==="outcome_unknown")&&
    (receipt.error==null||typeof receipt.error==="string"&&receipt.error.length<=120),"INVALID_WHEEL_RECEIPT",422);
}
