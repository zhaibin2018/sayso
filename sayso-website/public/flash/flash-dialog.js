export const dialogCopy = {
  zh: {
    confirm: "确认安装",
    confirmBody: "确定要给配件安装 SaySo 0.6.1 吗？会清空配件上原来的数据。",
    install: "确认安装",
    back: "返回",
    close: "关闭",
    finished: "安装好了！",
    finishedBody: "拔下来插到 iPhone 上，打开 SaySo。",
    preparing: "正在准备…",
    erasing: "正在清空旧数据…",
    writing: "正在安装…",
    verifying: "正在核对安装结果…",
    restarting: "正在完成安装…",
    keep: "预计 1–2 分钟。保持数据线连接，不要关闭网页。",
    slow: "准备已超过 1 分钟。请换一根能传数据的线，或换一个 USB 口，再按第 2 步重新进入刷写模式。请勿在清空、安装或核对时拔线。",
    error: "这次没装好",
    noPort:
      "刚才没选配件？请再点“开始刷写”，选 USB JTAG/serial debug unit（不要选 PCI Serial Port），再点“连接”。",
    connectionFailed:
      "没能连上配件。关闭其他占用配件的串口工具，换能传数据的线或 USB 口，再按第 2 步重新进入刷写模式。",
    wrongDevice:
      "选中的设备不是支持的 AtomS3 Lite。请重新点“开始刷写”，选择 USB JTAG/serial debug unit，不要选 PCI Serial Port。",
    safetyFailed:
      "配件的安全状态或身份核对没通过，已停止安装。请确认是 AtomS3 Lite，按第 2 步重试；仍失败请查看帮助。",
    checkFailed:
      "固件文件核对失败，已停止安装。检查网络后刷新页面；不要使用来源不明的固件。",
    toolFailed:
      "刷写工具没加载成功，已停止安装。请检查网络后刷新页面，再点“开始刷写”。",
    writeFailed:
      "安装中断了。请换能传数据的线或 USB 口，重新进入刷写模式，再从“开始刷写”重试。刷好前先不要接 iPhone。",
    verifyFailed:
      "安装结果没能核对通过。请换能传数据的线或 USB 口，重新进入刷写模式并安装；刷好前先不要接 iPhone。",
    progressLabel: "安装进度",
  },
  en: {
    confirm: "Confirm installation",
    confirmBody:
      "Install SaySo 0.6.1 on this accessory? This will erase all data currently on it.",
    install: "Install SaySo",
    back: "Back",
    close: "Close",
    finished: "All installed!",
    finishedBody:
      "Unplug the accessory, connect it to your iPhone, and open SaySo.",
    preparing: "Getting ready…",
    erasing: "Clearing old data…",
    writing: "Installing…",
    verifying: "Checking the installation…",
    restarting: "Finishing up…",
    keep: "Allow 1–2 minutes. Keep the cable connected and this page open.",
    slow: "Getting ready has taken over a minute. Try another data cable or USB port, then repeat step 2 to enter flashing mode. Keep the cable connected during clearing, installing and checking.",
    error: "Installation didn’t finish",
    noPort:
      "Didn’t select the accessory? Click “Start flashing” again, choose USB JTAG/serial debug unit (not PCI Serial Port), then click Connect.",
    connectionFailed:
      "We couldn’t connect to the accessory. Close other serial tools, try another data cable or USB port, then repeat step 2 to enter flashing mode.",
    wrongDevice:
      "The selected device isn’t a supported AtomS3 Lite. Click “Start flashing” again and choose USB JTAG/serial debug unit, not PCI Serial Port.",
    safetyFailed:
      "The accessory’s security or identity check didn’t pass, so installation stopped. Check that it’s an AtomS3 Lite and repeat step 2. If it fails again, see the help below.",
    checkFailed:
      "The firmware file check failed, so installation stopped. Check your connection and reload. Only use firmware from a trusted source.",
    toolFailed:
      "The flashing tool couldn’t load, so installation stopped. Check your connection, reload, then click “Start flashing” again.",
    writeFailed:
      "Installation was interrupted. Try another data cable or USB port, enter flashing mode again, then click “Start flashing”. Finish installing before connecting to your iPhone.",
    verifyFailed:
      "The installation check didn’t pass. Try another data cable or USB port, enter flashing mode again and reinstall before connecting to your iPhone.",
    progressLabel: "Installation progress",
  },
};

