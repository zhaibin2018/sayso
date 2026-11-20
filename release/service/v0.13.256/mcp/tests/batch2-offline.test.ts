import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { allMcpTools } from "../lib/mcp-tool-catalog.ts";
import { stopInstruction } from "../lib/stop-guidance.ts";
import { phoneWorkflowInstructions } from "../lib/interaction-guidance.ts";
import { handleMcp } from "../lib/mcp-protocol.ts";

test("every phone input tool and Stop carries the same bilingual stop-first rule", () => {
  const names = [
    "click_at",
    "move_mouse_to",
    "move_mouse",
    "click_mouse",
    "type_text_in_field",
    "scroll_mouse",
    "drag_at",
    "open_system_search",
    "set_led",
    "stop_mouse",
  ];
  for (const name of names) {
    const tool = allMcpTools.find((t) => t.name === name)!;
    assert.ok(tool.description.includes(stopInstruction.trim()), name);
    assert.ok(
      tool.description.length <= (name === "click_at" ? 800 : 500),
      `${name}: ${tool.description.length}`,
    );
  }
  assert.ok(
    allMcpTools.find((t) => t.name === "stop_mouse")!.description.startsWith(stopInstruction),
  );
  for (const phrase of [
    "停",
    "停下",
    "暂停",
    "别弄了",
    "等一下",
    "stop",
    "wait",
    "pause",
    "hold on",
  ])
    assert.ok(stopInstruction.includes(phrase));
  assert.match(stopInstruction, /FIRST call stop_mouse/);
  assert.match(stopInstruction, /explicit resume AND renewed SaySo control permission/);
});

test("initialize exposes Stop priority and current-screen references before ordinary continuation", async () => {
  const response = await handleMcp(
    new Request("https://offline.invalid/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    }),
    {
      engine: () => {
        throw Error("No service access");
      },
      caller: () => ({ id: "offline", label: "Offline" }),
      origin: "https://offline.invalid",
      retention: false,
    },
  );
  const value = (await response.json()) as any;
  assert.ok(value.result.instructions.includes(stopInstruction));
  for (const text of [phoneWorkflowInstructions]) {
    assert.ok(text.includes(stopInstruction.trim()));
    assert.match(text, /这个、这里、这页、这个订单、this or here/);
    assert.match(text, /FIRST read_screen before answering or acting/);
    assert.match(text, /do not ask which app/);
    assert.match(text, /T6: park on the button and let the user tap/);
  }
});

const skillURL = new URL("../../plugin/skills/sayso-control/SKILL.md", import.meta.url);
test(
  "owned control Skill has identical stop rule and current-screen priority",
  { skip: !existsSync(skillURL) },
  () => {
    const text = readFileSync(skillURL, "utf8");
    assert.ok(text.includes(stopInstruction.trim()));
    assert.match(text, /FIRST read_screen before answering or acting/);
    assert.match(text, /do not ask which app/);
    assert.match(text, /T6: park on the button and let the user tap/);
  },
);
