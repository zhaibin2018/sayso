import { BridgeError } from "./bridge-engine.ts";
export class InvalidArguments extends BridgeError {
  readonly detail: { unknown: string[]; missing: string[] };
  constructor(detail: { unknown: string[]; missing: string[] }) {
    super("INVALID_ARGUMENTS", 422);
    this.detail = detail;
  }
}
/** Only names are returned. Argument values, headers and tokens are never included. */
export function validateArgumentNames(
  args: Record<string, unknown>,
  schema: { properties: Record<string, unknown>; required: string[] },
) {
  const unknown = Object.keys(args)
    .filter((key) => !Object.hasOwn(schema.properties, key))
    .sort();
  const missing = schema.required.filter((key) => !Object.hasOwn(args, key)).sort();
  if (unknown.length || missing.length) throw new InvalidArguments({ unknown, missing });
}
