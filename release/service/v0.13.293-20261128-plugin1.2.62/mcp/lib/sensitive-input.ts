import { BridgeError } from "./bridge-engine.ts";

/** A narrow content backstop. Field meaning (password/OTP/ID) remains host guidance. */
export function isSensitiveCardInput(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const candidate = value.trim();
  if (!/^[0-9][0-9 -]*[0-9]$/.test(candidate)) return false;
  const digits = candidate.replace(/[ -]/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0,
    double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}
export class SensitiveInputError extends BridgeError {
  readonly inputLength: number;
  constructor(length: number) {
    super("SENSITIVE_INPUT_USER_MUST_TYPE", 422);
    this.inputLength = length;
  }
}
export function rejectSensitiveInput(value: unknown): void {
  if (isSensitiveCardInput(value)) throw new SensitiveInputError((value as string).length);
}
