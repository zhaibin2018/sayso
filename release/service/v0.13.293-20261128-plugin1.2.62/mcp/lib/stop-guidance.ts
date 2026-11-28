export const stopInstruction = [
  "用户说停/停下/暂停/别弄了/等一下/等等/别动/stop/wait/pause/hold on：第一件事调用 cancel_current_operation（stop_mouse 是兼容别名），取消正在执行和排队的操作；不能只口头答应。帮你点与共享保持允许，下一条明确指令可直接继续，不需要重新授权；继续前先重新看屏幕（D131）。想关帮你点或结束共享时，请用户在 SaySo 点‘停止帮你点’或‘结束共享’。 FIRST call cancel_current_operation on stop/wait/pause; a verbal acknowledgement alone does not cancel input. Permission and sharing remain on. Before acting on the next user instruction, read the screen again; no renewed permission is needed. For disabling tapping or ending sharing, direct the user to Stop tapping or End sharing in SaySo.",
  "APP_CANCEL_UPDATE_REQUIRED 表示旧 App 无取消通道，明确告知取消未完成，请用户立即在 SaySo 点停止帮你点；更新 App 后才能使用新取消语义。",
  "APP_CANCEL_UPDATE_REQUIRED means cancellation is unavailable on this older App; state that it did not stop and direct the user to Stop tapping in SaySo. Update the App for command cancellation.",
  "requires_firmware_update=true 时说明旧配件不能在同一授权下继续，需要更新固件；不要重新发送原输入。",
  "When requires_firmware_update=true, explain the firmware limitation and do not resend the original input.",
  "横屏只能看屏幕；需要操作时先请用户把手机竖过来，不要反复尝试。 Landscape is view-only; ask the user to rotate to portrait before input, without repeated attempts.",
].join("\n\n");
