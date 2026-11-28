import {need} from "./bridge-engine.ts";

import { screenReading } from "./screen-reading-copy.ts";

export const quotaErrorText = {
  QUOTA_EXHAUSTED: `本月免费帮你点次数已用完。我可以继续${screenReading.zh}，告诉你怎么点。 You’ve used all your free tapping sessions this month. I can still ${screenReading.en} and guide you.`,
  QUOTA_TIME_UNAVAILABLE: `免费次数暂时查不到，请在 SaySo 点“重新确认”。我仍可以${screenReading.zh}。 SaySo can’t check your free sessions right now. Tap “Check again” in SaySo. I can still ${screenReading.en}.`,
  QUOTA_STORAGE_UNAVAILABLE: `这台手机的免费次数暂时查不到，请稍后在 SaySo 点“重新确认”。我仍可以${screenReading.zh}。 SaySo can’t check the free sessions on this phone. Tap “Check again” in SaySo shortly. I can still ${screenReading.en}.`,
  QUOTA_INPUT_UNCONFIRMED: "上一次帮你点的结果还没确认，请先不要重复。 The outcome of your last tapping action is still unknown. Please hold off on repeating it.",
} as const;
export const quotaErrors=Object.keys(quotaErrorText);
export function isQuotaError(error:unknown):error is keyof typeof quotaErrorText {
  return typeof error==="string"&&Object.hasOwn(quotaErrorText,error);
}
/** Only an explicit, authenticated pre-input refusal can carry a quota code. */
export function quotaNoInput(body:Record<string,unknown>,receipt:Record<string,unknown>) {
  if(!isQuotaError(body.error))return false;
  need(body.state==="failed"&&body.input_submitted===false&&Object.keys(receipt).length===0&&
    body.finished_client_mono_ms==null&&body.input_attempted!==true,"NO_INPUT_PROOF_CONFLICT",422);
  return true;
}
export function quotaResultError(value:Record<string,unknown>):keyof typeof quotaErrorText|undefined {
  if(isQuotaError(value.error))return value.error;
  for(const key of ["move_result","click_result","input_result","shortcut_result"]){
    const part=value[key],error=part&&typeof part==="object"&&!Array.isArray(part)?(part as Record<string,unknown>).error:undefined;
    if(isQuotaError(error))return error;
  }
}
