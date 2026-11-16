---
name: sayso-click-at
description: Click a visible iPhone target once and use its after-image. 点击按钮、图标或输入框。
---

<!-- Copyright 2026 ZHAI BIN; SPDX-License-Identifier: FSL-1.1-ALv2 -->


# Click once

Apply [shared rules](../sayso-control/references/workflows.md) and [image handoff](../sayso-control/references/image-handoff.md).

1. Use the previous actual after-image, or one `read_screen` at the flow's start.
2. Select the visible target from that image. Copy `device_id`, `source_frame_id`, `image_width`, `image_height` and `orientation_epoch` from its `image_handoff`, metadata or `click_at_source`. Keep any exact source proof paired with it.
3. For an ordinary button, icon or field, prefer the supported region-center selector: choose a tight normalized `target_region` whose center is inside the intended target and a disjoint stable `landmark_region`, then pass `x=0,y=0` together. Use this only when that image's instructions or the current catalogue explicitly support it. Forward the exact `source_point_proof` or `source_query_proof` when supplied and use a new key. For an intentional precise point or an older source without center support, use original-image pixel coordinates and ensure the point is at least 2 pixels inside every edge of `target_region`. Never mix preview-pixel coordinates with original dimensions.
4. Inspect the same-call after-image and pass it directly to the next step.
5. `REVIEWED_POINT_TARGET_MARGIN` rejects the point before input. Do not repeat an inconsistent point/region pair. If the same image still clearly supports the target, correct the pair once using its supported center selector; otherwise stop or follow the shared recovery rule. Never treat other errors or unknown submission as this pre-input rejection.

Ordinary clicks use device authority and geometry checks on the phone. A move receipt alone does not establish a click or app effect. Use the original move/click IDs for uncertainty. If both stages are proven unsubmitted or the pointer is parked after a confirmed move, consult [bounded recovery](../sayso-control/references/compatibility.md#click-recovery) before another action.
