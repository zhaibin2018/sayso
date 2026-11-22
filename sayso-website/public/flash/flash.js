import { verifyBundle, canInstall } from "./flash-policy.js";
import { preparationIsSlow } from "./flash-progress.js";
import { getLanguage, rememberLanguage } from "../language.js";
import { loadTool, flashDevice } from "./flash-device.js";
import { createFlashDialog } from "./flash-dialog.js";
const zh = Object.fromEntries(
  [...document.querySelectorAll("[data-copy]")].map((el) => [
    el.dataset.copy,
    el.textContent,
  ]),
);
Object.assign(zh, {
  desktopOnly: "请用电脑打开",
  install: "开始刷写",
  verified: "固件文件核对通过，可以开始。",
  failed: "文件核对失败。请检查网络后刷新页面。",
  unsupported: "请在 Windows / Mac 电脑的 Chrome 或 Edge 打开本页。",
  cdnFailed: "刷写工具没加载成功，请检查网络后刷新。",
});
const en = {
  zoomHint: "Tap any image to enlarge it.",
  desktopOnly: "Open on a computer",
  title: "Install SaySo on your accessory",
  intro:
    "For the SaySo accessory (M5Stack AtomS3 Lite). Follow three steps; flashing usually takes 1–2 minutes.",
  erase:
    "First time? You can start right away. If it was installed before, flashing clears its previous pairing.",
  step1: "Prepare a computer and data cable (leave unplugged)",
  cable:
    "Open this page in Chrome or Edge on a Windows PC or Mac. Use a cable that transfers files; a charge-only cable will not work. Leave the accessory unplugged from both computer and iPhone for now.",
  prepareCaption:
    "Look for the white square AtomS3 Lite, with a large front button and small side reset button. Accessory diagram, not a photo.",
  step2: "Connect to the computer, then hold the side reset button",
  modeConnect:
    "Connect the accessory to your computer with the data cable. Keep it connected.",
  modeHold:
    "Hold the small side reset button for about 2 seconds until the internal green light comes on, then release. Do not use the large front button.",
  modeReady:
    "The green light turns off after release: it is now in download (flashing) mode. Leave the cable connected and continue to step 3.",
  modeCaption:
    "The small side reset button enters download mode. Use the large front button later for pairing. Diagram based on the official M5Stack structure.",
  step3: "Start flashing, choose the accessory, then install",
  choose:
    "Select “Start flashing” below to open the computer’s device chooser. Select the accessory you just connected, then Connect.",
  pickerCaption:
    "Chrome serial chooser diagram: skip PCI Serial Port (COM3), select USB JTAG/serial debug unit (COM5), then Connect. COM numbers vary by computer. Mac may also show usbmodem.",
  portHelp:
    "Do not choose PCI Serial Port. Look for USB JTAG/serial debug unit. If it is missing, cancel, try another data cable or USB port, then repeat step 2.",
  confirmCaption:
    "① After selecting the accessory, confirm installation directly. Installing clears its previous data.",
  progressCaption:
    "② Wait for installation and checking, usually 1–2 minutes. Stay connected. If preparation takes over a minute, follow the cable or USB port advice.",
  successCaption:
    "③ When you see “All installed!”, close the dialog, unplug the accessory, connect it to your iPhone, and open SaySo.",
  screenNote:
    "These are demonstration screenshots of this website’s dialogs, not a physical flash performed in this run. Dialogs use this page’s language.",
  after: "After flashing, pair it with your iPhone",
  done: "Unplug it, connect it to your unlocked USB-C iPhone, and open SaySo.",
  pair: "When SaySo finds the accessory or shows a pairing prompt, follow its instructions. Press the large front button only when asked, then wait for SaySo to confirm pairing.",
  pairCaption:
    "Connection and pairing diagram; follow the actual App screen. A USB-C iPhone is required. After pairing, follow SaySo to allow tapping.",
  help: "Can’t find the accessory, or stuck preparing?",
  slow: "Try another data cable or another USB port.",
  helpBody:
    "Close other serial tools and repeat step 2. If flashing fails, reconnect to the computer and reinstall before using it with your iPhone.",
  official: "M5Stack download mode guide",
  driver: "Computer connection help",
  details: "Version and verification",
  version: "Version",
  acceptance:
    "For the SaySo accessory (M5Stack AtomS3 Lite) and USB-C iPhones. No need to reinstall if your accessory already has 0.6.1.",
  back: "Get started",
  support: "Need help?",
  privacy: "Privacy",
  install: "Start flashing",
  verified: "Firmware file verified. Ready to start.",
  failed: "The file check failed. Check your connection and reload.",
  unsupported: "Open this page in Chrome or Edge on a Windows PC or Mac.",
  cdnFailed:
    "The flashing tool could not load. Check your connection and reload.",
  locked: "Preparing…",
  checking: "Checking the firmware file…",
};
const imageAlts = {
  prepare: [
    "准备电脑、数据线与白色 AtomS3 Lite，先别插线",
    "Computer, data cable and white AtomS3 Lite, left unplugged",
  ],
  "download-mode": [
    "已接数据线；长按侧边复位键约 2 秒至绿灯亮，再松手",
    "Cable connected; hold side reset about 2 seconds until green, then release",
  ],
  "port-picker": [
    "串口选择示意：选择 USB JTAG/serial debug unit 后连接",
    "Serial chooser diagram: select USB JTAG/serial debug unit, then Connect",
  ],
  "pair-iphone": [
    "配件接到 USB-C iPhone，打开 SaySo 按提示配对",
    "Accessory connected to USB-C iPhone; open SaySo and follow pairing prompts",
  ],
};
const screenAlts = {
  confirm: [
    "官网安装弹窗确认窗口示例",
    "Website installer confirmation dialog example",
  ],
  progress: [
    "官网安装弹窗进度窗口示例",
    "Website installer progress dialog example",
  ],
  success: [
    "官网安装弹窗 安装完成窗口示例",
    "Website installer completion dialog example",
  ],
};

