import {
  clickRelookMaxGapMS,
  readRecoveryDefaultMS,
  readRecoveryMaximumMS,
  visualReadAgeLimitMS,
} from "./read-policy.ts";
import { controlWorkflows } from "./control-guide.ts";
import { DRAG_CAPTURE_GAP_MS } from "./absolute-drag.ts";
import { benchmarkCaseIDs } from "./benchmark-frame.ts";
import { BENCHMARK_UI_URI } from "./benchmark-widget.ts";
import { RENDERER_PROBE_URI } from "./benchmark-renderer-probe.ts";

export const idField = { type: "string", format: "uuid" };
const stopIDField = {
  type: ["string", "null"],
  description:
    "Optional owned UUID. Omitted, null, empty or malformed IDs stop all your devices/sessions. A valid UUID selects only that owned target.",
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
  description: "Compact PNG for Spotlight focus or the original JPEG. Omit for the tool's default.",
};

export const observedWriteNames = new Set([
  "move_mouse_to",
  "move_mouse",
  "click_mouse",
  "scroll_mouse",
]);

export const observedWriteDescription =
  " By default, after confirmed phone board acknowledgement, wait up to 5000 ms independently for a same-scope after-image strictly below 2000 ms old. An explicit wait_ms retains a total action-and-image budget. observe_after=false requests the command receipt only. Input waiting still covers geometry and receipt; only confirmed input receives the independent default image window. A remote lookup already started may finish late. after_screen and observation_state distinguish pending/no-image/error from a returned image. Observation failure retains command_id/state and never resends input. Inspect the returned pixels before the next decision; movement never clicks." +
  imageDelivery;

export const scrollObservationDescription =
  " After confirmed input, the default same-call read-only after-image window is up to 5000 ms and the real image age must be strictly below 2000 ms at Sites release. An explicit wait_ms keeps the total action and image budget. observe_after=false requests the receipt only. Use settle_ms=300 when the scroll needs time to settle. A missing image retains the original command and never resends input." +
  imageDelivery;

