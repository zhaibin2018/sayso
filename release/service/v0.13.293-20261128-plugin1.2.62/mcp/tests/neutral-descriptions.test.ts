import test from "node:test";
import assert from "node:assert/strict";
import { allMcpTools, mcpToolsForAudience } from "../lib/mcp-tool-catalog.ts";

// D154 permits only the exact matching skill pointer at the end of a tool's
// top-level description; D156 substitutes only read_screen's exact Base64 sentence.
// D160 permits only the exact reviewed read_screen v2 description.
// D115 still covers all other text and every schema.
const readScreenV2 = "Reads the user's shared iPhone screen and returns a current screenshot. Call it when the user asks what is on the screen now; before a phone action, a just-returned action after-image can be used instead. The short text and references in this result are not the screen. Workflow details: sayso-read-screen (Read screen / 看屏幕). If you cannot see the image, call read_screen up to twice more before answering. The screenshot is the image block in this result; decode its Base64 data and view the image.";
const pointers = new Map<string, string>();
for (const [names, skill, label] of [
  [["click_at", "click_mouse"], "sayso-click-at", "Tap once / 点一下"],
  [["drag_at"], "sayso-drag-to", "Drag / 拖动"],
  [["scroll_mouse"], "sayso-scroll-view", "Scroll / 滚动翻页"],
  [["type_text_in_field"], "sayso-type-text", "Type text / 输入文字"],
  [["open_system_search","open_app_search"], "sayso-open-app", "Open app / 打开 App"],
  [["list_devices", "get_mouse_state", "create_pairing_link", "create_pairing_code"], "sayso-onboarding", "Connect SaySo / 连接 SaySo"],
  [["get_debug_report"], "sayso-debug", "Debug report / 调试报告"],
  [["cancel_current_operation", "stop_mouse", "stop_session", "move_mouse_to", "move_mouse", "get_mouse_result"], "sayso-control", "Control iPhone / 帮你点"],
  [["read_screen_live"], "sayso-read-screen", "Read screen / 看屏幕"],
] as const)
  for (const name of names)
    pointers.set(name, `See the ${skill} skill (${label}) for how to use this tool.`);
pointers.set("read_screen", "The screenshot is the image block in this result; decode its Base64 data and view the image.");
pointers.set("get_control_guide", "See the sayso-control skill (Control iPhone / 帮你点) and sayso-app-guides skill (App guides / App 操作指南) for how to use this tool.");

const d207Actions = {"click_at": "For clicking a visible target at original-image x/y with same-frame device, frame, dimensions, orientation and optional proof. Returns receipt and after-image. SCREEN_CHANGED_SINCE_IMAGE indicates a changed scene; ACTION_NO_SCREEN_CHANGE a possible miss. For pay, send, delete or other final buttons, park the pointer with move_mouse_to and let the user tap. See the sayso-click-at skill (Tap once / 点一下) for how to use this tool.", "type_text_in_field": "For typing in a focused field. Limit: accessory max_text_len, at most 150. Clears by default; append in multiline fields. submit=enter adds Return. Returns receipt, typed_count and after-image. Never type passwords or verification codes. Printable ASCII only: replace curly quotes, long dashes and other non-ASCII characters before calling. Split text over the limit at spaces into several calls; only the first may clear. See the sayso-type-text skill (Type text / 输入文字) for how to use this tool."};
const commands =
  /先|不要|不能|必须|务必|请勿|一律|\b(?:never|always|must|should|respect)\b|\bdo not\b|\bdon['’]t\b|\bfirst call\b|(?:^|[.;:]\s+)(?:use|inspect|display|reuse|read|call|stop|omit|round|convert|choose|enter|report|analyze|keep|preserve|require|select|ask|follow|decode)\b/i;
function factualBody(name: string, text: string) {
  if (name === "read_screen" && text === readScreenV2) return "Reads the user shared iPhone screen.";
  if (Object.entries(d207Actions).some(([tool,reviewed])=>name===tool&&text===reviewed)) return "Action facts with exact D207 safety wording.";
  const pointer = pointers.get(name);
  return pointer && text.endsWith(" " + pointer) ? text.slice(0, -pointer.length).trimEnd() : text;
}

function descriptions(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === "description" && typeof item === "string" ? [item] : descriptions(item),
  );
}

test("D115 facts and recursive schemas remain neutral with narrow D154 skill-pointer and D156 read_screen exceptions", () => {
  assert.equal(allMcpTools.length, 32);
  for (const tool of allMcpTools) {
    assert.doesNotMatch(factualBody(tool.name, tool.description), commands, tool.name);
    // D167 permits only these exact parameter descriptions; all other text stays neutral.
    const schema = structuredClone(tool.inputSchema);
    const properties = schema.properties as Record<string, { description?: string }>;
    for (const [name, expected] of [
      ["result_projection", "Omit for normal use."],
      ["include_read_timing", "Diagnostics only; omit for normal use."],
    ]) {
      if (name === "include_read_timing" && tool.name !== "read_screen") continue;
      if (!properties[name]) continue;
      assert.equal(properties[name].description, expected, `${tool.name}.${name}`);
      delete properties[name].description;
    }
    for (const text of [...descriptions(schema), ...descriptions("outputSchema" in tool ? tool.outputSchema : null)])
      assert.doesNotMatch(text, commands, `${tool.name}: ${text}`);
  }
});

test("D154/D156 exact tool suffixes and all 18 public intent openings", () => {
  assert.equal(mcpToolsForAudience().length, 18);
  for (const tool of allMcpTools) {
    const pointer = pointers.get(tool.name);
    if (pointer) assert.ok(tool.description.endsWith(" " + pointer), tool.name);
    else assert.doesNotMatch(tool.description, /sayso-[a-z-]+ skill/, tool.name);
    assert.doesNotMatch(tool.description, /legacy 64|next_step is a legacy hint|reviewed_input_command_id/);
  }
  for (const tool of mcpToolsForAudience()) {
    assert.match(tool.description, tool.name === "read_screen" ? /^Reads [^.]+\./ : /^For [^.]+\./, tool.name);
    assert.ok(tool.description.length <= 500, `${tool.name}: ${tool.description.length}`);
  }
  assert.equal(allMcpTools.find(t => t.name === "read_screen")!.description, readScreenV2);
  assert.ok(readScreenV2.includes("Workflow details: sayso-read-screen (Read screen / 看屏幕)."));
  assert.match(allMcpTools.find(t => t.name === "move_mouse_to")!.description, /final-step button.*user to click/);
});

test("D154/D156 cannot exempt another command, mismatched tool, edited sentence or trailing text", () => {
  const pointer = pointers.get("read_screen")!;
  for (const text of [
    `Returns an image. Use another tool. ${pointer}`,
    readScreenV2.replace("Call it when", "Call it whenever"),
    readScreenV2 + " Do not ask.",
    `Returns an image. ${pointer.replace("decode its", "decode all")}`,
    `Returns an image. ${pointer.replace("decode its", "decode its (if needed)")}`,
    `Returns an image. ${pointer} Do not ask.`,
    "Returns an image. Use the sayso-control skill.",
    "Returns an image. Use the sayso-made-up skill.",
  ]) assert.match(factualBody("read_screen", text), commands);
  assert.match(factualBody("get_profile", pointer), commands);
  assert.match(factualBody("read_screen_live", pointer), commands);
  assert.doesNotMatch(factualBody("read_screen", `Returns an image. ${pointer}`), commands);
});
