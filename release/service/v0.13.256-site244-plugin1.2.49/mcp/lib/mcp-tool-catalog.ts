import { publicToolRisk } from "./tool-risk-policy.ts";
import {
  clickRelookMaxGapMS,
  readRecoveryDefaultMS,
  readRecoveryMaximumMS,
  visualReadAgeLimitMS,
} from "./read-policy.ts";
import { controlWorkflows } from "./control-guide.ts";
import { DRAG_CAPTURE_GAP_MS } from "./absolute-drag.ts";
import { benchmarkCaseIDs, BENCHMARK_UI_URI, RENDERER_PROBE_URI } from "./benchmark-metadata.ts";

export const idField = { type: "string", format: "uuid" };
const stopIDField = {
  type: ["string", "null"],
  description:
    "Optional owned UUID. Omitted, null, empty or malformed IDs stop all your devices/sessions. A matching owned UUID selects that target; an unmatched ID also falls back to all owned targets.",
};

export const liveMaxAge = {
  type: "integer",
  minimum: 100,
  maximum: visualReadAgeLimitMS,
  default: visualReadAgeLimitMS,
};

export const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const annotations = (readOnly: boolean, destructive = false) => ({
  readOnlyHint: readOnly,
  destructiveHint: destructive,
  idempotentHint: readOnly,
  openWorldHint: false,
});

export const imageDelivery =
  "Inspect actual type=image blocks in content_items and MCP content, including nested results. structuredContent metadata alone is not a visible image. If pixels are not visible, decode and display the original block with host image support; code-mode uses image(block). Do not let an empty array hide populated image content. Preserve mimeType/mime_type and Base64 data. Stop if the host cannot display the image.";

export const liveDisplayFormats = ["compact_png", "compact_jpeg", "original_jpeg"] as const;

export const searchFocusFormats = ["compact_png", "original_jpeg"] as const;

export const searchFocusFormat = {
  type: "string",
  enum: searchFocusFormats,
  description:
    "Compact PNG for Spotlight focus or the original JPEG; the format is tool-default when absent.",
};

export const observedWriteNames = new Set([
  "move_mouse_to",
  "move_mouse",
  "click_mouse",
  "scroll_mouse",
]);