Object.assign(zh, {
  acceptance:
    "适用于 SaySo 配件（M5Stack AtomS3 Lite）和 USB-C iPhone。已经装好 0.6.1 的配件无需重刷。",
  pickerCaption:
    "Chrome 选端口窗口示意：不要选 PCI Serial Port (COM3)，选 USB JTAG/serial debug unit (COM5)，再点“连接”。COM 号因电脑而异；Mac 也可能显示 usbmodem。",
  portHelp:
    "不要选 PCI Serial Port。找 USB JTAG/serial debug unit；没有这一项时先取消，换能传数据的线或 USB 口，再重做第 2 步。",
  confirmCaption: "① 选好配件后，直接确认安装。安装会清空配件原来的数据。",
  progressCaption:
    "② 等待安装和核对，预计 1–2 分钟。保持连接；准备超过 1 分钟时按提示换线或 USB 口。",
  successCaption:
    "③ 看到“安装好了！”，关闭窗口，拔下来插到 iPhone 上，打开 SaySo。",
  screenNote:
    "以下为同版官网弹窗的演示截图，非本次实物刷写记录。弹窗语言与本页一致。",
});

let lang = getLanguage(),
  verificationState = "checking",
  installerFailed = false;
let bundle,
  tool,
  active = false,
  flashing = false,
  modal,
  currentState;
const supported = window.isSecureContext && "serial" in navigator;
function render() {
  const t = lang === "zh" ? zh : en;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = t.title + " · SaySo";
  document.querySelectorAll("[data-copy]").forEach((el) => {
    el.textContent = t[el.dataset.copy] ?? el.textContent;
  });
  for (const locale of ["zh", "en"])
    document
      .getElementById(locale)
      .setAttribute("aria-pressed", String(lang === locale));
  const status = document.getElementById("verification");
  status.dataset.state = verificationState;
  status.textContent =
    t[
      verificationState === "verified"
        ? "verified"
        : verificationState === "error"
          ? "failed"
          : "checking"
    ];
  const button = document.querySelector("#install-area button");
  button.disabled =
    active ||
    !supported ||
    !bundle ||
    !tool ||
    verificationState !== "verified";
  button.textContent = !supported
    ? t.desktopOnly
    : verificationState === "verified"
      ? t.install
      : t.locked;
  const browserStatus = document.getElementById("browser-status");
  browserStatus.hidden = supported && !installerFailed;
  browserStatus.textContent = installerFailed
    ? t.cdnFailed
    : !supported
      ? t.unsupported
      : "";
  document.querySelectorAll("[data-image]").forEach((img) => {
    img.src = new URL(
      `images/${img.dataset.image}-${lang}.svg`,
      location.href,
    ).href;
    img.parentElement.href = img.src;
    img.alt = imageAlts[img.dataset.image][lang === "zh" ? 0 : 1];
  });
  document.querySelectorAll("[data-static-image]").forEach((img) => {
    img.src = new URL(
      `images/install-${img.dataset.staticImage}-${lang}.png`,
      location.href,
    ).href;
    img.parentElement.href = img.src;
    img.alt = screenAlts[img.dataset.staticImage][lang === "zh" ? 0 : 1];
  });
  document.getElementById("official-link").href =
    `https://docs.m5stack.com/${lang === "zh" ? "zh_CN" : "en"}/core/AtomS3-Lite`;
  if (modal && currentState) modal.render(currentState, lang);
}
function changeLanguage(locale) {
  lang = locale;
  rememberLanguage(locale);
  render();
}
for (const locale of ["zh", "en"])
  document
    .getElementById(locale)
    .addEventListener("click", () => changeLanguage(locale));