export function createFlashDialog({ language, onLanguage, onInstall }) {
  const dialog = document.createElement("dialog");
  dialog.className = "flash-dialog";
  dialog.setAttribute("aria-labelledby", "flash-dialog-title");
  dialog.setAttribute("aria-describedby", "flash-dialog-body");
  // Static DOM only: no error messages, device names or network data are HTML.
  dialog.innerHTML = `<div class="dialog-top"><span>SaySo · AtomS3 Lite</span><nav aria-label="Language"><button type="button" lang="zh-CN" data-lang="zh">中文</button><button type="button" lang="en" data-lang="en">English</button></nav></div><h2 id="flash-dialog-title"></h2><p id="flash-dialog-body" role="status" aria-live="polite"></p><progress max="100"></progress><p class="dialog-hint"></p><p class="dialog-warning" role="status" hidden></p><div class="dialog-actions"><button type="button" class="secondary" data-action="close"></button><button type="button" class="primary" data-action="install"></button></div>`;
  document.body.append(dialog);
  const el = (selector) => dialog.querySelector(selector);
  let state = { phase: "confirm" },
    lang = language;
  const busy = () => !["confirm", "finished", "error"].includes(state.phase);
  function render(next = state, locale = lang) {
    state = next;
    lang = locale;
    const t = dialogCopy[lang],
      active = busy();
    dialog.dataset.phase = state.phase;
    dialog.lang = lang === "zh" ? "zh-CN" : "en";
    el("h2").textContent = t[state.phase] || t.preparing;
    el("#flash-dialog-body").textContent =
      state.phase === "confirm"
        ? t.confirmBody
        : state.phase === "finished"
          ? t.finishedBody
          : state.phase === "error"
            ? t[state.error] || t.writeFailed
            : t.keep;
    const progress = el("progress");
    progress.hidden = !active;
    progress.setAttribute("aria-label", t.progressLabel);
    if (Number.isFinite(state.percent)) progress.value = state.percent;
    else progress.removeAttribute("value");
    el(".dialog-hint").textContent =
      active && Number.isFinite(state.percent)
        ? `${Math.floor(state.percent)}%`
        : "";
    el(".dialog-warning").hidden = !state.slow;
    el(".dialog-warning").textContent = t.slow;
    el('[data-action="install"]').hidden = state.phase !== "confirm";
    el('[data-action="install"]').textContent = t.install;
    el('[data-action="close"]').hidden = active;
    el('[data-action="close"]').textContent =
      state.phase === "confirm" ? t.back : t.close;
    for (const button of dialog.querySelectorAll("[data-lang]"))
      button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
  }
  for (const button of dialog.querySelectorAll("[data-lang]"))
    button.addEventListener("click", () => onLanguage(button.dataset.lang));
  el('[data-action="close"]').addEventListener("click", () => dialog.close());
  el('[data-action="install"]').addEventListener("click", () => {
    if (state.phase === "confirm") onInstall();
  });
  dialog.addEventListener("cancel", (event) => {
    if (busy()) event.preventDefault();
  });
  const previousFocus = document.activeElement;
  dialog.addEventListener(
    "close",
    () => {
      dialog.remove();
      previousFocus?.focus();
    },
    { once: true },
  );
  render();
  return {
    element: dialog,
    render,
    show() {
      dialog.showModal();
      el(
        state.phase === "confirm"
          ? '[data-action="install"]'
          : '[data-action="close"]',
      ).focus();
    },
  };
}
