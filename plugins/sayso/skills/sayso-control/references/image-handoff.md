# Image handoff

Read actual image blocks before describing the screen or selecting an action.

1. Inspect all `content_items` and `content` arrays, including envelopes nested under `result` or `structuredContent`. An empty array must not hide a populated one. Select `type: "image"` blocks with nonempty `data`.
2. If the host already displays the pixels to the model, inspect them. Otherwise, Base64 decoding and image presentation are required. Use the host's real image capability. In code-mode, `image(block)` decodes and presents the original block. A byte-only decoder must be followed by an actual image-view operation.
3. Respect `mimeType` or `mime_type`. PNG starts with `89504e470d0a1a0a`. JPEG starts with `ffd8ff`. Keep Base64 out of user-facing text and external decoding services.
4. Pass the displayed image and its `image_handoff` to the next decision. The handoff has the exact `source_frame_id`, device, original image dimensions, orientation and original action ID. If the exact handoff metadata is missing, use only matching fields actually returned with that same image; never fabricate a frame ID. A resized image separately reports `displayed_width/height`; select in normalized full-frame coordinates and convert to original pixels with x*(image_width-1), y*(image_height-1). Do not send display-preview pixel coordinates as original coordinates. Do not copy `image_handoff` as an unknown tool argument: pass only the fields that the selected tool accepts. Keep proofs with their original image. `available`, a URL, an image count or a decoded byte count alone cannot establish visual observation.

Code-mode example, only where the host provides `image`:

```javascript
function imageBlocks(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(imageBlocks);
  if (value.type === "image" && typeof value.data === "string" && value.data.length) {
    return [value];
  }
  return ["content_items", "content", "result", "structuredContent"]
    .flatMap(key => imageBlocks(value[key]));
}
const seen = new Set();
for (const block of imageBlocks(result)) {
  if (seen.has(block.data)) continue;
  seen.add(block.data);
  image({ ...block, mimeType: block.mimeType ?? block.mime_type });
}
```

For production screen descriptions, use `read_screen`. The preview-only `read_screen_live` tool is development-only. Use the current tool catalogue; never substitute a retired preview selector.

An `open_system_search` focus PNG can feed direct typing, with its original action/frame binding. Coordinate-based actions use their actual action image's original geometry. A view-only preview supplies no action proof.

If pixels are absent, report the observed gap accurately in the user's language, for example “The tool reported an image, but this host did not expose it to me” / “工具报告有图，但当前宿主没有把图片交给我”。Use the shared one-read recovery rule where applicable. Never claim to have decoded or seen an image without doing so.
