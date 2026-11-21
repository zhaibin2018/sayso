import { verifyBundle, canInstall, INSTALLER_URL } from "./flash-policy.js";

const zh = {
  eyebrow: "配件准备",
  title: "给 C124 安装 SaySo 固件",
  intro: "准备好 M5Stack AtomS3-Lite（C124），刷好后回到 iPhone 上配对。",
  previewTitle: "正式 USB 固件 · 0.6.0",
  previewBody:
    "本页只提供 C124 USB 正式配置。安装会完整擦除配件及配对资料；新 PID 的真机兼容性仍待验收。当前为未发布的本地候选。",
  firmware: "将要安装的固件",
  version: "版本",
  profile: "配置",
  profileValue: "C124 · 仅 USB-C · 本地按键开启 · Wi-Fi／BLE 关闭",
  checking: "正在检查 manifest 和固件文件…",
  locked: "校验完成后可安装",
  before: "开始前准备",
  desktop:
    "使用 Windows 或 Mac 电脑上的 Chrome／Edge。Web Serial 需要 HTTPS；本地预览也可通过 localhost 使用。",
  cable: "使用能传数据的 USB-C 线。只能充电的线会让板子亮灯，但无法刷写。",
  target:
    "只准备全新 C124，原来的测试板请保持断开。正式固件用于 USB-C iPhone，具体机型兼容性仍待验收。",
  erase:
    "安装会擦除配件原来的内容和配对资料。如果板子装过其他固件，请先备份需要的内容。",
  steps: "进入刷写模式，再安装",
  step1: "用 USB-C 数据线把 C124 接到电脑。",
  step2:
    "长按侧面的复位／电源按钮约 2 秒，等内部绿灯亮起再松开。松开后绿灯熄灭，表示已进入下载（刷写）模式。这里按的是侧面复位按钮，与大配对按钮不同。",
  step3:
    "核对版本 0.6.0 和 SHA-256，等校验通过，再点“安装固件”，在浏览器弹窗中选择 ESP32-S3 串口。",
  step4:
    "在 ESP Web Tools 弹窗中确认安装。过程中保持数据线连接，不要关闭网页，等待显示安装完成。",
  step5:
    "刷完后拔下配件，插到已解锁的 USB-C iPhone 上，在 SaySo 里按提示配对。",
  official: "M5Stack 官方 C124 下载模式说明",
  holdNote:
    "如果之前听到“按住按钮再插线”，请以这里核实的官方顺序为准：先接线，长按侧面复位按钮至绿灯亮，再松开。",
  pair: "刷完后：回 SaySo 配对",
  pairBody:
    "解锁 iPhone 并插入配件。在 SaySo 里按“发现配件”的提示操作，提示按键时，按一下 C124 的大按钮，等待配对完成。板子第一次开机会自己生成身份，不用导入编号或密钥。",
  pairTimeout:
    "配对超时后，可在 SaySo 里重新开始。双击会取消这次配对，长按不会批准配对。",
  help: "遇到问题",
  noDevice: "串口列表里找不到设备",
  noDeviceBody:
    "确认已进入下载模式，换一根数据线、换电脑直连 USB 口，并关闭其他串口工具。在 Windows“设备管理器”中查看 ESP32-S3 USB 串口设备，选择插入全新 C124 时新出现的端口。",
  driver: "Windows 提示驱动异常",
  driverBody:
    "重新进入下载模式，并检查 Windows 更新。C124 用 ESP32-S3 内置 USB Serial/JTAG，不是 CP210x 或 CH340 转接芯片。仍显示未知设备时，按乐鑫文档排查对应接口；不要替换正常运行时的 SaySo HID 或网卡驱动。",
  driverLink: "乐鑫 USB Serial/JTAG 驱动说明",
  interrupted: "刷写中断或失败",
  interruptedBody:
    "先不要插到 iPhone。关闭刷写弹窗，重新进入下载模式，检查线材，再从头安装经批准的正式版。刷写期间保持供电。",
  reset: "重置，或换一台 iPhone",
  resetBody:
    "配件插在旧 iPhone 上时，先在 SaySo 里移除，再到新手机配对。没有插着配件时移除，只会清掉那台手机上的资料。旧手机或配对密钥丢失时，需要用经批准的正式版完整擦除后重刷；这会删除配对，板子首次开机生成新身份。普通重启或保留 NVS 的刷写不能重置配对。",
  hashError: "校验失败，或刷写工具加载不出来",
  hashErrorBody:
    "检查网络后刷新网页。SHA-256 不一致会禁止安装。刷写工具从 jsDelivr 加载固定版本；网络拦截时可换网络重试，请勿跳过校验。",
  support: "遇到问题",
  privacy: "隐私",
  verified: "固件 SHA-256 与固定 0.6.0 发布信息一致。",
  failed: "固件校验失败，已禁止安装。请检查网络并刷新网页。",
  supported: "本机 Web Serial 可用（安全页面）。尚未请求或打开串口。",
  unsupported:
    "本机无法使用 Web Serial。请在 Windows／Mac 的 Chrome 或 Edge 中，通过 HTTPS 或 localhost 打开。",
  cdnFailed: "刷写工具加载失败；安装保持禁用。请检查网络后刷新。",
  install: "安装固件",
};
const en = Object.fromEntries(
  [...document.querySelectorAll("[data-copy]")].map((el) => [
    el.dataset.copy,
    el.textContent,
  ]),
);
Object.assign(en, {
  verified:
    "Firmware SHA-256 matches the pinned 0.6.0 release metadata.",
  failed:
    "Firmware verification failed. Installation is blocked. Check your connection and reload.",
  supported:
    "Web Serial is available in this secure page. No serial port has been requested or opened.",
  unsupported:
    "Web Serial is unavailable. Open this page on Windows/Mac Chrome or Edge, using HTTPS or localhost.",
  cdnFailed:
    "The installer could not load. Installation remains disabled. Check your connection and reload.",
  install: "Install firmware",
});
let lang = "en",
  verificationState = "checking",
  installerFailed = false;
