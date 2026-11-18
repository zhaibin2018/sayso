import { test } from "node:test";
import assert from "node:assert/strict";
import { FrameUploadPermits } from "../lib/frame-upload-permit.ts";
import { validSigningSecret } from "../lib/signing-configuration.ts";
import { requireMcpSigning, requireDeviceSigning } from "../lib/signing-policy.ts";
test("invalid signing configuration cannot create an instance-random permit key", async () => {
  for (const key of [undefined, "", "ab".repeat(31), "ab".repeat(32) + "\n", "z".repeat(64)]) {
    assert.equal(validSigningSecret(key), false);
    const signer = new FrameUploadPermits(key);
    assert.equal(signer.sourceViewProofAvailable, false);
    await assert.rejects(signer.issue("fixture", {} as any), /SIGNING_CONFIGURATION_INVALID/);
  }
});
test("signing failure blocks new input but never blocks Stop, revoke or original receipts", () => {
  for (const name of ["click_at", "type_text_in_field", "read_screen", "get_mouse_state"])
    assert.throws(() => requireMcpSigning(name, false), /SIGNING_CONFIGURATION_INVALID/);
  for (const name of ["stop_mouse", "stop_session", "revoke_device", "get_mouse_result"])
    assert.doesNotThrow(() => requireMcpSigning(name, false));
  assert.throws(() => requireDeviceSigning("mouseGrant", false, { control_enabled: true }));
  assert.doesNotThrow(() => requireDeviceSigning("mouseGrant", false, { control_enabled: false }));
  for (const name of ["sessionStop", "unpair", "mouseResult"])
    assert.doesNotThrow(() => requireDeviceSigning(name, false));
});
