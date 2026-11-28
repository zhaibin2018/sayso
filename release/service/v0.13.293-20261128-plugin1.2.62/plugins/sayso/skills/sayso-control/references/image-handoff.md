# Image handoff

Use the full [Read screen rules](../../sayso-read-screen/SKILL.md) before interpreting an image; this reference supplies viewer and geometry details.

The screenshot is the image block in this result; decode its Base64 data and view the image. 把返回图片块的 Base64 数据解码后看图。Omit `result_projection` for reads, actions and original-command observations. Results return one short text, then the screenshot; `structuredContent` holds only exact targeting references and necessary action facts for confirmed after-images.

Decode the returned image block's Base64 data and view the image. In code mode, `image(block)` decodes and presents the original image block. Preserve MIME and bytes. 把返回图片块的 Base64 数据解码后看图。No JSON search or external image service is needed. A reference or byte count does not establish that pixels were viewed.

Retain the image's exact `image_handoff` device, source frame, original dimensions, orientation, original action ID and any proof. A resized display separately reports `displayed_width/height`; convert normalized full-frame x/y to original pixels using `x*(image_width-1)` and `y*(image_height-1)`. Pass only parameters accepted by the next tool. Never mix a new frame with old coordinates/proof. An `open_app_search` results after-image feeds the installed-app icon click; the separate `open_system_search` after-image can still feed direct typing. Read the exact `image_handoff` and necessary action/release facts from `structuredContent`. No proof is required when the next tool can resolve the same-frame proof server-side; never invent one. Uncertain, warning, stopped or missing-image results retain full recovery details.
