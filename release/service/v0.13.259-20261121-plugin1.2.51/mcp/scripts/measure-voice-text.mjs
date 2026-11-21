// Offline, fixed software fixtures. No service, device or network access.
import { readFileSync, writeFileSync } from "node:fs";
import { mcpToolsForAudience } from "../lib/mcp-tool-catalog.ts";
import { compactMcpSummary } from "../lib/mcp-performance.ts";
import { homeStatus } from "../lib/home-status.ts";
import { controlGuide } from "../lib/control-guide.ts";
import { afterImageInstruction } from "../lib/interaction-guidance.ts";
import { benchmarkFrame, benchmarkJpegFrame } from "../lib/benchmark-frame.ts";
import { staticScreenResult } from "../lib/static-screen-freshness.ts";
const [mode, file, outputFile] = process.argv.slice(2);
if (!["--baseline", "--compare"].includes(mode) || !file)
  throw Error("Expected --baseline/--compare file");
const id = "00000000-0000-4000-8000-000000000001";
const metadata = {
  device_id: id,
  frame_id: id,
  bridge_session_id: id,
  width: 390,
  height: 844,
  orientation_epoch: 1,
  age_ms: 100,
  capture_clock_verified: true,
};
const after = {
  state: "available",
  metadata,
  source_point_proof: "software-fixture-proof",
  after_command: {
    command_id: id,
    command_state: "board_acked",
    relation: "capture_after_phone_board_ack",
    scope_matches_at_snapshot: true,
    lower_gap_ms: 320,
  },
};
const home = () =>
  homeStatus({
    online: true,
    accessoryBound: true,
    usbConnected: true,
    session: {
      mode: "broadcast",
      capture_state: "active",
      control_enabled: true,
      mouse_enabled: 1,
      mouse_grant_request: id,
    },
  });
const action = (kind) => ({
  state: "board_acked",
  kind,
  command_id: id,
  device_id: id,
  bridge_session_id: id,
  verification: "phone_verified_board_ack",
  app_effect_observed: false,
  payload: { fixture: true },
  precondition: { fixture: true },
  board_receipt: { fixture: true },
  after_screen: after,
  observation_state: "available",
  image_blocks: 1,
  after_image_instruction: afterImageInstruction,
  image_handoff: {
    source_frame_id: id,
    device_id: id,
    image_width: 390,
    image_height: 844,
    orientation_epoch: 1,
  },
});
const fixtures = {
  read_screen: {
    state: "available",
    image_blocks: 1,
    metadata,
    source_point_proof: "software-fixture-proof",
  },
  click_at: {
    ...action("pointer.click"),
    click_command_id: id,
    move_command_id: id,
    click_submitted: true,
  },
  move_mouse_to: action("pointer.move"),
  scroll_mouse: action("pointer.scroll"),
  drag_at: action("pointer.drag"),
  move_mouse: action("mouse.move"),
  click_mouse: action("mouse.click"),
  type_text_in_field: {
    ...action("keyboard.focused_text"),
    text_input: { enter_sent: false, clear_sent: true },
  },
  open_system_search: action("keyboard.open_search"),
  get_mouse_result: action("pointer.click"),
  list_devices: {
    devices: [
      {
        device_id: id,
        name: "Software fixture",
        online: true,
        home_status: home(),
        next_step: "ready",
        frame: metadata,
        diagnostic: { fixture: true },
        capabilities: { fixture: true },
      },
    ],
  },
  get_mouse_state: {
    device_id: id,
    bridge_session_id: id,
    enabled: true,
    online: true,
    usb_connected: true,
    grant_remaining_ms: 60000,
    control_epoch: 1,
    capabilities: { "hid.mouse.absolute": true },
    absolute_supported: true,
    action_geometry_ready: true,
    screen_geometry: metadata,
    last_reported_usb_connected: true,
    descriptor_version: "fixture",
    board_boot_id: id,
  },
  stop_mouse: {
    stopped: true,
    scope: "all_owned_devices",
    board_release_confirmed: false,
    screen_sharing_stopped: false,
    stopped_devices: [id],
    failed_devices: [],
  },
  stop_session: {
    stopped: true,
    cloud_image_cleared: true,
    system_broadcast_stop_confirmed: false,
    input_control_enabled: false,
    stopped_sessions: [id],
    failed_sessions: [],
  },
  create_pairing_code: {
    pairing_code: "SYNTH-ETIC",
    expires_at: "2026-11-20T00:02:00Z",
    server_url: "https://offline.invalid",
    user_label: "Fixture",
  },
  revoke_device: { revoked: true, device_id: id, cloud_image_cleared: true },
  get_profile: { id, name: "Fixture" },
  get_control_guide: controlGuide("overview"),
  set_led: {
    state: "board_acked",
    command_id: id,
    device_id: id,
    requested_on: true,
    error: null,
    board_receipt: { fixture: true },
    verification: "phone_verified_board_ack",
  },
  get_command_result: {
    state: "board_acked",
    command_id: id,
    device_id: id,
    requested_on: true,
    board_receipt: { fixture: true },
    verification: "phone_verified_board_ack",
  },
  get_screen_metrics: {
    runtime_version: "fixture",
    evidence_type: "actual_cloud_handler_metrics",
    upload_handler: { samples: 1, p50_ms: 1, p95_ms: 1 },
    model_inference_and_voice_latency: "not_measured_by_server",
  },
};
const benchmarkText = (frame) =>
  frame.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
