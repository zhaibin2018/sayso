# Current action recovery

Use only the original command ID, or original click key plus device, to reconcile uncertain input. A missing database record is not proof that input never occurred.

- An acknowledged action with missing/loading pixels allows one bounded read-only observation of the original action. Reuse that actual image.
- If both click stages are confirmed unsubmitted and a current image supports the same intended target, one new action may use a new key. Never replay the old action to obtain a picture.
- If movement was confirmed but the click definitely was not submitted, first inspect the original result and its actual after-image. Do not use retired parked/resume argument forms or an old pixel-comparison workflow. A new authorized point action requires a visible intended target and known prior click outcome.
- Stop on unknown submission, lost authorization, absent target, unconfirmed key release or a second failure.
- A diagnostic marked `after_rejection` is a later snapshot, not the atomic conditions at the earlier rejection.

There are no old-device compatibility or legacy Search/field preparation paths. Report a missing current capability accurately.


## Stop without readiness checks

Call `stop_mouse` immediately when the user asks to stop control. Use an explicit device ID only when the user selected that device; otherwise omit it to stop all owned devices. Do not run readiness or screen checks before stopping. An already-stopped response is success. Sharing continues, and cloud revocation alone does not confirm the board has released every key.

When the user wants sharing ended, call `stop_session` directly; omit `bridge_session_id` to stop all owned ongoing sessions. Report any failed session IDs accurately. Cloud stop does not confirm that iOS screen sharing has ended.

If a supplied ID is invalid or matches no owned target, Stop uses all your owned targets and reports the fallback; do not claim that an unmatched target was found. If ChatGPT is waiting for approval, tell the user to use Stop control directly in the SaySo App. That local stop is separate from ChatGPT plugin permission settings; do not change those settings for the user.

若 ChatGPT 正在等批准，请用户直接在 SaySo App 里点“停止控制”，不必等批准卡片；停止发送画面还需要停止屏幕共享。不要替用户更改 ChatGPT 权限设置。
