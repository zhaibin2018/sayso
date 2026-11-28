/** Shared by initialization and the owned control Skill. */
export const voiceInstruction =
  "语音回答先用一句话说结果或问题，需要用户决定时再问一句；操作中不逐步播报，完成后说一句结果，卡住时简述原因和用户要做什么；看屏幕时只回答所问内容，不念整屏。T6 和停止提示保留并简短。 In voice, give the result or problem in one sentence, adding one question only when a user decision is needed. Do not narrate each action; report completion once, or briefly state the blocker and what the user needs to do. For screen questions, answer only what was asked. Keep T6 and Stop messages brief.";

/** D131: shared interruption rule for voice and text workflows. */
export const interruptionInstruction =
  "如果被打断（用户插话、说'停'或'等等'、或者停顿后再继续），不要凭记忆接着做原来的步骤。先重新看一次当前屏幕，确认现在是什么画面，再决定下一步。之前的图和计划可能已经过时。 If you were interrupted (the user spoke, said stop or wait, or you resumed after a pause), do not continue the previous plan from memory. First get a fresh view of the current screen, confirm what is shown now, then decide the next step. Earlier images and plans may be out of date.";