const png = benchmarkText(benchmarkFrame("c00")),
  jpeg = benchmarkText(benchmarkJpegFrame("c00"));
const directText = {
  read_screen_live: JSON.stringify({
    state: "available",
    runtime_version: "fixture",
    mcp_request_id: id,
    image: {
      mime_type: "image/png",
      width: 240,
      height: 519,
      format: "compact_png",
      age_ms: 100,
      view_only: true,
    },
  }),
  open_screen_benchmark:
    "Synthetic benchmark widget. No phone is connected. Image context and model latency must be verified in the real host.",
  open_benchmark_renderer_probe:
    "Renderer-only diagnostic. No image or model feedback is produced. Only the actual UI status can prove that rendering and the host handshake succeeded.",
  read_benchmark_frame: png,
  read_benchmark_pixels: png,
  read_benchmark_jpeg: jpeg,
};
const tools = mcpToolsForAudience("development");
const chars = (value) => Array.from(value).length;
const compactFor = (name, value) =>
  compactMcpSummary(
    value,
    false,
    name === "click_at" || name === "get_mouse_result",
    value.image_blocks === 1,
    name === "read_screen",
    name === "get_mouse_result",
    name === "type_text_in_field",
    undefined,
    value.after_screen ? "command" : undefined,
  );
if (mode === "--baseline") {
  writeFileSync(
    file,
    JSON.stringify(
      {
        descriptions: Object.fromEntries(tools.map((t) => [t.name, chars(t.description)])),
        fixtures,
        results: Object.fromEntries(
          Object.entries(fixtures).map(([name, value]) => [
            name,
            {
              legacy: chars(JSON.stringify(value)),
              modern: chars(compactFor(name, value)),
            },
          ]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
} else {
  const baseline = JSON.parse(readFileSync(file, "utf8"));
  const { conciseToolText } = await import("../lib/model-tool-text.ts");
  const rows = tools.map((tool) => {
    let value = baseline.fixtures[tool.name] ?? fixtures[tool.name];
    if (tool.name === "list_devices") value = fixtures.list_devices;
    if (tool.name === "get_control_guide") value = controlGuide("overview");
    const compact = value ? compactFor(tool.name, value) : undefined;
    return {
      tool: tool.name,
      description_before: baseline.descriptions[tool.name],
      description_after: chars(tool.description),
      ...(Object.hasOwn(directText, tool.name)
        ? {
            legacy: chars(directText[tool.name]),
            modern: chars(directText[tool.name]),
            legacy_after: chars(directText[tool.name]),
            modern_after: chars(directText[tool.name]),
          }
        : value
          ? {
              ...(baseline.results[tool.name] ?? {
                legacy: chars(JSON.stringify(value)),
                modern: chars(compact),
              }),
              legacy_after: chars(
                conciseToolText(tool.name, value, JSON.stringify(value), compact),
              ),
              modern_after: chars(conciseToolText(tool.name, value, compact)),
            }
          : {}),
    };
  });
  const quiet = staticScreenResult(
    { image_blocks: 1 },
    metadata,
    { capture_lower: 97000, repeat_received_at: 100000, repeat_presented_at: 100000 },
    { sharing_state: "active", last_callback_age_ms: 3000, last_callback_source_seq: 1 },
    100000,
  );
  const warned = staticScreenResult(
    { image_blocks: 1 },
    metadata,
    { capture_lower: 97000, repeat_received_at: 100000, repeat_presented_at: 100000 },
    { sharing_state: "active", last_callback_age_ms: 3000, last_callback_source_seq: 1 },
    100000,
    { id, state: "board_acked", ack: 98000 },
  );
  const staticCases = [quiet, warned].map((value) => ({
    state: value.warning ?? "static_screen",
    before: chars(JSON.stringify(value)),
    after: chars(
      conciseToolText(
        "read_screen",
        value,
        JSON.stringify(value),
        compactFor("read_screen", value),
      ),
    ),
  }));
  const oldHome = baseline.fixtures.list_devices.devices[0].home_status,
    newHome = home();
  const homeSummaries = Object.fromEntries(
    ["summary_zh", "summary_en"].map((key) => [
      key,
      { before: chars(oldHome[key]), after: chars(newHome[key]), example: newHome[key] },
    ]),
  );
  const report =
    JSON.stringify(
      {
        counting:
          "Unicode code points; JSON text includes keys and fixed synthetic IDs; no image bytes",
        rows,
        staticCases,
        homeSummaries,
      },
      null,
      2,
    ) + "\n";
  if (outputFile) writeFileSync(outputFile, report);
  else console.log(report);
}
