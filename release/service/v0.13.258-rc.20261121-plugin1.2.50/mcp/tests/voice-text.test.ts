import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { compactMcpSummary } from "../lib/mcp-performance.ts";
import { conciseToolText } from "../lib/model-tool-text.ts";
import { voiceInstruction } from "../lib/voice-guidance.ts";
import { handleMcp } from "../lib/mcp-protocol.ts";
import { MouseControl } from "../lib/mouse-control.ts";
import type { BridgeEngine } from "../lib/bridge-engine.ts";

const metadata = {
  device_id: "device",
  frame_id: "frame",
  width: 390,
  height: 844,
  orientation_epoch: 1,
  age_ms: 3000,
  usable_for_input: true,
  static_screen: { proven: true, unchanged_for_ms: 3000 },
};
const handoff = {
  device_id: "device",
  source_frame_id: "frame",
  image_width: 390,
  image_height: 844,
  orientation_epoch: 1,
};
const project = (tool: string, raw: Record<string, unknown>) =>
  JSON.parse(
    conciseToolText(
      tool,
      raw,
      JSON.stringify(raw),
      compactMcpSummary(raw, false, tool === "click_at", false, tool === "read_screen"),
    ),
  );

test("voice projection preserves static image age, targeting source and warning distinction without mutating results", () => {
  const raw = {
    state: "repeated",
    image_blocks: 1,
    metadata,
    image_handoff: handoff,
    source_point_proof: "exact-opaque-proof",
    note: "long explanatory note",
  };
  const frozen = JSON.stringify(raw),
    result = project("read_screen", raw);
  assert.equal(result.metadata.age_ms, 3000);
  assert.equal(result.metadata.static_screen.proven, true);
  assert.deepEqual(result.click_at_source, {
    ...handoff,
    source_point_proof: "exact-opaque-proof",
  });
  assert.equal(JSON.stringify(raw), frozen);
  const warning = {
    state: "repeated",
    warning: "ACTION_NO_SCREEN_CHANGE",
    after_command: { command_id: "original", app_effect_observed: false },
    metadata: { ...metadata, usable_for_input: false },
    note: "long warning",
  };
  for (const tool of ["read_screen", "get_mouse_result"]) {
    const value =
      tool === "read_screen"
        ? warning
        : { state: "board_acked", command_id: "original", after_screen: warning };
    const compact = project(tool, value);
    const observed = compact.after_screen ?? compact;
    assert.equal(observed.warning, "ACTION_NO_SCREEN_CHANGE");
    assert.equal(observed.metadata.usable_for_input, false);
    assert.equal(observed.after_command.app_effect_observed, false);
    assert.equal(compact.click_at_source, undefined);
  }
  const dropped = project("read_screen", {
    state: "unavailable",
    reason: "SCREEN_CHANGED_SINCE_IMAGE",
    image_blocks: 0,
  });
  assert.equal(dropped.reason, "SCREEN_CHANGED_SINCE_IMAGE");
  assert.equal(dropped.click_at_source, undefined);
  const expired = project("drag_at", {
    state: "board_acked",
    command_id: "original",
    after_screen: {
      state: "unavailable",
      reason: "NO_FRESH_FRAME",
      release_failure: "frame_expired",
    },
  });
  assert.equal(expired.after_screen, undefined);
});

