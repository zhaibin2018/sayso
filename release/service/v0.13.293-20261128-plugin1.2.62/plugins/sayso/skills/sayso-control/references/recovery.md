# Original-action recovery

Reconcile uncertain input using the original command ID, or original click key and device. A missing record is not proof that input never occurred. Never resend input just to obtain an image.

- An acknowledged action with missing/loading pixels permits one bounded read-only observation of that original action, as specified by the [shared rules](workflows.md#observe-and-act). Use its actual image directly.
- If both click stages are confirmed unsubmitted and a current image supports the intended target, one new action may use a new key. If movement was confirmed but the click was definitely not submitted, inspect the original result and after-image before selecting a new point action. Unknown submission remains blocked.
- Stop on lost permission, absent target, unconfirmed input release or a second failure. A diagnostic marked `after_rejection` is a later snapshot, not proof of the earlier atomic conditions.

## Counted interrupted text

Only `recovery_eligible=true` permits `read_screen` followed by explicit continuation from that new image. Require an exact `typed_count` for the original segment. Use `type_text_in_field` with `reviewed_input_command_id`, actual `reviewed_frame_id`, unchanged `source_point_proof` as `reviewed_frame_proof` when returned, a new key and `clear_before_input=false`. For a partial segment send only `original_segment.slice(typed_count)` (the exact unsent suffix); after a complete counted segment send the next segment. Never repeat a prefix or Return. Missing/inexact counts, uncertain release, expired image or changed permission remain blocked.

## Stop immediately

On Stop, FIRST call `cancel_current_operation`, without readiness or screen checks, following [Stop and orientation](workflows.md#stop-and-orientation). Use an explicit device only when already established; otherwise use the tool's supported default. Sharing and tapping permission remain on. A cloud cancellation alone does not prove physical key release. To disable tapping/end sharing, ask the user to use the corresponding SaySo App control; never present cancellation as ending the session.
