import { test } from "node:test";
import assert from "node:assert/strict";
import { isSensitiveCardInput, rejectSensitiveInput } from "../lib/sensitive-input.ts";
import { deviceNextStep } from "../lib/device-next-step.ts";
import { handleMcp } from "../lib/mcp-protocol.ts";
import { MouseControl } from "../lib/mouse-control.ts";
import { BridgeError, type BridgeEngine } from "../lib/bridge-engine.ts";
import { responseProjection } from "../lib/timing-journal.ts";
import { allMcpTools } from "../lib/mcp-tool-catalog.ts";
import { phoneWorkflowInstructions } from "../lib/interaction-guidance.ts";
import { isDragNoInputPreflightError } from "../lib/absolute-drag.ts";

const cards = [
  "4111111111111111",
  "4111 1111 1111 1111",
  "4111-1111-1111-1111",
  "4222222222222",
  "4000000000000000006",
];
const ordinary = [
  "+65 8123 4567",
  "13800138000",
  "123456",
  "018956",
  "100.00",
  "1234567890123456",
  "Order 4111111111111111",
];
const user = { id: "offline-user", label: "Offline" },
  id = "11111111-1111-1111-1111-111111111111";

test("Luhn backstop rejects only 13-19 digit card-shaped text, with spaces or hyphens", () => {
  for (const value of cards) assert.equal(isSensitiveCardInput(value), true);
  for (const value of [...ordinary, "123", "123456789012", "12345678901234567890", null, 123]) {
    assert.equal(isSensitiveCardInput(value), false);
    assert.doesNotThrow(() => rejectSensitiveInput(value));
  }
});

test("sensitive field input cannot reach signing, DB, forwarding, response text or logs", async () => {
  for (const value of cards) {
    const logs: Record<string, unknown>[] = [],
      accesses: string[] = [];
    const service = new Proxy(
      {},
      {
        get(_target, key) {
          accesses.push(String(key));
          throw Error("Forbidden service access");
        },
      },
    ) as BridgeEngine;
    await assert.rejects(
      new MouseControl(service).enqueueAuthorizedFieldObserved(user, { text: value }),
      (error: unknown) =>
        error instanceof BridgeError && error.code === "SENSITIVE_INPUT_USER_MUST_TYPE",
    );
    const response = await handleMcp(
      new Request("https://offline.invalid/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "type_text_in_field",
            arguments: { device_id: id, idempotency_key: "offline", text: value },
          },
        }),
      }),
      {
        engine: () => service,
        caller: () => user,
        origin: "https://offline.invalid",
        retention: false,
        performance: {
          log: (entry) => {
            logs.push(entry);
          },
        },
      },
    );
    const body = (await response.json()) as any;
    assert.equal(body.result.isError, true);
    assert.equal(body.result.structuredContent.error, "SENSITIVE_INPUT_USER_MUST_TYPE");
    assert.equal(body.result.structuredContent.input_length, value.length);
    assert.deepEqual(accesses, []);
    const journal = responseProjection(body);
    assert.equal(journal.reason_code, "SENSITIVE_INPUT_USER_MUST_TYPE");
    assert.equal(journal.sensitive_input_length, value.length);
    for (const output of [body, journal, logs])
      assert.equal(JSON.stringify(output).includes(value), false);
  }
});

test("ordinary phone numbers, postcodes and amounts continue into the ordinary admission path", async () => {
  for (const value of ordinary.slice(0, 6)) {
    let signed = 0;
    const service = {
      textRequestDigest: async () => {
        signed++;
        throw new BridgeError("OFFLINE_ADMISSION_REACHED", 409);
      },
    } as unknown as BridgeEngine;
    await assert.rejects(
      new MouseControl(service).enqueueAuthorizedFieldObserved(user, {
        device_id: id,
        idempotency_key: "offline",
        text: value,
      }),
      (error: unknown) =>
        error instanceof BridgeError && error.code === "OFFLINE_ADMISSION_REACHED",
    );
    assert.equal(signed, 1);
  }
});

test("next step prioritizes offline, sharing, pause, future unlock, control permission", () => {
  const session = { mode: "broadcast", capture_state: "active", control_enabled: false };
  // An expired/missing sharing lease does not distinguish unpaired or revoked devices.
  for (const staleSession of [
    null,
    session,
    { ...session, capture_state: "paused" },
    { ...session, control_enabled: true },
  ]) {
    assert.equal(deviceNextStep(false, staleSession), "START_SAYSO_BROADCAST");
  }
  assert.equal(deviceNextStep(true, null), "START_SAYSO_BROADCAST");
  assert.equal(
    deviceNextStep(true, { ...session, capture_state: "stopped" }),
    "START_SAYSO_BROADCAST",
  );
  assert.equal(
    deviceNextStep(true, { ...session, capture_state: "paused" }, false),
    "CAPTURE_PAUSED",
  );
  assert.equal(deviceNextStep(true, session), "ALLOW_CONTROL_IN_SAYSO");
  assert.equal(deviceNextStep(true, session, false), "UNLOCK_IN_SAYSO_APP");
  assert.equal(deviceNextStep(true, { ...session, control_enabled: true }), null);
});

test("T36 projects read outcome and bounded reason without retaining free text", () => {
  for (const [state, reason] of [
    ["unavailable", "START_SAYSO_BROADCAST"],
    ["paused", "CAPTURE_PAUSED"],
    ["available", undefined],
    ["unchanged", undefined],
  ]) {
    const projected = responseProjection({
      result: {
        structuredContent: { state, reason, text: "private", metadata: { text: "private" } },
        content: [],
      },
    });
    assert.equal(projected.read_screen_state, state);
    assert.equal(projected.reason_code, reason ?? null);
    assert.doesNotMatch(JSON.stringify(projected), /private/);
  }
  assert.equal(
    responseProjection({
      result: {
        structuredContent: { state: "arbitrary private data", reason: "arbitrary private data" },
      },
    }).reason_code,
    null,
  );
});

test("guidance covers sensitive fields and ChatGPT-self redirection in Chinese and English", () => {
  const field = allMcpTools.find((tool) => tool.name === "type_text_in_field")!;
  for (const text of [field.description, phoneWorkflowInstructions]) {
    assert.match(text, /passwords/);
    assert.match(text, /identity numbers/);
    assert.match(text, /验证码/);
    assert.match(text, /这一项请你自己输入/);
    assert.match(text, /park the pointer/);
  }
  assert.match(phoneWorkflowInstructions, /screen shows ChatGPT itself/);
  assert.match(phoneWorkflowInstructions, /打开对应 App/);
  assert.match(phoneWorkflowInstructions, /switch to that page/);
  assert.match(phoneWorkflowInstructions, /use voice/);
  assert.match(allMcpTools.find((tool) => tool.name === "list_devices")!.description, /next_step/);
  assert.equal(isDragNoInputPreflightError("ROTATE_TO_PORTRAIT"), true);
});
