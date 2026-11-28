import { installHelp } from "./flash-copy.js";

export const dialogCopy = {
  zh: {
    confirm: "确认安装",
    confirmBody: "安装 SaySo 会清空此配件的所有数据。确认后开始安装。" + installHelp.zh.waitForInstallation,
    install: "确认安装",
    back: "返回",
    close: "关闭",
    finished: "安装好了！",
    finishedBody: "把配件接到 iPhone，再打开 SaySo 开始配对。",
    preparing: "正在准备…",
    erasing: "正在清空旧数据…",
    writing: "正在安装…",
    verifying: "正在核对安装结果…",
    restarting: "正在完成安装…",
    keep: "预计 1–2 分钟。保持数据线连接和网页打开，让安装能够完成。",
    slow: "准备已超过 1 分钟。" + installHelp.zh.downloadMode,
    error: "这次没装好",
    noPort:
      "刚才没选配件？请再点“开始安装”，选 USB JTAG/serial debug unit，再点“连接”。",
    connectionFailed: "没能连上配件。" + installHelp.zh.serialPort,
    wrongDevice:
      "选中的设备不是支持的 AtomS3 Lite。请重新点“开始安装”，选择 USB JTAG/serial debug unit。",
    safetyFailed: [
      "无法确认这是 AtomS3 Lite（C124），安装已停止。请核对包装上的型号：如果不是，请看“",
      "去哪里买配件",
      "”；如果是 C124，请重做第 2 步。",
    ],
    checkFailed: installHelp.zh.fileCheck,
    toolFailed:
      "安装工具未能加载，已停止安装。请检查网络并刷新页面，重新加载工具，再点“开始安装”。",
    writeFailed:
      "安装中断了。请换能传数据的线或 USB 口，重新进入下载模式，再从“开始安装”重试。安装完成后即可和 iPhone 配对。",
    verifyFailed:
      "安装结果没能核对通过。请换能传数据的线或 USB 口，重新进入下载模式并安装；安装完成后即可和 iPhone 配对。",
    progressLabel: "安装进度",
  },
  en: {
    confirm: "Confirm installation",
    confirmBody: "Installing SaySo erases all data on this accessory. Confirm to begin. " + installHelp.en.waitForInstallation,
    install: "Install SaySo",
    back: "Back",
    close: "Close",
    finished: "All installed!",
    finishedBody:
      "Connect the accessory to your iPhone and open SaySo to pair it.",
    preparing: "Getting ready…",
    erasing: "Clearing old data…",
    writing: "Installing…",
    verifying: "Checking the installation…",
    restarting: "Finishing up…",
    keep: "This usually takes 1–2 minutes. Keep the cable connected and this page open so installation can finish.",
    slow: "Getting ready has taken over a minute. " + installHelp.en.downloadMode,
    error: "Installation didn’t finish",
    noPort:
      "Didn’t select the accessory? Click “Start installation” again, choose USB JTAG/serial debug unit, then click Connect.",
    connectionFailed: "We couldn’t connect to the accessory. " + installHelp.en.serialPort,
    wrongDevice:
      "The selected device isn’t a supported AtomS3 Lite. Click “Start installation” again and choose USB JTAG/serial debug unit.",
    safetyFailed: [
      "We couldn’t confirm this is an AtomS3 Lite (C124), so installation stopped. Check the model on the box. If it’s a different model, see ",
      "Where to buy",
      ". If it is a C124, repeat step 2.",
    ],
    checkFailed: installHelp.en.fileCheck,
    toolFailed:
      "The installation tool couldn’t load, so installation stopped. Check your connection and reload to load the tool, then click “Start installation” again.",
    writeFailed:
      "Installation was interrupted. Try another data cable or USB port, enter download mode again, then click “Start installation”. A complete installation is required for iPhone pairing.",
    verifyFailed:
      "The installation check didn’t pass. Try another data cable or USB port, enter download mode again and reinstall. A complete installation is required for iPhone pairing.",
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
    const body = el("#flash-dialog-body");
    if (state.phase === "error" && state.error === "safetyFailed") {
      const [before, label, after] = t.safetyFailed;
      const link = document.createElement("a");
      link.href = "../#/buy";
      link.textContent = label;
      body.replaceChildren(before, link, after);
    } else {
      body.textContent =
        state.phase === "confirm"
          ? t.confirmBody
          : state.phase === "finished"
            ? t.finishedBody
            : state.phase === "error"
              ? t[state.error] || t.writeFailed
              : t.keep;
    }
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
