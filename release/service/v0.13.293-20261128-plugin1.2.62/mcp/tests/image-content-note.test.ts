import assert from "node:assert/strict";
import { test } from "node:test";
import { conciseToolText } from "../lib/model-tool-text.ts";

test("read-screen image note is factual, bounded and leaves source fields intact", () => {
  const value = { state: "available", image_blocks: 1, metadata: { frame_id: "fixture" } };
  const before = JSON.stringify(value);
  const text = conciseToolText("read_screen", value, before);
  const projected = JSON.parse(text);
  assert.equal(projected.image_content_note, "屏幕图片见 image 块。");
  assert.deepEqual(projected.metadata, value.metadata);
  assert.equal(JSON.stringify(value), before);
  assert.ok(Buffer.byteLength(projected.image_content_note) < 40);
  assert.doesNotMatch(projected.image_content_note,
    /approval|classifier|risk|confirmation|never|always|must|should|inspect|display|decode|first call|批准|风险|无需|先|不要|不能|必须|请勿|一律/i);
});

test("no image, unchanged, failed reads and other tools have no image note", () => {
  for (const value of [
    { state: "unavailable", image_blocks: 0 },
    { state: "unchanged", image_blocks: 0, image_ref: "fixture-ref" },
    { error: "NO_FRAME", image_blocks: 0 },
    { state: "available" },
  ]) {
    const text = conciseToolText("read_screen", value, JSON.stringify(value));
    assert.equal(JSON.parse(text).image_content_note, undefined);
  }
  const value = { state: "available", image_blocks: 1 };
  assert.equal(JSON.parse(conciseToolText("click_at", value, JSON.stringify(value))).image_content_note, undefined);
});