try {
  const saved = localStorage.getItem("sayso-language");
  lang =
    saved === "zh" || saved === "en"
      ? saved
      : (navigator.languages || [navigator.language]).some((value) =>
            value?.startsWith("zh"),
          )
        ? "zh"
        : "en";
} catch {
  /* Browser preference remains optional. */
}
const supported = window.isSecureContext && "serial" in navigator;
function render() {
  const t = lang === "zh" ? zh : en;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = `${t.title} · SaySo`;
  document.querySelectorAll("[data-copy]").forEach((el) => {
    el.textContent = t[el.dataset.copy];
  });
  for (const locale of ["zh", "en"])
    document
      .getElementById(locale)
      .setAttribute("aria-pressed", String(lang === locale));
  document.getElementById("verification").textContent =
    t[
      verificationState === "verified"
        ? "verified"
        : verificationState === "error"
          ? "failed"
          : "checking"
    ];
  document.getElementById("verification").dataset.state = verificationState;
  document.getElementById("browser-status").textContent =
    t[installerFailed ? "cdnFailed" : supported ? "supported" : "unsupported"];
}
for (const locale of ["zh", "en"])
  document.getElementById(locale).addEventListener("click", () => {
    lang = locale;
    try {
      localStorage.setItem("sayso-language", locale);
    } catch {
      /* Optional storage. */
    }
    render();
  });
render();
async function json(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error("FETCH_FAILED");
  return response.json();
}
try {
  const [release, manifest] = await Promise.all([
    json("./firmware/release.json"),
    json("./firmware/manifest.json"),
  ]);
  document.getElementById("version").textContent = release.version;
  document.getElementById("sha256").textContent = release.sha256;
  // Validate the path before fetching; metadata may never redirect firmware reads to another origin.
  if (!/^sayso-c124-[a-zA-Z0-9.-]+\.bin$/.test(release.file))
    throw new Error("INVALID_FILE");
  const response = await fetch(`./firmware/${release.file}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("FETCH_FAILED");
  await verifyBundle(manifest, release, await response.arrayBuffer());
  verificationState = "verified";
  let installerLoaded = false;
  try {
    await import(INSTALLER_URL);
    installerLoaded = !!customElements.get("esp-web-install-button");
  } catch {
    installerFailed = true;
  }
  if (
    canInstall(release, {
      secure: window.isSecureContext,
      serial: "serial" in navigator,
      verified: true,
      installerLoaded,
    })
  ) {
    const installer = document.createElement("esp-web-install-button");
    installer.setAttribute("manifest", "./firmware/manifest.json");
    const button = document.createElement("button");
    button.slot = "activate";
    button.dataset.copy = "install";
    installer.append(button);
    document.getElementById("install-area").replaceChildren(installer);
  }
} catch {
  verificationState = "error";
}
render();
