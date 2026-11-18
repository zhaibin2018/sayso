import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mcpToolsForAudience } from "../lib/mcp-tool-catalog.ts";
import { phoneWorkflowInstructions, afterImageInstruction } from "../lib/interaction-guidance.ts";
import { controlGuide, controlWorkflows } from "../lib/control-guide.ts";
const tools = mcpToolsForAudience(),
  names = new Set(tools.map((t) => t.name));
const parameters = new Set(tools.flatMap((t) => Object.keys(t.inputSchema.properties)));
const outputs = new Set(["click_at_source", "click_at_instruction", "stop_reason"]);
export function validateReferences(text: string) {
  for (const name of text.match(
    /\b(?:read|get|stop|move|click|drag|scroll|type|open|create|list|revoke|prepare|search|run|view)_[a-z_]+\b/g,
  ) ?? [])
    assert.ok(
      names.has(name) ||
        parameters.has(name) ||
        (controlWorkflows as readonly string[]).includes(name) ||
        outputs.has(name),
      `Unknown production tool reference: ${name}`,
    );
  for (const call of text.matchAll(/\b([a-z]+(?:_[a-z]+)+)\(([^)\n]*)\)/g)) {
    const tool = tools.find((t) => t.name === call[1]);
    if (!tool) continue;
    for (const parameter of call[2].matchAll(/\b([a-z]+(?:_[a-z]+)*)\s*=/g))
      assert.ok(
        Object.hasOwn(tool.inputSchema.properties, parameter[1]),
        `${call[1]} has no parameter ${parameter[1]}`,
      );
  }
  for (const ref of text.matchAll(/\b([a-z]+(?:_[a-z]+)+)\.([a-z]+(?:_[a-z]+)*)\b/g)) {
    const tool = tools.find((t) => t.name === ref[1]);
    if (tool)
      assert.ok(
        Object.hasOwn(tool.inputSchema.properties, ref[2]),
        `Unknown qualified parameter: ${ref[0]}`,
      );
  }
  assert.doesNotMatch(
    text,
    /Region-center|x=0\s*(?:,|and)\s*y=0|target_region|landmark_region|calibrated relative path|focus PNG|current reviewed image|existing confirmation mechanism/,
  );
}
test("production instructions and descriptions reference only current tools and call parameters", () => {
  for (const text of [
    phoneWorkflowInstructions,
    afterImageInstruction,
    ...tools.map((t) => t.description),
    ...controlWorkflows.map((w) => JSON.stringify(controlGuide(w))),
  ])
    validateReferences(text);
  for (const tool of tools)
    assert.ok(
      tool.description.length <= (tool.name === "click_at" ? 800 : 500),
      `${tool.name}: ${tool.description.length}`,
    );
  assert.match(tools.find((t) => t.name === "click_at")!.description, /^T6:/);
  assert.ok(
    !tools
      .find((t) => t.name === "stop_session")!
      .inputSchema.required.includes("bridge_session_id"),
  );
});
test("reference checker rejects retired tools and invented input parameters", () => {
  for (const text of [
    "call read_screen_text",
    "click_at(target_region=box)",
    "drag_at(invented_delay=3)",
    "click_at.target_region",
  ])
    assert.throws(() => validateReferences(text));
  validateReferences('type_text_in_field(submit="enter")');
});
// Source package CI need not contain a private plugin checkout. Validate the public bundle
// when present, or the sibling owned plugin during local development.
const roots = [
  join(import.meta.dirname, "../../plugin/skills"),
  join(import.meta.dirname, "../../plugins/sayso/skills"),
];
const root = roots.find((p) => {
  try {
    return readdirSync(p).length > 0;
  } catch {
    return false;
  }
});
test(
  "packaged production skills have current references and no internal acceptance instructions",
  { skip: !root },
  () => {
    const walk = (p: string): string[] =>
      readdirSync(p, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(p, e.name)) : e.name.endsWith(".md") ? [join(p, e.name)] : [],
      );
    for (const file of walk(root!)) {
      const text = readFileSync(file, "utf8");
      validateReferences(text);
      assert.doesNotMatch(text, /WDA|iPhone 11 acceptance|sayso\.davidzhai/);
    }
  },
);
