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
  "The screenshot is the image block in this result; decode its Base64 data and view the image. Default image_only returns one short text, then the screenshot, with minimal targeting/action facts. If the host requires its image viewer, pass the original image block directly to image(block). Omit result_projection for normal reads/actions. Warning, uncertain and no-image results retain full recovery details.";

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
    name: "open_app_search",
    title: "Search installed app / 搜索已安装 App",
    description:
      "For opening an installed app when its icon is not visible. Opens System Search and types app_name once, then returns one results after-image and the original step command IDs. Does not send Return or select a result. See the sayso-open-app skill (Open app / 打开 App) for how to use this tool.",
    inputSchema: object(
      {
        device_id: idField,
        app_name: {
          type: "string",
          minLength: 1,
          maxLength: 150,
          description: "App name or established ASCII alias/pinyin used in System Search.",
        },
        idempotency_key: { type: "string", minLength: 1, maxLength: 120 },
      },
      ["device_id", "app_name", "idempotency_key"],
    ),
    annotations: { ...annotations(false, true), idempotentHint: true, openWorldHint: true },
  },
  {
    name: "get_debug_report",
    title: "Debug report / 调试报告",
    description:
      "For a requested debug report or troubleshooting an error. Returns recent SaySo operation records and current state, excluding typed text, images and credentials. The report is formatted for verbatim sharing. See the sayso-debug skill (Debug report / 调试报告) for how to use this tool.",
    inputSchema: object({
      minutes: { type: "integer", minimum: 1, maximum: 60, default: 15 },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      device_id: {
        ...idField,
        description: "Owned device UUID. Omitted when exactly one device is paired.",
      },
    }),
    annotations: annotations(true),
  },
  {
    name: "run_due_maintenance",
    title: "Run due maintenance / \u5230\u671f\u6e05\u7406",
    description:
      "For an installation owner running due server maintenance. Advances bounded server-due retention and already-authorized erasure jobs. No target, TTL, credentials or force parameters. Returns content-free execution records.",
    inputSchema: object({}),
    annotations: { ...annotations(false, true), idempotentHint: true },
  },
  {
    name: "get_maintenance_status",
    title: "Maintenance status / \u6e05\u7406\u72b6\u6001",
    description:
      "For an installation owner checking server maintenance status. Returns content-free retention execution records and backlog.",
    inputSchema: object({}),
    annotations: annotations(true),
  },
  {
    name: "open_system_search",
    title: "Open system search / 打开系统搜索",
    description:
      "For opening an installed app, starting with System Search. Opens installed-app System Search and returns the original command receipt and, by default, an after-image. No source frame is required. See the sayso-open-app skill (Open app / 打开 App) for how to use this tool.",
    inputSchema: object(
      {
        device_id: idField,
        idempotency_key: { type: "string", minLength: 1, maxLength: 120 },
        image_format: searchFocusFormat,
        settle_ms: { type: "integer", minimum: 0, maximum: 2000 },
        wait_ms: { type: "integer", minimum: 0, maximum: 3000 },
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
      "For typing in a focused field. Limit: accessory max_text_len, at most 150. Clears by default; append in multiline fields. submit=enter adds Return. Returns receipt, typed_count and after-image. Never type passwords or verification codes. Printable ASCII only: replace curly quotes, long dashes and other non-ASCII characters before calling. Split text over the limit at spaces into several calls; only the first may clear. See the sayso-type-text skill (Type text / 输入文字) for how to use this tool.",
    inputSchema: object(
      {
        device_id: idField,
        text: { type: "string", minLength: 1, maxLength: 150 },
        reviewed_input_command_id: {
          ...idField,
          description:
            "Original counted terminal input command associated with an explicit continuation.",
        },
        reviewed_frame_id: {
          ...idField,
          description:
            "Released image captured after the counted terminal receipt, within the current control scope.",
        },
        reviewed_frame_proof: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Unmodified same-image source_point_proof associated with reviewed_frame_id.",
        },
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
      "For detailed operating rules or an app workflow guide. Returns instructions for input, image handling, stopping and final-step handoff. No phone inspection or control enablement occurs. See the sayso-control skill (Control iPhone / 帮你点) and sayso-app-guides skill (App guides / App 操作指南) for how to use this tool.",
    inputSchema: object({ workflow: { type: "string", enum: controlWorkflows } }, ["workflow"]),
    annotations: annotations(true),
  },
  {
    name: "move_mouse_to",
    title: "Move pointer / 移动指针",
    description:
      "For parking the pointer on a final-step button, such as payment or sending, for the user to click. Positions the pointer without clicking, using original dimensions and orientation. Returns the original command receipt and, by default, an after-image. See the sayso-control skill (Control iPhone / 帮你点) for how to use this tool.",
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
      "For checking whether tapping control is enabled or the accessory is ready. Returns the selected phone’s current input authorization, readiness and capabilities. This lookup does not enable control. See the sayso-onboarding skill (Connect SaySo / 连接 SaySo) for how to use this tool.",
    inputSchema: object({ device_id: idField }),
    annotations: annotations(true),
  },
  {
    name: "move_mouse",
    title: "相对移动手机鼠标",
    description:
      "Moves the pointer by signed HID dx/dy integers from -127 to 127, rather than pixels, within a phone-enabled control session. Returns the original command receipt and, by default, an after-image. Only board_acked confirms board receipt. See the sayso-control skill (Control iPhone / 帮你点) for how to use this tool.",
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
      "Clicks the left button once at the current pointer position within a phone-enabled control session. No positioning occurs. Returns the original command receipt and, by default, an after-image. Queued state is separate from board acknowledgement and visible app effect. See the sayso-click-at skill (Tap once / 点一下) for how to use this tool.",
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
      "For scrolling a page or list up or down with the wheel. Sends bounded wheel steps at the current pointer position; dragging an object or handle is handled by drag_at. Returns the original receipt and, by default, an after-image. The default confirmed-scroll image window is 5000 ms, separate from the 2000 ms action wait; wait_ms specifies a total budget. See the sayso-scroll-view skill (Scroll / 滚动翻页) for how to use this tool.",
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
      "For clicking a visible target at original-image x/y with same-frame device, frame, dimensions, orientation and optional proof. Returns receipt and after-image. SCREEN_CHANGED_SINCE_IMAGE indicates a changed scene; ACTION_NO_SCREEN_CHANGE a possible miss. For pay, send, delete or other final buttons, park the pointer with move_mouse_to and let the user tap. See the sayso-click-at skill (Tap once / 点一下) for how to use this tool.",
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
      "For checking an uncertain action result by its original command. Returns command state without resubmitting input. Lookup accepts command_id alone or the original click_at_idempotency_key with device_id. Optional include_after_screen returns a read-only after-image for supported commands. Pending and uncertain states differ from confirmed board receipt and visible app effect. See the sayso-control skill (Control iPhone / 帮你点) for how to use this tool.",
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
      "For dragging a slider, icon, object or panel handle between two points. Drags between original-image endpoints using the source frame’s geometry and direct absolute HID with no calibration or relative fallback. Page or list wheel scrolling is handled by scroll_mouse. Duration defaults to 350 ms within 120–1000 ms. Returns the original receipt and, by default, an after-image. See the sayso-drag-to skill (Drag / 拖动) for how to use this tool.",
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
    name: "cancel_current_operation",
    title: "Cancel current operation / 取消当前操作",
    description:
      "For a user asking to stop, wait or pause the current operation. Cancels running and queued operations. Control permission and screen sharing are unchanged. Returns original command IDs, cancellation state and available typed_count. Missing typed_count is unknown; physical release requires an original receipt. See the sayso-control skill (Control iPhone / 帮你点) for how to use this tool.",
    inputSchema: object({ device_id: stopIDField }),
    annotations: annotations(false),
  },
  {
    name: "stop_mouse",
    title: "Cancel current operation / 取消当前操作",
    description:
      "Cancels running and queued operations for owned devices. An omitted, invalid or unmatched device_id selects all owned targets. Control permission, authorization generations and screen sharing are unchanged. Returns original command IDs and available typed_count; physical release is confirmed only by an original receipt. See the sayso-control skill (Control iPhone / 帮你点) for how to use this tool.",
    inputSchema: object({ device_id: stopIDField }),
    annotations: annotations(false),
  },
  {
    name: "read_screen",
    title: "Read shared screen / 读取共享画面",
    description:
      "Reads the user's shared iPhone screen and returns a current screenshot. Call it when the user asks what is on the screen now; before a phone action, a just-returned action after-image can be used instead. The short text and references in this result are not the screen. Workflow details: sayso-read-screen (Read screen / 看屏幕). If you cannot see the image, call read_screen up to twice more before answering. The screenshot is the image block in this result; decode its Base64 data and view the image.",
    inputSchema: object({
      device_id: idField,
      include_read_timing: {
        type: "boolean",
        default: false,
        description: "Diagnostics only; omit for normal use.",
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
      "Returns one fresh, view-only shared phone image for visual description or image-delivery diagnosis. Default compact_png and optional compact_jpeg share preview dimensions; original_jpeg contains original capture bytes. Released image age is below 2000 ms. No action evidence is issued by this tool. See the sayso-read-screen skill (Read screen / 看屏幕) for how to use this tool.",
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
      "For checking the identity connected to SaySo. Returns the stable identity represented by this Site’s authenticated OAuth connection, including its ID and name.",
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
    name: "create_pairing_link",
    title: "Create phone connection link / 创建手机连接链接",
    description:
      "For connecting a phone after SaySo supplies a connection request. Registers the phone request ID and X25519 public key and returns a private Site pairing-page URL valid for five minutes. See the sayso-onboarding skill (Connect SaySo / 连接 SaySo) for how to use this tool.",
    inputSchema: object(
      {
        request_id: { type: "string", format: "uuid" },
        public_key: { type: "string", minLength: 44, maxLength: 44 },
      },
      ["request_id", "public_key"],
    ),
    annotations: annotations(false),
  },
  {
    name: "create_pairing_code",
    title: "Create phone pairing code / 创建手机配对码",
    description:
      "Creates a short-lived code for the SaySo phone app’s service-pairing field. This code does not pair the C124 accessory or enable control. See the sayso-onboarding skill (Connect SaySo / 连接 SaySo) for how to use this tool.",
    inputSchema: object({ label: { type: "string", minLength: 1, maxLength: 120 } }, ["label"]),
    annotations: annotations(false),
  },
  {
    name: "list_devices",
    title: "List my phones / 我的手机",
    description:
      "For identifying the paired phone or checking screen-sharing status. Returns owned phones with home_status for the four SaySo home rows, including current screen-sharing and control state. See the sayso-onboarding skill (Connect SaySo / 连接 SaySo) for how to use this tool.",
    inputSchema: object({}),
    annotations: annotations(true),
  },
  {
    name: "stop_session",
    title: "Cancel session operations / 取消会话操作",
    description:
      "Compatibility alias that cancels running and queued operations in owned sessions. Control permission and screen sharing are unchanged. An omitted, invalid, unmatched or old stopped bridge_session_id selects all owned targets. Returns original command IDs and available typed_count. See the sayso-control skill (Control iPhone / 帮你点) for how to use this tool.",
    inputSchema: object({ bridge_session_id: stopIDField }),
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

export const compatibilityToolNames = new Set([
  "stop_mouse",
  "stop_session",
  "create_pairing_code",
]);

export const publicToolNames = new Set([
  "open_app_search",
  "get_debug_report",
  "get_profile",
  "run_due_maintenance",
  "get_maintenance_status",
  "list_devices",
  "create_pairing_link",
  "cancel_current_operation",
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
]);
const projectionTools = new Set([
  "read_screen",
  "click_at",
  "move_mouse_to",
  "scroll_mouse",
  "drag_at",
  "type_text_in_field",
  "open_system_search",
  "open_app_search",
  "get_mouse_result",
]);
for (const tool of allMcpTools)
  if (projectionTools.has(tool.name))
    Object.assign(tool.inputSchema.properties, {
      result_projection: {
        type: "string",
        enum: ["image_only", "full", "compact_v1"],
        default: "image_only",
        description: "Omit for normal use.",
      },
    });
export function mcpToolsForAudience(audience: "public" | "development" = "public") {
  return audience === "development"
    ? allMcpTools
    : allMcpTools.filter((tool) => publicToolNames.has(tool.name));
}