window.addEventListener("storage", (event) => {
  if (event.key === "sayso-language") {
    lang = getLanguage();
    render();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (flashing) {
    event.preventDefault();
    event.returnValue = "";
  }
});
function show(state, onInstall = () => {}) {
  currentState = state;
  modal = createFlashDialog({
    language: lang,
    onLanguage: changeLanguage,
    onInstall,
  });
  modal.render(state, lang);
  modal.element.addEventListener(
    "close",
    () => {
      modal = null;
      currentState = null;
      active = false;
      render();
      document.querySelector("#install-area button").focus();
    },
    { once: true },
  );
  modal.show();
}
document
  .querySelector("#install-area button")
  .addEventListener("click", async () => {
    if (
      active ||
      !bundle ||
      !tool ||
      !supported ||
      verificationState !== "verified"
    )
      return;
    active = true;
    render();
    let port;
    try {
      // Must run in the original click activation. Never enumerate or open a port on page load.
      port = await navigator.serial.requestPort();
    } catch (error) {
      show({
        phase: "error",
        error: error.name === "NotFoundError" ? "noPort" : "connectionFailed",
      });
      return;
    }
    if (!port) {
      show({ phase: "error", error: "noPort" });
      return;
    }
    show({ phase: "confirm" }, async () => {
      if (flashing) return;
      flashing = true;
      let startedAt = Date.now();
      const update = (state) => {
        if (state.phase !== "preparing") startedAt = null;
        currentState = state;
        modal.render(state, lang);
      };
      update({ phase: "preparing" });
      const timer = setInterval(() => {
        if (preparationIsSlow(currentState.phase, startedAt, Date.now())) {
          currentState = { ...currentState, slow: true };
          modal.render(currentState, lang);
        }
      }, 500);
      try {
        await flashDevice(port, bundle, tool, update);
        update({ phase: "finished" });
      } catch (error) {
        const known = [
          "wrongDevice",
          "safetyFailed",
          "verifyFailed",
          "checkFailed",
          "connectionFailed",
        ];
        const code = known.includes(error.message)
          ? error.message
          : /MANIFEST|SHA256/.test(error.message)
            ? "checkFailed"
            : ["preparing"].includes(currentState.phase)
              ? "connectionFailed"
              : "writeFailed";
        update({ phase: "error", error: code });
      } finally {
        clearInterval(timer);
        flashing = false;
      }
    });
  });
render();
async function json(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw Error("FETCH_FAILED");
  return response.json();
}
try {
  const [release, manifest] = await Promise.all([
    json("./firmware/release.json"),
    json("./firmware/manifest.json"),
  ]);
  document.getElementById("version").textContent = release.version;
  document.getElementById("sha256").textContent = release.sha256;
  if (!/^sayso-c124-[a-zA-Z0-9.-]+\.bin$/.test(release.file))
    throw Error("INVALID_FILE");
  const response = await fetch(`./firmware/${release.file}`, {
    cache: "no-store",
  });
  if (!response.ok) throw Error("FETCH_FAILED");
  const bytes = await response.arrayBuffer();
  await verifyBundle(manifest, release, bytes);
  verificationState = "verified";
  try {
    tool = await loadTool();
  } catch {
    installerFailed = true;
  }
  if (
    canInstall(release, {
      secure: window.isSecureContext,
      serial: "serial" in navigator,
      verified: true,
      installerLoaded: !!tool,
    })
  ) {
    bundle = { release, manifest, bytes };
  }
} catch {
  verificationState = "error";
}
render();
