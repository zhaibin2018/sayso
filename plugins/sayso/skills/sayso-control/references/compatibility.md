<!-- Copyright 2026 ZHAI BIN; SPDX-License-Identifier: FSL-1.1-ALv2 -->
# Compatibility and recovery

Read this file only for an older device, an existing legacy preparation or a failed action.

## Legacy fields and Search

For a device exposing only `system_search_ready`, provide the actual source frame and any tool-required proof to `open_system_search`. Reuse its same-call image.

For older protected field input, pass the actual empty field's `source_frame_id`, normalized `field`, disjoint `landmark`, optional visible `placeholder`, text and key. Use the original `source_after_command_id` for supported bound handoffs. Forward a supplied `source_field_proof` when the catalogue requires it. Enter also requires that device's linked-Enter capability.

For an already-started `search_app_with_vision` preparation, query the original `preparation_id`. `review_required` belongs to that compatibility flow. Continue only from its actual supplied focus image using the original preparation, device, query and `review_frame_id`. One `relook_focus=true` can observe the original shortcut when supported. `SPOTLIGHT_REVIEW_EXPIRED` ends that review window. For a new user request, start from the current actual screen and the direct primitive workflow.

## Click recovery

- If `POINT_CLICK_NOT_SUBMITTED` is returned, inspect the original move state separately. Unknown move/click outcomes permit only original-ID reads.
- If both move and click are confirmed unsubmitted and a real `REVIEW_POINT_AGAIN` image is supplied, choose the same intended target once from that new `click_at_source` with a new key. Stop on a second failure.
- `REVIEWED_TARGET_CENTER_REQUIRES_RELEASED_IMAGE` occurs before admission. Use an actual valid action image and its pixel coordinates. Obtain one fresh action image if the available image is only a preview or its scope is uncertain.
- If the move is confirmed and the click definitely unsubmitted, inspect the real post-move image. The pointer center must be visibly inside the target, within 8 image pixels of the original point, with the same authorization and orientation.
- When supplied, prefer `parked_click`. Copy its selector/frame and geometry exactly, use the actual pointer center normalized to the full image and two current disjoint regions, then issue one new key. Omit `resume_*` and source-proof arguments on this selector path.
- For the explicit legacy parked path only, supply the original failed click ID, original target coordinates, actual `resume_cursor_x/y`, current returned frame/proof and matching geometry. Follow the current catalogue.
- An unknown recovery is read back by its original ID. A missing pointer, changed target, unconfirmed release or second failure ends input.

A server diagnostic marked `after_rejection` describes the later diagnostic snapshot. Report its actual flags without treating them as an atomic record of the earlier rejection.
