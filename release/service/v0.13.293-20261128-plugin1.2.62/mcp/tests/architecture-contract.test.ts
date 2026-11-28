import { test } from "node:test";
import assert from "node:assert/strict";
import { handleMcp } from "../lib/mcp-protocol.ts";
import { handleDeviceRequest } from "../lib/device-api.ts";
import { currentClaimSchema, deviceRoutes, matchDeviceRoute } from "../lib/device-contract.ts";
import { matchesContract } from "../lib/contract-validation.ts";
import { BridgeError, type BridgeEngine } from "../lib/bridge-engine.ts";

async function catalogue(audience?: "development") {
  const response = await handleMcp(
    new Request("https://test.invalid/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
    {
      engine: () => {
        throw Error("static catalogue must not access devices");
      },
      caller: () => ({ id: "owner", label: "" }),
      origin: "https://test.invalid",
      toolAudience: audience,
      performance: { log: () => {} },
    },
  );
  return ((await response.json()) as any).result.tools.map(
    (tool: { name: string }) => tool.name,
  ) as string[];
}
test("production catalogue retains primitive action decisions and excludes development diagnostics", async () => {
  const normal = await catalogue(),
    development = await catalogue("development");
  assert.equal(normal.length, 18);
  for (const name of ["get_profile", "run_due_maintenance", "get_maintenance_status"])
    assert.ok(normal.includes(name));
  assert.ok(development.length > normal.length);
  for (const name of [
    "create_pairing_link",
    "read_screen",
    "click_at",
    "type_text_in_field",
    "drag_at",
    "scroll_mouse",
    "get_mouse_result",
    "cancel_current_operation",
  ])
    assert.ok(normal.includes(name));
  for (const name of [
    "stop_mouse",
    "stop_session",
    "create_pairing_code",
    "read_screen_live",
    "move_mouse",
    "click_mouse",
    "get_screen_metrics",
    "set_led",
    "read_benchmark_frame",
  ]) {
    assert.ok(!normal.includes(name));
    assert.ok(development.includes(name));
  }
  let accessed = 0;
  const response = await handleMcp(
    new Request("https://test.invalid/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "set_led",
          arguments: { on: true, idempotency_key: "hidden" },
        },
      }),
    }),
    {
      engine: () => {
        accessed++;
        throw Error("hidden tool");
      },
      caller: () => ({ id: "owner", label: "" }),
      origin: "https://test.invalid",
      performance: { log: () => {} },
    },
  );
  assert.equal(((await response.json()) as any).result.structuredContent.error, "UNKNOWN_TOOL");
  assert.equal(accessed, 0);
});
test("device registry rejects retired or malformed paths before any engine or input", async () => {
  for (const path of [
    "browse/input",
    "pointer-actions/ready",
    "screen-text",
    "capture-requests/claim",
  ]) {
    let calls = 0;
    const reply = await handleDeviceRequest(
      new Request("https://test.invalid/v1/device/" + path, {
        method: "POST",
        body: "invalid json",
      }),
      {
        engine: () => {
          calls++;
          throw Error("retired");
        },
      },
    );
    assert.equal(reply.status, 410);
    assert.equal(calls, 0);
  }
  assert.equal(
    matchDeviceRoute("POST", "requests/11111111-1111-4111-8111-111111111111/extra/ack"),
    null,
  );
  assert.equal(
    new Set(deviceRoutes.map((route) => route.method + " " + route.path)).size,
    deviceRoutes.length,
  );
});
test("device dispatch preserves token-before-body and atomic frame authentication", async () => {
  for (const path of ["mouse/grant", "frame"]) {
    const request = new Request("https://test.invalid/v1/device/" + path, {
      method: "POST",
      body: "malformed",
    });
    let parsed = 0;
    request.arrayBuffer = async () => {
      parsed++;
      throw Error("body read too early");
    };
    const service = {
      authenticate: async () => {
        throw new BridgeError("UNAUTHENTICATED", 401);
      },
      acceptFrameRequest: async () => {
        throw new BridgeError("UNAUTHENTICATED", 401);
      },
    } as unknown as BridgeEngine;
    assert.equal((await handleDeviceRequest(request, { engine: () => service })).status, 401);
    assert.equal(parsed, 0);
  }
});
test("current claim contract requires current scope and rejects retired declarations", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const current = {
    bridge_session_id: id,
    broadcast_id: id,
    worker_id: id,
    lease_epoch: 1,
    control_epoch: 2,
    raw_dispatch_protocol: "raw_mouse_claim_start.v1",
    point_protocol: "paired_mouse_point.v1",
  };
  assert.ok(matchesContract(current, currentClaimSchema));
  for (const patch of [
    { raw_dispatch_protocol: undefined },
    { lease_epoch: 0 },
    { worker_id: "invalid" },
    { app_search_protocol: "app_search_prepare.v1" },
    { reviewed_press_protocol: "reviewed_press_after_move.v1" },
    { raw_dispatch_ttl_profiles: ["reviewed_point_crop.v4"] },
  ])
    assert.equal(matchesContract({ ...current, ...patch }, currentClaimSchema), false);
});
