import test from "node:test";
import assert from "node:assert/strict";
import { homeStatus, stoppedMouseGrant, sharingStatusInstruction } from "../lib/home-status.ts";
import { mcpToolsForAudience } from "../lib/mcp-tool-catalog.ts";
import { phoneWorkflowInstructions } from "../lib/interaction-guidance.ts";

test("home rows: sharing and accessory states across lease, capture and binding combinations", () => {
  let count = 0;
  for (const online of [false, true])
    for (const accessoryBound of [false, true])
      for (const usbConnected of [false, true])
        for (const [mode, capture, expected] of [
          ["none", "active", "not_started"],
          ["foreground_diagnostic", "active", "not_started"],
          ["broadcast", "stopped", "not_started"],
          ["broadcast", "active", "active"],
          ["broadcast", "paused", "paused"],
          ["broadcast", "interrupted", "interrupted"],
          ["broadcast", "starting", "interrupted"],
          ["broadcast", "unrecognized", "interrupted"],
        ]) {
          const value = homeStatus({
            online,
            accessoryBound,
            usbConnected,
            session:
              mode === "none"
                ? null
                : {
                    mode,
                    capture_state: capture,
                    control_enabled: false,
                    mouse_enabled: 0,
                    mouse_grant_request: null,
                  },
          });
          assert.equal(value.service, "connected");
          assert.equal(
            value.screen_sharing,
            !online && expected !== "not_started" ? "interrupted" : expected,
          );
          assert.equal(
            value.accessory,
            usbConnected ? "connected" : accessoryBound ? "not_connected" : "not_needed",
          );
          assert.ok(Array.from(value.summary_zh).length <= 22);
          assert.ok(value.summary_en.length <= 42);
          assert.equal(value.summary_zh.split("。").filter(Boolean).length, 1);
          assert.equal(value.summary_en.split(".").filter(Boolean).length, 1);
          if (value.screen_sharing !== "active") {
            assert.doesNotMatch(value.summary_en, /tapping allowed/);
            assert.doesNotMatch(value.summary_zh, /帮你点已允许/);
          }
          count++;
        }
  assert.equal(count, 64);
});

test("home rows: tapping distinguishes never allowed, stopped, paused, expired and read-only", () => {
  const base = {
    online: true,
    accessoryBound: true,
    usbConnected: true,
    session: {
      mode: "broadcast",
      capture_state: "active",
      control_enabled: false,
      mouse_enabled: 0,
      mouse_grant_request: null as string | null,
    },
  };
  const cases = [
    [base, "not_allowed"],
    [{ ...base, session: { ...base.session, control_enabled: true, mouse_enabled: 1 } }, "allowed"],
    [{ ...base, session: { ...base.session, mouse_grant_request: stoppedMouseGrant } }, "stopped"],
    [
      { ...base, session: { ...base.session, mouse_grant_request: "prior-session-grant" } },
      "stopped",
    ],
    [
      {
        ...base,
        session: { ...base.session, mouse_grant_request: "expired-grant", mouse_enabled: 1 },
      },
      "paused",
    ],
    [
      {
        ...base,
        usbConnected: false,
        session: { ...base.session, mouse_grant_request: "prior-grant" },
      },
      "paused",
    ],
    [{ ...base, usbConnected: false }, "not_allowed"],
    [
      { ...base, session: { ...base.session, capture_state: "paused", control_enabled: true } },
      "paused",
    ],
    [{ ...base, online: false, session: { ...base.session, control_enabled: true } }, "paused"],
    [
      {
        ...base,
        session: {
          ...base.session,
          capture_state: "paused",
          mouse_grant_request: stoppedMouseGrant,
        },
      },
      "stopped",
    ],
    [{ ...base, accessoryBound: false, usbConnected: false }, "not_needed"],
  ] as const;
  for (const [input, expected] of cases) assert.equal(homeStatus(input).tapping_for_you, expected);
});

test("sharing lookup guidance is bilingual, consistent and operation-focused", () => {
  assert.ok(phoneWorkflowInstructions.includes(sharingStatusInstruction));
  const tool = mcpToolsForAudience().find((tool) => tool.name === "list_devices")!;
  assert.ok(!tool.description.includes(sharingStatusInstruction));
  assert.match(tool.description, /home_status.*screen-sharing and control state/);
  assert.ok(tool.description.length <= 500);
  assert.match(sharingStatusInstruction, /list_devices.*home_status/);
  assert.match(sharingStatusInstruction, /请在 SaySo 里点开始屏幕共享/);
  assert.doesNotMatch(
    sharingStatusInstruction,
    /approval|risk|confirmation|without asking|批准|风险|不用问用户/i,
  );
});

test("home rows: status query failure preserves the original no-image result", async () => {
  const { missingScreenStatus } = await import("../lib/missing-screen-status.ts");
  const response = new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      result: {
        isError: false,
        content: [{ type: "text", text: '{"reason":"NO_FRESH_FRAME"}' }],
        structuredContent: { state: "unavailable", reason: "NO_FRESH_FRAME" },
      },
    }),
    { headers: { "Content-Type": "application/json", "X-Fixture": "preserved" } },
  );
  const engine = {
    listDevices: async () => {
      throw new Error("synthetic unavailable database");
    },
  } as unknown as import("../lib/bridge-engine.ts").BridgeEngine;
  const out = await missingScreenStatus(
    response,
    engine,
    { id: "owner", label: "fixture" },
    undefined,
  );
  const body = (await out.json()) as {
    result: { structuredContent: Record<string, unknown>; content: unknown[] };
  };
  assert.equal(body.result.structuredContent.reason, "NO_FRESH_FRAME");
  assert.equal(body.result.structuredContent.home_status, null);
  assert.equal(body.result.structuredContent.home_status_error, "STATUS_UNAVAILABLE");
  assert.equal(out.headers.get("X-Fixture"), "preserved");
  assert.equal(body.result.content.length, 2);
});