export const allMcpTools = [
  {
    name: "open_system_search",
    title: "Open system search / 打开系统搜索",
    description:
      "Opens installed-app System Search and returns the command receipt and, by default, an after-image. No source frame is required. The receipt includes the original command ID.",
    inputSchema: object(
      {
        device_id: idField,
        idempotency_key: { type: "string", minLength: 1, maxLength: 120 },
        image_format: searchFocusFormat,
        settle_ms: { type: "integer", minimum: 0, maximum: 2000 },
        wait_ms: { type: "integer", minimum: 0, maximum: 10000 },
        observe_after: { type: "boolean", default: true },
      },
      ["device_id", "idempotency_key"],
    ),
    annotations: {
      ...annotations(false),
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "type_text_in_field",
    title: "Type in focused field / 输入文字",
    description:
      "Enters printable ASCII in the focused field. Default clearing supports single-line text of 1–60 characters; intentional append supports 1–64 characters, including multiline editors. Optional submit=enter adds Return. Returns the original command receipt and, by default, an after-image.",
    inputSchema: object(
      {
        device_id: idField,
        text: { type: "string", minLength: 1, maxLength: 64 },
        idempotency_key: { type: "string", minLength: 1, maxLength: 120 },
        clear_before_input: { type: "boolean", default: true },
        submit: { type: "string", enum: ["enter"] },
        settle_ms: { type: "integer", minimum: 0, maximum: 2000 },
        wait_ms: { type: "integer", minimum: 0, maximum: 12000 },
        observe_after: { type: "boolean", default: true },
      },
      ["device_id", "text", "idempotency_key"],
    ),
    annotations: {
      ...annotations(false),
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "get_control_guide",
    title: "Get usage guide / 使用说明",
    description:
      "Returns instructions for the selected workflow, including input, image handling, stopping and final-step handoff. No phone inspection or control enablement occurs.",
    inputSchema: object({ workflow: { type: "string", enum: controlWorkflows } }, ["workflow"]),
    annotations: annotations(true),
  },
  {
    name: "move_mouse_to",
    title: "Move pointer / 移动指针",
    description:
      "Positions the pointer without clicking, using original dimensions and orientation. Returns the command receipt and, by default, an after-image. The default confirmed-input image window is 5000 ms, separate from the action wait.",
    inputSchema: object(
      {
        device_id: idField,
        x: { type: "number", minimum: 0 },
        y: { type: "number", minimum: 0 },
        image_width: { type: "integer", minimum: 2, maximum: 8192 },
        image_height: { type: "integer", minimum: 2, maximum: 8192 },
        orientation_epoch: { type: "integer", minimum: 0 },
        idempotency_key: { type: "string", minLength: 1, maxLength: 120 },
        wait_ms: { type: "integer", minimum: 0, maximum: 3000, default: 2000 },
      },
      ["x", "y", "image_width", "image_height", "orientation_epoch", "idempotency_key"],
    ),
    annotations: {
      ...annotations(false),
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "get_mouse_state",
    title: "Check tapping status / 查看帮你点状态",
    description:
      "Returns the selected phone’s current input authorization, readiness and capabilities. This lookup does not enable control.",
    inputSchema: object({ device_id: idField }),
    annotations: annotations(true),
  },
  {
    name: "move_mouse",
    title: "相对移动手机鼠标",
    description:
      "Moves the pointer by signed HID dx/dy integers from -127 to 127, rather than pixels, within a phone-enabled control session. Returns the original command receipt and, by default, an after-image. Only board_acked confirms board receipt.",
    inputSchema: object(
      {
        device_id: idField,
        dx: { type: "integer", minimum: -127, maximum: 127 },
        dy: { type: "integer", minimum: -127, maximum: 127 },
        idempotency_key: { type: "string", minLength: 1, maxLength: 120 },
        wait_ms: { type: "integer", minimum: 0, maximum: 3000, default: 2000 },
      },
      ["dx", "dy", "idempotency_key"],
    ),
    annotations: {
      ...annotations(false),
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "click_mouse",
    title: "点击手机鼠标左键",
    description:
      "Clicks the left button once at the current pointer position within a phone-enabled control session. No positioning occurs. Returns the original command receipt and, by default, an after-image. Queued state is separate from board acknowledgement and visible app effect.",
    inputSchema: object(
      {
        device_id: idField,
        button: { type: "string", enum: ["left"], default: "left" },
        idempotency_key: { type: "string", minLength: 1, maxLength: 120 },
        wait_ms: { type: "integer", minimum: 0, maximum: 3000, default: 2000 },
      },
      ["idempotency_key"],
    ),
    annotations: {
      ...annotations(false, true),
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "scroll_mouse",
    title: "Scroll content / 滚动内容",
    description:
      "Sends bounded wheel steps at the current pointer position. Returns the original command receipt and, by default, an after-image. The default confirmed-scroll image window is 5000 ms, separate from the 2000 ms action wait; wait_ms specifies a total budget. ACTION_NO_SCREEN_CHANGE indicates a possible missed action.",
    inputSchema: object(
      {
        device_id: idField,
        steps: { type: "integer", minimum: -8, maximum: 8 },
        idempotency_key: { type: "string", minLength: 1, maxLength: 120 },
        wait_ms: {
          type: "integer",
          minimum: 0,
          maximum: 3000,
          description:
            "Optional total action and image budget. The default is a 2000 ms action wait with an independent confirmed-scroll image window.",
        },
      },
      ["steps", "idempotency_key"],
    ),
    annotations: {
      ...annotations(false),
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "click_at",
    title: "Click target / 点击目标",
    description:
      "Clicks a target at original-image x/y using device_id, source_frame_id, image dimensions, orientation and an optional same-frame source_point_proof. Returns the original command receipt and, by default, an after-image. SCREEN_CHANGED_SINCE_IMAGE indicates a changed source scene; ACTION_NO_SCREEN_CHANGE indicates a possible missed action. Workflow rules are in get_control_guide.",
    inputSchema: object(
      {
        device_id: idField,
        source_frame_id: {
          ...idField,
          description: "Exact JPEG frame ID of the selected source image, paired with device_id.",
        },
        source_point_proof: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Unmodified proof from the same released visual read, paired with device_id and source_frame_id. When absent, the server looks up that same frame automatically.",
        },
        x: { type: "number", minimum: 0 },
        y: { type: "number", minimum: 0 },
        image_width: { type: "integer", minimum: 1, maximum: 8192 },
        image_height: { type: "integer", minimum: 1, maximum: 8192 },
        orientation_epoch: { type: "integer", minimum: 0 },
        idempotency_key: { type: "string", minLength: 1, maxLength: 120 },
        settle_ms: { type: "integer", minimum: 0, maximum: 2000, default: 300 },
        wait_ms: {
          type: "integer",
          minimum: 0,
          maximum: 10000,
          description:
            "Optional total budget for input and after-image. The default uses an independent paired after-image window.",
        },
        observe_after: { type: "boolean", default: true },
      },
      [
        "x",
        "y",
        "image_width",
        "image_height",
        "orientation_epoch",
        "idempotency_key",
        "device_id",
        "source_frame_id",
      ],
    ),
    annotations: {
      ...annotations(false, true),
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "get_mouse_result",
    title: "Check original result / 查看原操作结果",
    description:
      "Returns an original command’s state without resubmitting input. Lookup accepts command_id alone or the original click_at_idempotency_key with device_id. Optional include_after_screen returns a read-only after-image for supported commands. Pending, missing and uncertain states remain distinct from confirmed board receipt and visible app effect.",
    inputSchema: object({
      image_format: searchFocusFormat,
      command_id: {
        type: "string",
        minLength: 1,
        maxLength: 170,
        description:
          "Original command ID; mutually exclusive with device_id and click_at_idempotency_key.",
      },
      device_id: {
        ...idField,
        description:
          "Device paired with click_at_idempotency_key for receipt lookup without an image; mutually exclusive with command_id.",
      },
      click_at_idempotency_key: {
        type: "string",
        minLength: 1,
        maxLength: 120,
      },
      include_after_screen: { type: "boolean", default: false },
      after_command_min_gap_ms: {
        type: "integer",
        minimum: 0,
        maximum: clickRelookMaxGapMS,
        description:
          "Minimum newer-capture gap, within 0–5000 ms, paired with include_after_screen and an original confirmed click, open_system_search or type_text_in_field command ID. The ceiling of the previous after_command.lower_gap_ms identifies a newer capture. Observation waits up to 5000 ms for an image below 2000 ms old; ACTION_NO_SCREEN_CHANGE is a possible-failure warning after 1500 ms without a callback. No input is resubmitted.",
      },
    }),
    annotations: annotations(true),
  },
  {
    name: "drag_at",
    title: "Drag target / 拖动物件",
    description:
      "Drags a visible object or handle between original-image endpoints with the source frame’s geometry. Uses direct absolute HID with no calibration or relative fallback. Duration is 350 ms by default, within 120–1000 ms. Returns the original command receipt and, by default, an after-image.",
    inputSchema: object(
      {
        device_id: idField,
        source_frame_id: idField,
        from_x: {
          type: "number",
          minimum: 0,
          description: "Start x in original image pixels; normalized x maps to x*(image_width-1).",
        },
        from_y: {
          type: "number",
          minimum: 0,
          description: "Start y in original image pixels; normalized y maps to y*(image_height-1).",
        },
        to_x: {
          type: "number",
          minimum: 0,
          description: "End x in original image pixels, in the same coordinate space as from_x.",
        },
        to_y: {
          type: "number",
          minimum: 0,
          description: "End y in original image pixels, in the same coordinate space as from_y.",
        },
        image_width: { type: "integer", minimum: 2, maximum: 8192 },
        image_height: { type: "integer", minimum: 2, maximum: 8192 },
        orientation_epoch: { type: "integer", minimum: 0 },
        duration_ms: {
          type: "integer",
          minimum: 120,
          maximum: 1000,
          default: 350,
          description: "Drag duration, 350 ms by default, within 120–1000 ms.",
        },
        settle_ms: {
          type: "integer",
          minimum: 0,
          maximum: 2000,
          default: DRAG_CAPTURE_GAP_MS,
        },
        wait_ms: {
          type: "integer",
          minimum: 0,
          maximum: 10000,
          description:
            "Optional total action and image budget. The default is a 6000 ms action wait with an independent confirmed-drag image window.",
        },
        observe_after: { type: "boolean", default: true },
        idempotency_key: { type: "string", minLength: 1, maxLength: 120 },
      },
      [
        "device_id",
        "source_frame_id",
        "from_x",
        "from_y",
        "to_x",
        "to_y",
        "image_width",
        "image_height",
        "orientation_epoch",
        "idempotency_key",
      ],
    ),
    annotations: {
      ...annotations(false, true),
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "stop_mouse",
    title: "Stop tapping / 停止帮你点",
    description:
      "Stops control for owned devices and sessions. An omitted, invalid or unmatched device_id selects all owned targets and reports the fallback. Returns cloud stop results and available board-release state. Cloud stop and physical release are separate; screen sharing may continue.",
    inputSchema: object({ device_id: stopIDField }),
    annotations: annotations(false),
  },
  {
    name: "read_screen",
    title: "Read shared screen / 读取共享画面",
    description:
      "Returns a shared screen image and its source metadata in content_items or MCP content. structuredContent metadata alone contains no visible pixels. static_screen.proven with usable_for_input=true identifies an unchanged input-capable source with its original capture age. SCREEN_CHANGED_SINCE_IMAGE identifies a changed scene; ACTION_NO_SCREEN_CHANGE marks a possible missed action and a non-targeting warning image. wait_for_new_ms defaults to 15000; 5000 is within its range.",
    inputSchema: object({
      device_id: idField,
      include_read_timing: {
        type: "boolean",
        default: false,
        description:
          "Optional bounded database timing and server frame-age timestamps for diagnostics, measured before response serialization rather than host image receipt.",
      },
      if_unchanged_since: {
        ...idField,
        description: "An earlier actual image_ref visible in the current conversation.",
      },
      after_command_id: idField,
      after_command_min_gap_ms: {
        type: "integer",
        minimum: 0,
        maximum: 2000,
        default: 0,
        description:
          "Minimum new-capture delay after the confirmed after_command_id. After 1500 ms, a proven no-change fallback carries an explicit warning, separate from confirmed app effect. 动作后无变化会明确警告。",
      },
      wait_for_new_ms: {
        type: "integer",
        minimum: 0,
        maximum: readRecoveryMaximumMS,
        default: readRecoveryDefaultMS,
      },
      max_age_ms: liveMaxAge,
    }),
    annotations: annotations(true),
  },
  {
    name: "read_screen_live",
    title: "读取供 Live 查看的一张手机截图",
    description:
      "Returns one fresh, view-only shared phone image for visual description or image-delivery diagnosis. Default compact_png and optional compact_jpeg share preview dimensions; original_jpeg contains original capture bytes. Released image age is below 2000 ms. No action evidence is issued by this tool.",
    inputSchema: object({
      device_id: idField,
      image_format: {
        type: "string",
        enum: liveDisplayFormats,
        default: "compact_png",
      },
      wait_for_new_ms: {
        type: "integer",
        minimum: 0,
        maximum: 5000,
        default: 1500,
      },
      max_age_ms: liveMaxAge,
    }),
    annotations: annotations(true),
  },
  {
    name: "set_led",
    title: "开关 ESP32 板载灯",
    description:
      "Sets the ESP32 board LED in a phone-enabled foreground control session. Returns the original command ID and receipt state. board_acked confirms the board receipt; queued, pending and error states are separate outcomes.",
    inputSchema: object(
      {
        device_id: idField,
        on: { type: "boolean" },
        idempotency_key: { type: "string", minLength: 1, maxLength: 120 },
        wait_ms: { type: "integer", minimum: 0, maximum: 5000, default: 5000 },
      },
      ["on"],
    ),
    annotations: annotations(false),
  },
  {
    name: "get_command_result",
    title: "读取云端灯控执行回执",
    description:
      "Returns the authenticated user’s LED command state and phone-verified board receipt. Queued, claimed and executing states are separate from confirmed physical results. This lookup does not resubmit input.",
    inputSchema: object({ command_id: idField }, ["command_id"]),
    annotations: annotations(true),
  },
  {
    name: "get_profile",
    title: "当前 SaySo 授权身份",
    description:
      "Returns the stable identity represented by this Site’s authenticated OAuth connection, including its ID and name.",
    inputSchema: object({}),
    outputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        name: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: annotations(true),
    _meta: { "openai/profile": true },
  },
  {
    name: "create_pairing_code",
    title: "Create phone pairing code / 创建手机配对码",
    description:
      "Creates a short-lived code for the SaySo phone app’s service-pairing field. This code does not pair the C124 accessory or enable control.",
    inputSchema: object({ label: { type: "string", minLength: 1, maxLength: 120 } }, ["label"]),
    annotations: annotations(false),
  },
  {
    name: "list_devices",
    title: "List my phones / 我的手机",
    description:
      "Returns owned phones with home_status for the four SaySo home rows. next_step is a legacy hint. The result includes current screen-sharing and control state.",
    inputSchema: object({}),
    annotations: annotations(true),
  },
  {
    name: "stop_session",
    title: "Stop sharing and clear images / 停止共享并清图",
    description:
      "Stops owned cloud sharing sessions and clears their cloud screen data. An omitted, invalid, unmatched or old stopped bridge_session_id selects ongoing owned sessions and reports the fallback. Returns stopped and failed session IDs. Cloud completion is separate from iOS screen-sharing termination; existing chat images are unaffected.",
    inputSchema: object({ bridge_session_id: stopIDField }),
    annotations: annotations(false, true),
  },
  {
    name: "revoke_device",
    title: "Unpair phone / 解除手机配对",
    description:
      "Revokes the selected owned device, stops its cloud session and removes its commands, sessions and cloud images. device_id identifies the device. Existing chat content is unaffected.",
    inputSchema: object({ device_id: idField }, ["device_id"]),
    annotations: annotations(false, true),
  },
  {
    name: "get_screen_metrics",
    title: "查看屏幕链路实测指标",
    description:
      "Returns bounded metadata-only timings for the authenticated user’s phone. Upload-handler and MCP image-handler durations are separate; neither measures internal model inference or voice playback.",
    inputSchema: object({ device_id: idField }, ["device_id"]),
    annotations: annotations(true),
  },
  {
    name: "open_screen_benchmark",
    title: "打开合成看屏预取基准",
    description:
      "Opens a labelled synthetic-image benchmark widget. It prefetches fixture pixels and probes host model-context and sampling capabilities, without reading a phone or controlling a device. Synthetic benchmark results are separate from real Live-client latency measurements.",
    inputSchema: object({
      case_id: { type: "string", enum: benchmarkCaseIDs, default: "c00" },
      preview: { type: "boolean", default: false },
    }),
    annotations: annotations(true),
    _meta: {
      ui: { resourceUri: BENCHMARK_UI_URI },
      "openai/outputTemplate": BENCHMARK_UI_URI,
    },
  },
  {
    name: "read_benchmark_frame",
    title: "读取合成基准图片",
    description:
      "Returns one synthetic fixture image without a UI template. Default carrier is mixed PNG; image_format and response_layout select other carriers. match_payload_size aligns full PNG byte count with JPEG while preserving pixels. preview returns a 240×427 PNG with original-size metadata. No phone capture, device command, product-data write or model call occurs.",
    inputSchema: object(
      {
        case_id: { type: "string", enum: benchmarkCaseIDs },
        preview: { type: "boolean", default: false },
        image_format: { type: "string", enum: ["png", "jpeg"], default: "png" },
        response_layout: {
          type: "string",
          enum: ["mixed", "content_only"],
          default: "mixed",
        },
        match_payload_size: {
          type: "boolean",
          default: false,
          description:
            "Full-size PNG byte count aligned with the corresponding JPEG length, with unchanged pixel data.",
        },
      },
      ["case_id"],
    ),
    annotations: annotations(true),
    _meta: {
      ui: { visibility: ["model", "app"] },
      "openai/widgetAccessible": true,
    },
  },
  {
    name: "open_benchmark_renderer_probe",
    title: "SaySo 组件加载诊断",
    description:
      "Opens a minimal text-only MCP Apps renderer and handshake probe for synthetic benchmark UI loading diagnosis. No image, model, microphone, phone, device storage or command is involved. The probe result is separate from performance measurements.",
    inputSchema: object({}),
    annotations: annotations(true),
    _meta: {
      ui: { resourceUri: RENDERER_PROBE_URI },
      "openai/ui": { entrypoints: [{ type: "thread" }] },
    },
  },
  {
    name: "read_benchmark_pixels",
    title: "读取合成基准图片内容",
    description:
      "Returns a synthetic fixture PNG and provenance text in content blocks, without structuredContent or a UI template, for image-delivery measurements. No phone access, device-data write or model call occurs.",
    inputSchema: object({ case_id: { type: "string", enum: benchmarkCaseIDs } }, ["case_id"]),
    annotations: annotations(true),
  },
  {
    name: "read_benchmark_jpeg",
    title: "读取 JPEG 合成基准图片",
    description:
      "Returns an encoded synthetic fixture JPEG and provenance text in content blocks, without structuredContent or a UI template. The format matches phone JPEG capture; the pixels are generated fixture data. No phone access, device-data write or model API call occurs.",
    inputSchema: object({ case_id: { type: "string", enum: benchmarkCaseIDs } }, ["case_id"]),
    annotations: annotations(true),
  },
]
  .map((tool) =>
    observedWriteNames.has(tool.name)
      ? {
          ...tool,
          inputSchema: {
            ...tool.inputSchema,
            properties: {
              ...tool.inputSchema.properties,
              observe_after: { type: "boolean", default: true },
              settle_ms: {
                type: "integer",
                minimum: 0,
                maximum: 2000,
                default: 0,
                description:
                  "Minimum actual capture gap after phone board acknowledgement; board receipt and visible UI effect are separate.",
              },
            },
          },
        }
      : tool,
  )
  .map((tool) => ({ ...tool, annotations: publicToolRisk(tool.name) ?? tool.annotations }));

export const publicToolNames = new Set([
  "list_devices",
  "create_pairing_code",
  "revoke_device",
  "read_screen",
  "get_mouse_state",
  "get_control_guide",
  "open_system_search",
  "click_at",
  "move_mouse_to",
  "scroll_mouse",
  "drag_at",
  "type_text_in_field",
  "get_mouse_result",
  "stop_mouse",
  "stop_session",
]);
export function mcpToolsForAudience(audience: "public" | "development" = "public") {
  return audience === "development"
    ? allMcpTools
    : allMcpTools.filter((tool) => publicToolNames.has(tool.name));
}
