---
name: sayso-control
description: Read and operate the current iPhone through SaySo. 看屏、点击、输入、滚动和拖拽，连续复用真实后图。
---

# SaySo

Use the connected SaySo tools for the user's current iPhone task. Reply in the user's current language, including English or Chinese. Preserve app names and requested text exactly. Ask for a missing target or text only when context cannot resolve it.

Apply [shared execution rules](references/workflows.md) once per task. Read [image handoff](references/image-handoff.md) before interpreting the first tool image.

- Use `read_screen` for production screen descriptions and action decisions. Preview-only tools belong to the development connector; do not assume they are available.
- For a new action needing coordinates, use an existing actual action image, or `read_screen` if none is available.
- After each action, pass its same-call image and `image_handoff` directly to the next decision. Live judges the image between calls; a normal next action does not start with another read. Read, decode and display the image blocks. Keep the frame metadata and any supplied proof together.
- For an already-open app, use the current after-image to locate its field. Click to focus if necessary, then type. Opening an app uses [open-app](../sayso-open-app/SKILL.md).
- Route other actions to [click](../sayso-click-at/SKILL.md), [type](../sayso-type-text/SKILL.md), [scroll](../sayso-scroll-view/SKILL.md), or [drag](../sayso-drag-to/SKILL.md).
- Use [onboarding](../sayso-onboarding/SKILL.md) only when device selection, sharing or control readiness is missing.

Keep voice progress brief and continue the tool call in the same turn. Report the effect visible in the final image. A model-context update alone cannot resume an ended voice turn.

T6: For irreversible final payments, orders, sends, deletions, subscription cancellation or transfers, do not click/submit. Use `move_mouse_to`, inspect the real after-image, then name the button and ask the user to tap it themselves. Missing/uncertain images are not readiness. Follow the shared T6 and hidden-screen rules; ChatGPT approval is not the final tap. 中文：最后一步先停指针、确认真实后图，再请用户自己点；黑屏或共享警告时不操作。