test("all action summaries retain original outcome and reason, without payloads, receipts or repeated prose", () => {
  for (const tool of [
    "click_at",
    "move_mouse_to",
    "move_mouse",
    "click_mouse",
    "type_text_in_field",
    "scroll_mouse",
    "drag_at",
    "open_system_search",
    "get_mouse_result",
  ]) {
    const raw = {
      state: "outcome_unknown",
      command_id: "original",
      reason: "USB_OUTCOME_UNKNOWN",
      app_effect_observed: false,
      payload: { text: "private fixture text" },
      board_receipt: { detail: "long receipt" },
      after_screen: { state: "unavailable", reason: "NO_FRESH_FRAME" },
      after_image_instruction: "Repeated explanation. ".repeat(80),
    };
    const frozen = JSON.stringify(raw),
      compact = project(tool, raw);
    assert.equal(compact.state, raw.state);
    assert.equal(compact.command_id, raw.command_id);
    assert.equal(compact.reason, raw.reason);
    assert.equal(compact.app_effect_observed, false);
    assert.equal(compact.after_screen.reason, "NO_FRESH_FRAME");
    assert.equal(compact.payload, undefined);
    assert.equal(compact.board_receipt, undefined);
    assert.ok(JSON.stringify(compact).length < frozen.length / 2);
    assert.equal(JSON.stringify(raw), frozen);
  }
  const error = project("type_text_in_field", {
    error: "SENSITIVE_INPUT",
    input_length: 16,
    input_not_submitted: true,
  });
  assert.equal(error.error, "SENSITIVE_INPUT");
  assert.equal(error.input_length, 16);
  assert.equal(error.input_not_submitted, true);
  const stop = project("stop_mouse", {
    stopped: false,
    board_release_confirmed: false,
    stopped_devices: ["one"],
    failed_devices: [{ device_id: "two", error: "STOP_FAILED" }],
  });
  assert.equal(stop.stopped, false);
  assert.equal(stop.board_release_confirmed, false);
  assert.equal(stop.failed_devices[0].error, "STOP_FAILED");
});

async function rpc(
  method: string,
  params: Record<string, unknown>,
  modern: boolean,
  engine?: BridgeEngine,
) {
  const response = await handleMcp(
    new Request("https://offline.invalid/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(modern ? { "MCP-Protocol-Version": "2026-07-28" } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    {
      retention: false,
      engine: () => {
        if (!engine) throw Error("No service access");
        return engine;
      },
      caller: () => ({ id: "offline", label: "Offline" }),
      origin: "https://offline.invalid",
      performance: { log: () => {} },
    },
  );
  return (
    (await response.json()) as {
      result: {
        instructions: string;
        content: { type: string; text: string }[];
        structuredContent: {
          state?: string;
          descriptor_version?: string;
          devices: Record<string, unknown>[];
          [key: string]: unknown;
        };
      };
    }
  ).result;
}

test("both protocols return compact status with complete structured fields and detailed guide on demand", async (t) => {
  const status = {
    device_id: "device",
    enabled: false,
    online: true,
    usb_connected: true,
    capabilities: { "hid.mouse.absolute": true },
    screen_geometry: metadata,
    descriptor_version: "fixture",
    board_boot_id: "boot",
  };
  t.mock.method(MouseControl.prototype, "status", async () => status as never);
  const device = {
    device_id: "device",
    name: "Fixture",
    online: true,
    home_status: {
      screen_sharing: "active",
      tapping_for_you: "stopped",
      summary_zh: "屏幕共享中，已停止帮你点。",
      summary_en: "Sharing; tapping stopped.",
    },
    latest_frame: metadata,
    last_diagnostic: { state: "stopped" },
  };
  const engine = { listDevices: async () => [device] } as unknown as BridgeEngine;
  for (const modern of [false, true]) {
    const initialized = await rpc("initialize", {}, modern);
    assert.ok(initialized.instructions.includes(voiceInstruction));
    for (const name of ["get_mouse_state", "list_devices"]) {
      const result = await rpc("tools/call", { name, arguments: {} }, modern, engine);
      const text = JSON.parse(result.content[0].text);
      if (name === "get_mouse_state") {
        assert.deepEqual(text.capabilities, status.capabilities);
        assert.deepEqual(text.screen_geometry, metadata);
        assert.equal(text.enabled, false);
        assert.equal(text.descriptor_version, undefined);
        assert.equal(result.structuredContent.descriptor_version, "fixture");
      } else {
        assert.deepEqual(text.devices[0].home_status, device.home_status);
        assert.equal(text.devices[0].latest_frame, undefined);
        assert.deepEqual(result.structuredContent.devices[0], device);
      }
    }
    const guide = await rpc(
      "tools/call",
      { name: "get_control_guide", arguments: { workflow: "overview" } },
      modern,
    );
    assert.equal(guide.structuredContent.state, "guidance_only");
    assert.deepEqual(JSON.parse(guide.content[0].text), guide.structuredContent);
  }
});

const skillURL = new URL("../../plugin/skills/sayso-control/SKILL.md", import.meta.url);
test(
  "owned control Skill and initialization share the bilingual voice instruction",
  { skip: !existsSync(skillURL) },
  () => {
    const skill = readFileSync(skillURL, "utf8");
    assert.ok(skill.includes(voiceInstruction));
  },
);
