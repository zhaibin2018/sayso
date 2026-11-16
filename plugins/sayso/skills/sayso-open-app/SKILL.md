---
name: sayso-open-app
description: Open any installed iPhone app using current images. 打开 App，例如“打开淘宝”或“Open Google Maps”。
---

<!-- Copyright 2026 ZHAI BIN; SPDX-License-Identifier: FSL-1.1-ALv2 -->


# Open an app

Apply [shared rules](../sayso-control/references/workflows.md) and [image handoff](../sayso-control/references/image-handoff.md).

1. If the target app is already visible, continue the user's task. If its installed icon or open arrow is visible in the current image, use `click_at(settle_ms=700)` directly.
2. If Spotlight must be opened and `system_search_scope_only_ready` is available, call `open_system_search` once with `device_id` and a new key. Omit source-frame arguments and `wait_ms`. When the catalogue exposes `image_format`, request `image_format="original_jpeg"` so the same full-size after-image can locate either the field or an already visible installed icon. Do not request a reduced preview for this action-selection flow.
3. Use that same-call focus image directly for `type_text_in_field`. On `focused_text_no_visual_ready` devices, pass device, requested app name and a new key. Default clear applies. Omit `submit`. use `settle_ms=300` when supported for the result-list image. If Spotlight is already open, start with that visible field.
4. From the input's actual after-image, locate the installed result. Use [click](../sayso-click-at/SKILL.md) once with `settle_ms=700` for the app-launch transition. Confirm the requested app from the click's same-call image and use it directly to select the next field. Do not insert read_screen after a successful launch just to confirm it again. If that actual image is still loading, use one original-ID get_mouse_result observation.

For an installed icon or open arrow, prefer the supported target-region center selector described by the click skill. Forward the exact source proof when supplied. Use original-image pixel coordinates only when center selection is unsupported or a precise point is intended. App-store entries and web suggestions need visual distinction from installed results.

Follow [compatibility](../sayso-control/references/compatibility.md) only for older devices or an already-started legacy preparation. Apply the shared original-ID recovery rule if an image or action is unresolved.
