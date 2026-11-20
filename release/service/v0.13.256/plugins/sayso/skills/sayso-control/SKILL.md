---
name: sayso-control
description: Read and operate the current iPhone through SaySo. 看屏、点击、输入、滚动和拖拽，连续复用真实后图。
---

# SaySo

停/停下/暂停/别弄了/等一下/stop/wait/pause/hold on：先调用stop_mouse，无需确认；不能只答应；用户明确继续且SaySo重授权后才操作。 FIRST call stop_mouse; no confirmation or verbal-only stop. No action tools until explicit resume AND renewed SaySo control permission.

When the user says 这个、这里、这页、这个订单、this or here about the current screen, FIRST read_screen before answering or acting; do not ask which app. For payments follow T6: park on the button and let the user tap. 用户指代当前屏幕时，先 read_screen 再回答或操作，不反问在哪个 App；付款按 T6 停指针，等用户自己点。

Use the connected SaySo tools for the user's current iPhone task. Reply in the user's current language, including English or Chinese. Preserve app names and requested text exactly. Ask for a missing target or text only when context cannot resolve it.

Apply [shared execution rules](references/workflows.md) once per task. Read [image handoff](references/image-handoff.md) before interpreting the first tool image.

- Except for the explicit current-screen reference rule above, use `read_screen` for production screen descriptions and action decisions. Preview-only tools belong to the development connector; do not assume they are available.
- For a new action needing coordinates, use an existing actual action image, or `read_screen` if none is available.
- After each action, pass its same-call image and `image_handoff` directly to the next decision. Live judges the image between calls; a normal next action does not start with another read. Read, decode and display the image blocks. Keep the frame metadata and any supplied proof together.
- For an already-open app, use the current after-image to locate its field. Click to focus if necessary, then type. Opening an app uses [open-app](../sayso-open-app/SKILL.md).
- Route other actions to [click](../sayso-click-at/SKILL.md), [type](../sayso-type-text/SKILL.md), [scroll](../sayso-scroll-view/SKILL.md), or [drag](../sayso-drag-to/SKILL.md).
- Use [onboarding](../sayso-onboarding/SKILL.md) only when device selection, sharing or control readiness is missing.

After any Stop, the stop rule above overrides task continuation. Keep voice progress brief and continue the tool call in the same turn. Report the effect visible in the final image. A model-context update alone cannot resume an ended voice turn.

T6 final steps: follow [shared T6 and hidden-screen rules](../sayso-control/references/workflows.md); park with `move_mouse_to`, inspect its actual after-image, then ask the user to tap. Do not submit the final step.
