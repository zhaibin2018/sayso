export const validSigningSecret = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
export class SigningConfigurationError extends Error {
  readonly code = "SIGNING_CONFIGURATION_INVALID";
  constructor() {
    super("SIGNING_CONFIGURATION_INVALID");
  }
}
