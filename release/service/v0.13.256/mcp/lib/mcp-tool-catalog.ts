import { stopInstruction } from "./stop-guidance.ts";
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

const stopSensitiveToolNames = new Set([
  "open_system_search",
  "type_text_in_field",
  "move_mouse_to",
  "move_mouse",
  "click_mouse",
  "scroll_mouse",
  "click_at",
  "drag_at",
  "set_led",
  "stop_mouse",
]);

export const allMcpTools = [
  {
    name: "open_system_search",
    title: "Open system search / 打开系统搜索",
    description:
      "Open installed-app System Search; inspect after-image, type app name without Return, select installed icon. Uncertain input: query original ID; never replay.",
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
      "ASCII clear(default,1 line):1–60;append(multiline):64. Search:enter;T6 handoff. Garbled:stop;ask ABC;no retype. No cards/passwords/OTPs/CVV/identity numbers;park the pointer;卡号/密码/验证码/身份证号:这一项请你自己输入。System app search:pinyin without asking;never transliterate elsewhere. ID.",
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
      "Read detailed guidance for the selected workflow when needed. Returns instructions only; does not inspect the phone or grant readiness. T6 final-step handoff and hidden-screen rules apply.",
    inputSchema: object({ workflow: { type: "string", enum: controlWorkflows } }, ["workflow"]),
    annotations: annotations(true),
  },
  {
    name: "move_mouse_to",
    title: "Move pointer / 移动指针",
    description:
      "Move without clicking using original dimensions and orientation. For T6 park only; inspect actual after-image before describing pointer location. Unknown input: query original ID.",
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
      "Check the selected phone’s current input authorization and capabilities when unknown. Returns readiness, not permission to bypass missing authorization. Do not call this before Stop.",
    inputSchema: object({ device_id: idField }),
    annotations: annotations(true),
  },
  {
    name: "move_mouse",
    title: "相对移动手机鼠标",
    description:
      "Move by signed HID dx/dy integers [-127,127], not pixels; never clamp or split. Requires phone-approved control. Only board_acked confirms receipt; inspect after-image. Uncertain: original ID/key, never replay.",
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
      "Click current pointer once in the phone-approved session for the authorized task; no positioning. No T6 final steps. Inspect after-image; queued is not success. Uncertain: original ID/key, never replay.",
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
      "Bounded wheel steps; first position pointer inside visible content. Inspect actual after-image for direction and movement. Uncertain: original ID/key, never replay.",
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
    title: "Click target / 点击目标",
    description:
      "T6: For final payments, orders, sends, deletions, subscription cancellations or transfers, do not call click_at; park with move_mouse_to, inspect its after-image, name the button and ask the user to tap. No Return/input substitute; soft guidance, not code enforcement. Ordinary targets: original-image x/y, device_id, source_frame_id, dimensions, orientation and unchanged source_point_proof if supplied. Inspect actual image. Unknown: original ID, never replay.",
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
    title: "Check original result / 查看原操作结果",
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
    title: "Drag target / 拖动物件",
    description:
      "Drag visible object/handle using original-image endpoints and exact source geometry. Default 350ms; deliberate 120?1000ms. No calibration/relative fallback. Inspect after-image. Uncertain: original ID, never replay.",
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
    title: "Stop tapping / 停止帮你点",
    description:
      "Stop immediately; no readiness lookup. Omit device_id for all owned devices; invalid/unmatched IDs also stop all and report fallback. Cloud stop is separate from physical release; sharing may continue.",
    inputSchema: object({ device_id: stopIDField }),
    annotations: annotations(false),
  },
  {
    name: "read_screen",
    title: "Read shared screen / 读取共享画面",
    description:
      "Inspect type=image blocks in content_items or MCP content; structuredContent metadata is not the image. Display image(block) with host support if needed. Read the shared screen only when no usable action image exists; reuse action after-images. Returns actual pixels and source geometry. Voice requests may set wait_for_new_ms=5000 to avoid the default wait of up to 15000 ms.",
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
      "Explicit LED diagnostic only; requires phone-approved foreground session. Report board_acked or pending/error; queued is not success. Uncertain: original ID/key, never replay.",
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
    title: "Create phone pairing code / 创建手机配对码",
    description:
      "Create a short-lived code for pairing the SaySo phone app with your private service. Enter it in SaySo. This does not pair the C124 accessory or authorize control.",
    inputSchema: object({ label: { type: "string", minLength: 1, maxLength: 120 } }, ["label"]),
    annotations: annotations(false),
  },
  {
    name: "list_devices",
    title: "List my phones / 我的手机",
    description:
      "List your phones and active sharing sessions. Returns readiness metadata, not an image or credentials. When next_step is non-null, explain that step in the user's language without guessing screen contents. next_step 不为空时，用用户的语言告诉用户下一步，不要猜测画面内容。",
    inputSchema: object({}),
    annotations: annotations(true),
  },
  {
    name: "stop_session",
    title: "Stop sharing and clear images / 停止共享并清图",
    description:
      "Stop sharing sessions and clear their cloud screen data without a readiness lookup. Omit bridge_session_id to stop all your ongoing sessions, or select one owned session. Invalid or unmatched IDs also use all your sessions and report the fallback. An old stopped session ID also stops ongoing sessions. Returns stopped and failed session IDs. iOS screen-sharing termination must be confirmed separately; chat images cannot be erased here.",
    inputSchema: object({ bridge_session_id: stopIDField }),
    annotations: annotations(false, true),
  },
  {
    name: "revoke_device",
    title: "Unpair phone / 解除手机配对",
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
]
  .map((tool) =>
    observedWriteNames.has(tool.name)
      ? {
          ...tool,
          description: ["move_mouse_to", "scroll_mouse", "move_mouse", "click_mouse"].includes(
            tool.name,
          )
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
  )
  .map((tool) => ({ ...tool, annotations: publicToolRisk(tool.name) ?? tool.annotations }))
  .map((tool) => {
    if (!stopSensitiveToolNames.has(tool.name)) return tool;
    const description = tool.description;
    return {
      ...tool,
      description:
        tool.name === "click_at"
          ? description + " " + stopInstruction
          : stopInstruction + description,
    };
  });

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
