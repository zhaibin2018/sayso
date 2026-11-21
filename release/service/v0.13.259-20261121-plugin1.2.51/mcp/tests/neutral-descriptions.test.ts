import test from "node:test";
import assert from "node:assert/strict";
import { allMcpTools } from "../lib/mcp-tool-catalog.ts";

function descriptions(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === "description" && typeof item === "string" ? [item] : descriptions(item),
  );
}

test("all 31 tools and recursive schema descriptions contain facts without behavioral commands", () => {
  assert.equal(allMcpTools.length, 31);
  const commands =
    /先|不要|不能|必须|务必|请勿|一律|\b(?:never|always|must|should|respect)\b|\bdo not\b|\bdon['’]t\b|\bfirst call\b|(?:^|[.;:]\s+)(?:use|inspect|display|reuse|read|call|stop|omit|round|convert|choose|enter|report|analyze|keep|preserve|require|select|ask|follow)\b/i;
  for (const tool of allMcpTools)
    for (const text of descriptions(tool))
      assert.doesNotMatch(text, commands, `${tool.name}: ${text}`);
});
