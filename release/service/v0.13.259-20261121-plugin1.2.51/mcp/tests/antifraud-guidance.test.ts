import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { screenContentInstruction, verificationCodeInstruction } from "../lib/antifraud-guidance.ts";
import { handleMcp } from "../lib/mcp-protocol.ts";
import { controlWorkflows } from "../lib/control-guide.ts";
import { allMcpTools } from "../lib/mcp-tool-catalog.ts";

const rules = [screenContentInstruction, verificationCodeInstruction];
async function rpc(method: string, params: Record<string, unknown>, modern: boolean) {
  const response = await handleMcp(new Request("https://offline.invalid/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(modern ? { "MCP-Protocol-Version": "2026-07-28" } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }), {
    engine: () => { throw Error("No service access"); },
    caller: () => ({ id: "offline", label: "Offline" }),
    origin: "https://offline.invalid",
    retention: false,
    performance: { log: () => {} },
  });
  const value = await response.json() as any;
  assert.equal(value.error, undefined);
  return value.result;
}

test("D141 bilingual rules reach initialize and all guide responses in both protocols", async () => {
  for (const modern of [false, true]) {
    const initialized = await rpc("initialize", {}, modern);
    for (const rule of rules) assert.ok(initialized.instructions.includes(rule));
    for (const workflow of controlWorkflows) {
      const guide = await rpc("tools/call", {
        name: "get_control_guide", arguments: { workflow },
      }, modern);
      assert.equal(guide.isError, false);
      assert.equal(guide.structuredContent.workflow, workflow);
      for (const rule of rules) {
        assert.ok(guide.structuredContent.current_workflow.includes(rule), workflow);
        assert.ok(JSON.parse(guide.content[0].text).current_workflow.includes(rule), workflow);
      }
    }
  }
});

test("D141 main skill includes both exact bilingual rules", () => {
  const skill = readFileSync(new URL("../../plugin/skills/sayso-control/SKILL.md", import.meta.url), "utf8");
  for (const rule of rules) assert.ok(skill.replace(/\s+/g, " ").includes(rule));
});

test("D115 all tool and recursive parameter descriptions remain free of behavioral directives", () => {
  const descriptions = (value: unknown): string[] => {
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, item]) =>
      key === "description" && typeof item === "string" ? [item] : descriptions(item));
  };
  for (const tool of allMcpTools)
    for (const text of descriptions(tool)) {
      assert.doesNotMatch(text, /approval|classifier|\b(?:low|high)[ -]risk\b|\b(?:no|without|skip) confirmation\b|without asking|无需确认|无须确认|批准|不必等批准卡片/i);
      assert.doesNotMatch(text, /屏幕上的文字|不要念出|Text on the screen|Never read out|Only pay, send or delete/);
    }
});