export const allMcpTools = [
  {
    name: "open_system_search",
    title: "打开手机系统搜索",
    description:
      "Open iOS System Search for an installed app. Returns its actual after-image; inspect it (see server instructions), then type the app name without Return and select its installed icon. On uncertain input, query the original command instead of repeating.",
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
    title: "在已聚焦的输入框输入文字",
    description:
      "Type printable ASCII into the focused field: 1–60 characters when clearing (default), up to 64 when appending. Set clear_before_input=false only to append. For in-app search use submit=enter; omit it for app discovery or drafts. T6 final sends/payments must not be submitted. Inspect the returned image (see server instructions). Unknown input: query the original command.",
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
    title: "读取手机操作步骤指南",
    description:
      "Read detailed guidance for the selected workflow when needed. Returns instructions only; does not inspect the phone or grant readiness. T6 final-step handoff and hidden-screen rules apply.",
    inputSchema: object({ workflow: { type: "string", enum: controlWorkflows } }, ["workflow"]),
    annotations: annotations(true),
  },
  {
    name: "move_mouse_to",
    title: "绝对定位手机鼠标",
    description:
      "Move without clicking to a pixel target using the image’s original dimensions and orientation. Use before scrolling or for T6 final-step handoff. Inspect the returned image, not metadata (see server instructions); only then describe where the pointer is. Unknown input: query the original command.",
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
    title: "手机鼠标连接状态",
    description:
      "Check the selected phone’s current input authorization and capabilities when unknown. Returns readiness, not permission to bypass missing authorization. Do not call this before Stop.",
    inputSchema: object({ device_id: idField }),
    annotations: annotations(true),
  },
  {
    name: "move_mouse",
    title: "相对移动手机鼠标",
    description:
      "Move the current iPhone mouse pointer by signed HID relative units through the authenticated iPhone/ESP32 link. dx and dy must each be integers in [-127,127]; reject larger moves rather than silently clamping or issuing multiple commands. Requires the owner to allow this session's mouse control on the phone. Units are not screen pixels. Only board_acked confirms a phone-verified board receipt; observe a new screen to verify UI effect. Never resend an uncertain action with a new idempotency key.",
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
      "Click once at the current iPhone pointer position through the owner's active phone-approved USB mouse session. This does not locate an OCR text box or move to an absolute coordinate. Requires explicit task authorization. Keep the same idempotency key after an uncertain result and use get_mouse_result; queued is not success.",
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
    title: "滚动手机鼠标滚轮",
    description:
      "Scroll the visible content with bounded signed wheel steps. Use the current actual image to place the pointer in that content first. Inspect the returned image to determine movement and direction (see server instructions). Unknown input: query the original command.",
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
            "Optional total action and image budget. Omit for the default 2000 ms action wait and independent confirmed-scroll image window.",
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
    title: "移动并点击后观察手机",
    description:
      "T6: For irreversible final payments, orders, sends, deletions, subscription cancellations or transfers, do not call click_at. Use move_mouse_to, inspect its actual after-image, then name the button and ask the user to tap it themselves. No Return or other input may substitute; this is soft guidance, not code enforcement or C124 approval. For ordinary targets, pass original-image pixel x/y, device_id, source_frame_id, dimensions, orientation and unchanged source_point_proof when supplied. Inspect the returned image, not metadata (see server instructions). Unknown input: query the original command; never replay.",
    inputSchema: object(
      {
        device_id: idField,
        source_frame_id: {
          ...idField,
          description: "Exact JPEG frame ID of the image you selected from. Requires device_id.",
        },
        source_point_proof: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Exact proof from this same released visual read. Requires device_id and source_frame_id. If omitted, the same frame is looked up automatically; never invent or modify the proof.",
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
            "Optional total budget for input and after-image. Omit for the default independent paired after-image window.",
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
    title: "读取手机鼠标操作结果",
    description:
      "Recover an original command without repeating input. Use command_id alone, or the original click_at_idempotency_key with device_id if IDs were lost. Pending, missing and uncertain results do not authorize replay. include_after_screen requests a read-only after-image when supported; inspect actual image blocks, not metadata (see server instructions). Use after_command_min_gap_ms only as its parameter describes.",
    inputSchema: object({
      image_format: searchFocusFormat,
      command_id: {
        type: "string",
        minLength: 1,
        maxLength: 170,
        description:
          "Original command ID. When provided, omit device_id and click_at_idempotency_key.",
      },
      device_id: {
        ...idField,
        description:
          "Only with click_at_idempotency_key for receipt lookup without an image. Omit when using command_id.",
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
          "Only with include_after_screen and the original confirmed click, open_system_search or type_text_in_field command ID. Round the previous after_command.lower_gap_ms up to require a newer capture, within 0–5000 ms. The read-only observation waits up to 5000 ms and returns images strictly younger than 2000 ms; it never resubmits input.",
      },
    }),
    annotations: annotations(true),
  },
  {
    name: "drag_at",
    title: "按住并拖拽后观察手机",
    description:
      "Drag a visible object or handle between original-image pixel endpoints using the exact source and geometry. Normally omit duration_ms for 350 ms; deliberate durations are 120–1000 ms. No calibration or relative fallback. Inspect the returned image (see server instructions). Unknown input: query the original command.",
    inputSchema: object(
      {
        device_id: idField,
        source_frame_id: idField,
        from_x: {
          type: "number",
          minimum: 0,
          description:
            "Start x in original image pixels. Convert a normalized fraction as x*(image_width-1).",
        },
        from_y: {
          type: "number",
          minimum: 0,
          description:
            "Start y in original image pixels. Convert a normalized fraction as y*(image_height-1).",
        },
        to_x: {
          type: "number",
          minimum: 0,
          description: "End x in original image pixels; use the same coordinate space as from_x.",
        },
        to_y: {
          type: "number",
          minimum: 0,
          description: "End y in original image pixels; use the same coordinate space as from_y.",
        },
        image_width: { type: "integer", minimum: 2, maximum: 8192 },
        image_height: { type: "integer", minimum: 2, maximum: 8192 },
        orientation_epoch: { type: "integer", minimum: 0 },
        duration_ms: {
          type: "integer",
          minimum: 120,
          maximum: 1000,
          default: 350,
          description:
            "Normally omit for the default 350 ms. When deliberately needed, choose 120–1000 ms.",
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
            "Optional total action and image budget. Omit for the default 6000 ms action wait and independent confirmed-drag image window.",
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
    title: "停止手机鼠标控制",
    description:
      "Stop input immediately without a readiness lookup. Omit device_id to stop all your devices, or select one owned device. Null, empty or malformed IDs also stop all your devices and report the fallback. Returns cloud stop state; physical release is separately confirmed. Screen sharing may continue. Never automatically re-enable.",
    inputSchema: object({ device_id: stopIDField }),
    annotations: annotations(false),
  },
  {
    name: "read_screen",
    title: "立即读取手机画面",
    description:
      "Inspect actual image blocks in content_items or MCP content; structuredContent metadata is not a visible image. If needed display image(block) with host image support. Read the current shared screen when no usable action image exists. Returns actual image blocks and their source/geometry. Inspect the returned image, not metadata (see server instructions). Reuse action after-images for subsequent decisions; never act on unavailable pixels.",
    inputSchema: object({
      device_id: idField,
      include_read_timing: {
        type: "boolean",
        default: false,
        description:
          "Opt in to bounded database timing and server frame-age timestamps for diagnostics. These precede response serialization and do not measure host image receipt.",
      },
      if_unchanged_since: {
        ...idField,
        description: "An earlier actual image_ref still visible in this conversation.",
      },
      after_command_id: idField,
      after_command_min_gap_ms: {
        type: "integer",
        minimum: 0,
        maximum: 2000,
        default: 0,
        description:
          "Require actual capture strictly after the confirmed command phone timestamp plus this delay; requires after_command_id.",
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
      "Read one fresh real phone image through SaySo for visual description or image-delivery diagnosis. Default compact_png; compact_jpeg uses the same preview dimensions, and original_jpeg sends the original capture bytes in the same small response. These are view-only pictures. Use read_screen to obtain exact visual action evidence. The released image is under 2 seconds old. If you cannot see the actual pixels, say so." +
      imageDelivery,
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
      "Set the ESP32 onboard LED on or off through this user's iPhone and USB. Requires the user to enable foreground cloud LED diagnostics in SaySo and keep the app open. Only queued is not success; report a board_acked receipt or the actual pending/error state. Does not perform HID or use Mac/device developer controls. Never retry with a new idempotency key after an uncertain outcome.",
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
      "Read the authenticated user's LED command state and phone-verified board receipt. Queued, claimed and executing are not confirmed physical results. Do not resend an uncertain command.",
    inputSchema: object({ command_id: idField }, ["command_id"]),
    annotations: annotations(true),
  },
  {
    name: "get_profile",
    title: "当前 SaySo 授权身份",
    description:
      "Return the stable identity represented by this Site's authenticated OAuth connection.",
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
    title: "生成手机配对码",
    description:
      "Create a short-lived code for pairing the SaySo phone app with your private service. Enter it in SaySo. This does not pair the C124 accessory or authorize control.",
    inputSchema: object({ label: { type: "string", minLength: 1, maxLength: 120 } }, ["label"]),
    annotations: annotations(false),
  },
  {
    name: "list_devices",
    title: "查看我的共享设备",
    description:
      "List your phones and active sharing sessions. Returns readiness metadata, not an image or credentials.",
    inputSchema: object({}),
    annotations: annotations(true),
  },
  {
    name: "stop_session",
    title: "停止共享会话并清图",
    description:
      "Stop sharing sessions and clear their cloud screen data without a readiness lookup. Omit bridge_session_id to stop all your ongoing sessions, or select one owned session. Null, empty or malformed IDs also use all your sessions and report the fallback. Returns stopped and failed session IDs. iOS screen-sharing termination must be confirmed separately; chat images cannot be erased here.",
    inputSchema: object({ bridge_session_id: stopIDField }),
    annotations: annotations(false, true),
  },
  {
    name: "revoke_device",
    title: "撤销手机配对",
    description:
      "Revoke the selected owned device, stop its cloud session and remove its commands, sessions and cloud images. Requires device_id. Existing chat content is unaffected.",
    inputSchema: object({ device_id: idField }, ["device_id"]),
    annotations: annotations(false, true),
  },
  {
    name: "get_screen_metrics",
    title: "查看屏幕链路实测指标",
    description:
      "Read bounded metadata-only timings for this user's phone. Upload handler and MCP image-handler durations are separate; they do not measure internal model inference or voice playback.",
    inputSchema: object({ device_id: idField }, ["device_id"]),
    annotations: annotations(true),
  },
  {
    name: "open_screen_benchmark",
    title: "打开合成看屏预取基准",
    description:
      "Open a clearly labelled synthetic-image benchmark widget only when explicitly testing screen-feedback performance without a phone. The widget prefetches fixture pixels and probes the host's model-context/sampling capabilities. It never reads a phone or controls a device. It is not evidence that the existing Live client meets a latency target.",
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
      "Use only for an explicitly requested synthetic screen-feedback benchmark without a phone. Returns one actual fixture image without a UI template. Defaults to mixed PNG. Optional image_format and response_layout select the carrier. With match_payload_size=true, the full PNG has the same image bytes count as the corresponding JPEG without changing pixels. Optional preview=true returns a 240x427 PNG with truthful native-size metadata. Analyze only those pixels and answer the requested brief visual task. This is not an iPhone screenshot or real-time screen capture; it never calls a model, sends a device command, or writes product data. Never use this to answer questions about the user's real phone." +
      imageDelivery,
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
            "Full-size only. Match PNG image bytes to the corresponding JPEG length without modifying pixel data.",
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
      "Use only to diagnose the synthetic benchmark UI failing to load. Opens a minimal text-only MCP Apps renderer and handshake probe, with no image, model, microphone, phone, device storage or command. Not a performance success sample.",
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
      "Use only for an explicitly requested synthetic-image performance benchmark without a phone. Returns the actual fixture PNG plus provenance text using content blocks only, without structuredContent or a UI template, to test image delivery. Analyze those pixels and answer briefly. Never reads or controls a phone, writes device data, or calls a model. Never use this for the user's real screen." +
      imageDelivery,
    inputSchema: object({ case_id: { type: "string", enum: benchmarkCaseIDs } }, ["case_id"]),
    annotations: annotations(true),
  },
  {
    name: "read_benchmark_jpeg",
    title: "读取 JPEG 合成基准图片",
    description:
      "Use only for an explicitly requested synthetic image-delivery benchmark without a phone. Returns actual correctly encoded JPEG image content blocks and provenance text, without structuredContent or a UI template. This matches the real app's JPEG format but is strictly generated fixture data. Analyze the returned image and answer briefly. No device access, cloud device writes or model API calls. Never use it for the user's real screen." +
      imageDelivery,
    inputSchema: object({ case_id: { type: "string", enum: benchmarkCaseIDs } }, ["case_id"]),
    annotations: annotations(true),
  },
].map((tool) =>
  observedWriteNames.has(tool.name)
    ? {
        ...tool,
        description: ["move_mouse_to", "scroll_mouse"].includes(tool.name)
          ? tool.description
          : tool.description + observedWriteDescription,
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
                "Minimum actual capture gap after phone board acknowledgement; UI effect still requires inspecting the image.",
            },
          },
        },
      }
    : tool,
);

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
