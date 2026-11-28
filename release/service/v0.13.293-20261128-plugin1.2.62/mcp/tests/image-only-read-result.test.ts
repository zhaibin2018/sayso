import test from "node:test";
import assert from "node:assert/strict";
import { imageOnlyReadResult } from "../lib/image-only-read-result.ts";
import { mcpToolsForAudience } from "../lib/mcp-tool-catalog.ts";

test("image_only is the optional schema default on reads and qualified action images", () => {
  for (const audience of ["public", "development"] as const) {
    for (const tool of mcpToolsForAudience(audience)) {
      const schema = tool.inputSchema as { properties: Record<string, any>; required: string[] };
      const projection = schema.properties.result_projection;
      if (projection) {
        assert.deepEqual(projection.enum, ["image_only", "full", "compact_v1"]);
        assert.ok(!schema.required.includes("result_projection"));
        assert.equal(projection.default, "image_only");
      }
    }
  }
});

test("image_only omits structuredContent without targeting and never copies diagnostics", () => {
  const image = { type: "image", mimeType: "image/jpeg", data: "fixture" };
  const fields = { state: "available", metadata: { frame_id: "fixture-frame", age_ms: 42.5 },
    trace: { private: "fixture" }, recovery: { lookups: 9 }, source_point_proof: "unbound-fixture" };
  const original = structuredClone(fields);
  const result = imageOnlyReadResult(fields, [image], false)!;
  assert.deepEqual(result.content.map(block => block.type), ["text", "image"]);
  assert.equal(result.content[1], image);
  assert.equal(result.content[0].text, "Screenshot below. 下图是屏幕截图。");
  assert.equal(Object.hasOwn(result, "structuredContent"), false);
  assert.doesNotMatch(JSON.stringify(result), /private|trace|recovery|unbound/);
  assert.deepEqual(fields, original);
  const targeted = imageOnlyReadResult({ ...fields, image_handoff: { source_frame_id: "fixture-frame" } }, [image], false)!;
  assert.deepEqual(targeted.structuredContent, { image_handoff: { source_frame_id: "fixture-frame" } });
  assert.doesNotMatch(JSON.stringify(targeted), /unbound|source_point_proof/);
});

test("image_only never hides errors, warnings, missing pixels or invalid ages", () => {
  const value = { state: "available", metadata: { frame_id: "fixture", age_ms: 10 } };
  const images = [{ type: "image", mimeType: "image/jpeg", data: "fixture" }];
  for (const fields of [{ ...value, warning: "ACTION_NO_SCREEN_CHANGE" },
    { ...value, error: "fixture_error" }, { ...value, state: "unchanged" },
    ...[-1, NaN, Infinity, "10"].map(age_ms => ({ ...value, metadata: { frame_id: "fixture", age_ms } }))])
    assert.equal(imageOnlyReadResult(fields, images, false), undefined);
  assert.equal(imageOnlyReadResult(value, images, true), undefined);
  assert.equal(imageOnlyReadResult(value, [], false), undefined);
  assert.equal(imageOnlyReadResult(value, [{ ...images[0], data: "" }], false), undefined);
});
