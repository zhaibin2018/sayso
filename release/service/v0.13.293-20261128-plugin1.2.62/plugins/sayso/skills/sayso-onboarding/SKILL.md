---
name: sayso-onboarding
description: "怎么连接 ChatGPT、配对手机、开始共享、配件没连、帮你点没开；connect ChatGPT, pair my phone, start screen sharing, accessory not connected, enable tapping. Recover missing SaySo connection, sharing or tapping readiness; an already usable screen-only request uses sayso-read-screen."
---

# Connection readiness

Use the current connected SaySo service and reply in the user's language. If the current share is already usable, continue the task; use `list_devices` only when readiness or diagnosis requires it. Viewing does not need an accessory.

1. For missing phone-to-service pairing, ask the user to tap “连接 ChatGPT / Connect ChatGPT” in SaySo and send its prepared request in ChatGPT Work. Use `create_pairing_link` with the request ID and public key supplied by that request; never invent them. Return the connection link for the user to open on that iPhone and follow back into SaySo. Do not replace an already connected service. First-time installation may require returning to SaySo and tapping Connect ChatGPT again after service installation; describe the actual current step, not a guaranteed wait time.
2. For missing screen sharing, ask the user to start sharing in SaySo and complete the iOS broadcast sheet. Reuse an existing active share.
3. Accessory pairing is separate and implemented: the user connects the accessory, opens “连接配件 / Connect accessory” in SaySo and follows “按一下配件上的按钮 / Press the accessory button”. Do not simulate the physical press or handle pairing secrets.
4. For input, query `get_mouse_state` only when current capability/permission is unknown. Reuse valid permission. If the user stopped tapping, they must tap “允许帮你点 / Allow tapping” in SaySo to enable it again; screen sharing alone does not enable input. Preserve the selected transport and Stop controls.
5. Once readiness is restored, return to the requested task. Use [control](../sayso-control/SKILL.md) for actions and the shared [common replies](../sayso-control/references/workflows.md#common-replies) for blockers. Do not perform unrelated setup, device selection or permission changes.

For an expected wait longer than a few seconds, give one short acknowledgement and one result when finished; avoid narrating each step.
