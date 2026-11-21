---
name: sayso-onboarding
description: Prepare a missing SaySo device, screen share or control permission. 仅在未配对、共享或控制未就绪时使用。
---

# Connection readiness

Reply in the user's language. Use current connected SaySo tools.

1. If one usable share is already selected, continue the task. Use `list_devices` when selection or diagnosis is necessary.
2. Create a pairing code only when phone-to-service pairing is missing. This is separate from accessory-to-phone pairing; C124 button pairing is not implemented yet. The user enters it in SaySo. Screen viewing needs an active iOS broadcast, which requires device-side confirmation.
3. For input, check `get_mouse_state` when current permission or capability is unknown. Reuse existing valid authorization. Viewing alone needs no C124.
4. If a tool reports an available image but the model sees no pixels, follow [image handoff](../sayso-control/references/image-handoff.md). An image count is a server observation.
5. After recovery, resume from the current actual image and permission.

Use the private service connected to this plugin. Plugin version, Sites runtime, iPhone app build and C124 firmware are distinct. Preserve the user's selected physical transport and stop controls.
