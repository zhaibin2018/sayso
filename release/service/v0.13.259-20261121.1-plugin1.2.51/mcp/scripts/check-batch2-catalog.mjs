import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { allMcpTools, mcpToolsForAudience } from "../lib/mcp-tool-catalog.ts";
const baseline = JSON.parse(
  execFileSync("git", ["show", "8d8175a:contracts/current-actions.json"], {
    encoding: "utf8", cwd: new URL("..", import.meta.url),
  }),
);
const before = [...baseline.public_tools, ...baseline.development_tools];
assert.deepEqual(
  mcpToolsForAudience().map((t) => t.name),
  baseline.public_tools.map((t) => t.name),
);
assert.deepEqual(
  allMcpTools
    .filter((t) => !mcpToolsForAudience().some((p) => p.name === t.name))
    .map((t) => t.name),
  baseline.development_tools.map((t) => t.name),
);
const changes = [];
for (const old of before) {
  const current = allMcpTools.find((t) => t.name === old.name);
  assert.ok(current, old.name);
  const { description: a, ...prior } = old;
  const { description: b, ...next } = current;
  assert.deepEqual(next, prior, `${old.name}: non-description change`);
  if (a !== b) changes.push({ name: old.name, characters: b.length });
}
assert.equal(allMcpTools.length, before.length);
assert.deepEqual(
  changes.map((x) => x.name).sort(),
  [
    "click_at",
    "click_mouse",
    "drag_at",
    "move_mouse",
    "move_mouse_to",
    "open_system_search",
    "scroll_mouse",
    "set_led",
    "stop_mouse",
    "type_text_in_field",
  ].sort(),
);
console.log(
  JSON.stringify(
    { baseline: "8d8175a", tools: before.length, descriptions_only: true, changes },
    null,
    2,
  ),
);
