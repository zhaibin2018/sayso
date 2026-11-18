import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle,
  Circle,
  CircleNotch,
  Cpu,
  Info,
  Moon,
  Sun,
  Usb,
  WarningCircle,
  CaretDown,
  CaretRight,
  Copy,
  Monitor,
  ShieldCheck,
} from "@phosphor-icons/react";
import { MODELS, compatibility, environment } from "./lib/policy.js";
import { loadRelease, downloadFirmware } from "./lib/release.js";
import { expiryStatus } from "./lib/expiry.js";
import {
  TRUSTED_RELEASE_KEYS,
  SOURCE_URL,
  RESTORE_GUIDE,
} from "./release-policy.js";
import { HelpDialog, External } from "./HelpDialog.jsx";
import { useWakeLock } from "./useWakeLock.js";
import {
  loadSiteLinks,
  normalizeSiteLinks,
  preferredLanguage,
  canLeaveForWebsite,
} from "./site-links.js";
const PREVIEW = __INSTALL_PREVIEW__;
const base = new URL(import.meta.env.BASE_URL, window.location.href);
const phases = ["download", "erase", "write", "verify", "restart"];
const readSetting = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const saveSetting = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* Optional preference. */
  }
};
const KNOWN_ERRORS = [
  "security-state",
  "device-chip",
  "device-size",
  "device-changed",
  "hash-mismatch",
  "image-chip",
  "readback-mismatch",
  "download-failed",
  "download-size",
  "unverified-release",
  "manifest-invalid",
  "signature-invalid",
  "release-expired",
  "preview-disconnect",
];

export function App() {
  const [lang, setLang] = useState(() =>
    preferredLanguage(readSetting("sayso-language"), navigator.languages),
  );
  const [theme, setTheme] = useState(() =>
    ["light","dark"].includes(readSetting("sayso-theme")) ? readSetting("sayso-theme") : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );
  const [siteLinks, setSiteLinks] = useState(() => normalizeSiteLinks());
  useEffect(() => {
    const abort = new AbortController();
    loadSiteLinks(base, abort.signal).then((links) => {
      if (!abort.signal.aborted) setSiteLinks(links);
    });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const sync = (event) => {
      if (
        event.key === "sayso-language" &&
        ["en", "zh"].includes(event.newValue)
      )
        setLang(event.newValue);
      if (
        event.key === "sayso-theme" &&
        ["dark", "light"].includes(event.newValue)
      )
        setTheme(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const [step, setStep] = useState(0),
    [model, setModel] = useState(""),
    [ios, setIOS] = useState(""),
    [checked, setChecked] = useState(false),
    [consent, setConsent] = useState(false);
  const [release, setRelease] = useState(null),
    [loading, setLoading] = useState(true),
    [releaseError, setReleaseError] = useState(null),
    [attempt, setAttempt] = useState(0);
  const [decision, setDecision] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [phase, setPhase] = useState("download"),
    [progress, setProgress] = useState(0),
    [result, setResult] = useState(null);
  const [clock, setClock] = useState(Date.now);
  const releaseTiming = expiryStatus(release, clock);
  const releaseExpired = releaseTiming.kind === "expired";
  useEffect(() => {
    if (!release || PREVIEW) return;
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [release]);
  const [modal, setModal] = useState(null),
    [copied, setCopied] = useState(false),
    [copyText, setCopyText] = useState(""),
    [failPreview, setFailPreview] = useState(false);
  const device = useRef(null),
    controller = useRef(null),
    heading = useRef(null),
    lock = useRef(false),
    liveStep = useRef(0);
  const t = (en, zh) => (lang === "zh" ? zh : en);
  const env = environment(navigator, window.isSecureContext),
    match = compatibility(model, release),
    installing = step === 3 && busy;
  const wake = useWakeLock(installing);
  const guardWebsiteNavigation = (event) => {
    if (!canLeaveForWebsite(busy, lock.current)) {
      event.preventDefault();
      setModal("navigation");
    }
  };
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    saveSetting("sayso-language", lang);
  }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveSetting("sayso-theme", theme);
  }, [theme]);
  useEffect(() => {
    const abort = new AbortController();
    let valid = true;
    setLoading(true);
    setReleaseError(null);
    (async () => {
      try {
        let current;
        if (__INSTALL_PREVIEW__)
          current = (await import("./preview.js")).previewRelease;
        else
          current = await loadRelease(base, TRUSTED_RELEASE_KEYS, abort.signal);
        if (valid) {
          setRelease(current);
          setClock(Date.now());
        }
      } catch (error) {
        if (valid && !abort.signal.aborted) {
          setRelease(null);
          setReleaseError(
            error.message === "release-expired"
              ? "release-expired"
              : "verification-failed",
          );
        }
      } finally {
        if (valid) setLoading(false);
      }
    })();
    return () => {
      valid = false;
      abort.abort();
    };
  }, [attempt]);
  useEffect(() => {
    liveStep.current = step;
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (!installing) return;
    const prevent = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [installing]);
  useEffect(() => {
    if (!navigator.serial || PREVIEW) return;
    const disconnected = async (e) => {
      if (
        device.current &&
        e.target === device.current.transport.device &&
        liveStep.current !== 3
      ) {
        await device.current.close().catch(() => {});
        device.current = null;
        setConsent(false);
        setStep(1);
        setError("device-disconnected");
      }
    };
    navigator.serial.addEventListener("disconnect", disconnected);
    return () =>
      navigator.serial.removeEventListener("disconnect", disconnected);
  }, []);
  useEffect(
    () => () => {
      controller.current?.abort();
      device.current?.close?.().catch(() => {});
    },
    [],
  );
  const copy = async (text) => {
    setCopyText(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setModal("copy");
    }
  };
  const details = () =>
    JSON.stringify(
      {
        firmware: release?.version ?? null,
        sha256: release?.artifact?.sha256 ?? null,
        profile: release?.profile ?? null,
        stage: phase,
        outcome: error
          ? "failed"
          : result
            ? "written-awaiting-device-check"
            : "not-complete",
        error: error ?? null,
        ...(PREVIEW ? { simulation: true } : {}),
      },
      null,
      2,
    );
  const closeDevice = async () => {
    const old = device.current;
    device.current = null;
    await old?.close?.().catch(() => {});
  };
  const refreshRelease = async () => {
    if (busy || lock.current) return;
    lock.current = true;
    setBusy(true);
    setConsent(false);
    setChecked(false);
    setIOS("");
    try {
      await closeDevice();
      setRelease(null);
      setDecision(null);
      setError(null);
      setResult(null);
      setStep(0);
      setAttempt((value) => value + 1);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const back = async () => {
    if (busy || lock.current) return;
    lock.current = true;
    setBusy(true);
    setConsent(false);
    try {
      await closeDevice();
      setError(null);
      setStep(Math.max(0, step - 1));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const check = () => {
    setError(null);
    if (
      releaseError === "release-expired" ||
      (release && expiryStatus(release).kind === "expired")
    ) {
      setDecision("expired");
      return;
    }
    if (match.kind === "eligible" && ios === "yes") {
      setDecision(null);
      setChecked(false);
      setConsent(false);
      setStep(1);
    } else
      setDecision(
        match.kind === "eligible"
          ? ios === "no"
            ? "update-ios"
            : "ios-help"
          : match.kind,
      );
  };
  const knownError = (e) =>
    KNOWN_ERRORS.includes(e.message) ? e.message : "connection-failed";
  const connect = async () => {
    if (lock.current || !checked || !release) return;
    if (expiryStatus(release).kind === "expired") {
      setError("release-expired");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (__INSTALL_PREVIEW__)
        device.current = { close: async () => {}, flashSize: "8MB" };
      else {
        if (!env.supported) throw new Error("browser");
        // Must remain inside the click's user activation, before any dynamic import.
        const port = await navigator.serial.requestPort({
          filters: [{ usbVendorId: 0x303a }],
        });
        device.current = await (
          await import("./lib/serial.js")
        ).openDevice(port);
      }
      setConsent(false);
      setStep(2);
    } catch (e) {
      setError(
        e.name === "NotFoundError" ? "selection-cancelled" : knownError(e),
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  const install = async () => {
    if (
      lock.current ||
      !consent ||
      !device.current ||
      !release ||
      match.kind !== "eligible" ||
      ios !== "yes"
    )
      return;
    if (expiryStatus(release).kind === "expired") {
      setError("release-expired");
      return;
    }
    lock.current = true;
    setBusy(true);
    setStep(3);
    setError(null);
    setResult(null);
    setPhase("download");
    setProgress(0);
    controller.current = new AbortController();
    const report = (p, n) => {
      setPhase(p);
      setProgress(n);
    };
    try {
      let receipt;
      if (__INSTALL_PREVIEW__)
        receipt = await (
          await import("./preview.js")
        ).simulateInstall(report, failPreview);
      else {
        const bytes = await downloadFirmware(
          release,
          base,
          controller.current.signal,
          (p) => report("download", p),
        );
        receipt = await (
          await import("./lib/serial.js")
        ).flashDevice(device.current, release, bytes, report);
      }
      device.current = null;
      setResult(receipt);
      setStep(4);
    } catch (e) {
      setError(knownError(e));
      await closeDevice();
    } finally {
      setBusy(false);
      lock.current = false;
      controller.current = null;
    }
  };
  const retry = () => {
    setStep(1);
    setError(null);
    setConsent(false);
    setResult(null);
    setChecked(false);
  };
  const messages = {
    "selection-cancelled": t(
      "No device selected. Nothing has been changed.",
      "尚未选择设备，没有改动任何内容。",
    ),
    "security-state": t(
      "This device has an unknown or protected security state. The DIY installer cannot change it.",
      "设备的安全状态未知或已受保护，DIY 安装器不能更改它。",
    ),
    "device-chip": t(
      "This is not an unprotected ESP32-S3. Check the board label.",
      "这不是可用的 ESP32-S3 设备，请核对板子标签。",
    ),
    "device-size": t(
      "The flash size does not match AtomS3 Lite. Installation stopped.",
      "闪存容量与 AtomS3 Lite 不符，已停止安装。",
    ),
    "device-changed": t(
      "The device changed. Reconnect and confirm it before installing.",
      "设备已变化，请重新连接并确认。",
    ),
    "hash-mismatch": t(
      "Firmware integrity check failed. No erase was started.",
      "固件完整性校验失败，尚未开始擦除。",
    ),
    "image-chip": t(
      "The image does not match ESP32-S3. Nothing was erased.",
      "镜像与 ESP32-S3 不符，没有擦除设备。",
    ),
    "readback-mismatch": t(
      "The written data did not pass verification. Reinstall from download mode.",
      "写入数据未通过校验，请进入下载模式重装。",
    ),
    "device-disconnected": t(
      "Device disconnected. Choose it again to continue.",
      "设备已断开，请重新选择设备。",
    ),
    "download-failed": t(
      "Download failed. Your device has not been erased.",
      "下载失败，尚未擦除设备。",
    ),
    "download-size": t(
      "The download size was not valid. Nothing was erased.",
      "下载文件大小异常，没有擦除设备。",
    ),
    "unverified-release": t(
      "This release has not passed verification. Installation stopped.",
      "此版本未通过验证，已停止安装。",
    ),
    "manifest-invalid": t(
      "The release is invalid or expired. Check again before installing.",
      "版本无效或已过期，请重新检查后再安装。",
    ),
    "release-expired": t(
      "This firmware release has expired. No new installation can start. Check for a newly signed release.",
      "此固件发行清单已过期，不能开始新的安装。请检查重新签名的版本。",
    ),
    "signature-invalid": t(
      "The release signature could not be verified.",
      "无法验证发行签名。",
    ),
    "preview-disconnect": t(
      "Simulated cable disconnect. No hardware was used.",
      "模拟数据线断开，没有使用真实硬件。",
    ),
    "connection-failed": t(
      "The connection could not complete. Try download mode, then reconnect.",
      "连接未能完成，请尝试下载模式后重新连接。",
    ),
  };
  const errorBox = error && (
    <div
      className={`notice ${error === "selection-cancelled" ? "" : "warning"}`}
      role="alert"
    >
      <WarningCircle size={24} />
      <div>{messages[error] || messages["connection-failed"]}</div>
    </div>
  );
  const phaseLabel = (p) =>
    ({
      download: t("Downloading and checking firmware", "下载并验证固件"),
      erase: t("Erasing flash", "擦除闪存"),
      write: t("Writing firmware", "写入固件"),
      verify: t("Verifying read-back", "校验读回数据"),
      restart: t("Restarting device", "重启设备"),
    })[p];
  const decisionText = {
    expired: t(
      "This firmware release has expired. Installation is paused until a newly signed release is published. Nothing has been written.",
      "此固件发行清单已过期。重新签名的版本发布前暂停安装，尚未写入设备。",
    ),
    lightning: t(
      "Lightning iPhones aren't supported in this release — neither screen guidance nor tapping.",
      "本版本暂不支持 Lightning 接口的 iPhone，读屏和帮你点都不支持。",
    ),
    unknown: t(
      "Check your model in Settings → General → About. Unlisted models need verification before installation.",
      "请在“设置 → 通用 → 关于本机”查看机型。未列出的机型需先验证，才能安装。",
    ),
    unavailable: t(
      "The first DIY firmware release is being validated. Installation will open when firmware and compatibility checks are complete.",
      "首个 DIY 固件正在验证中。固件与兼容性检查完成后，将开放安装。",
    ),
    unverified: t(
      "This model has not been verified with this release. Explore screen sharing while device support is being checked.",
      "此机型尚未通过本版本验证。设备支持确认前，可以先了解屏幕共享。",
    ),
    "update-ios": t(
      "Check your iOS version in Settings → General → About. Available updates are in Software Update.",
      "请在“设置 → 通用 → 关于本机”查看 iOS 版本，在“软件更新”检查更新。",
    ),
    "ios-help": t(
      "Look for iOS Version in Settings → General → About. Choose Yes only if it is in the listed range.",
      "在“设置 → 通用 → 关于本机”查看 iOS 版本，仅在所列范围内选择“是”。",
    ),
  };
  const btn = (label, action, disabled = false) => (
    <button className="primary" onClick={action} disabled={disabled}>
      {busy ? <CircleNotch size={23} className="spin" /> : null}
      {label}
    </button>
  );
  const metadata = (
    <div className="release-details">
      <span>
        {PREVIEW ? t("Example release", "示例版本") : t("Firmware", "固件")}
      </span>
      <strong>
        {release
          ? `SaySo ${release.version}`
          : t("Not yet available", "尚未开放")}
      </strong>
      {release && (
        <>
          <span>SHA-256</span>
          <code title={release.artifact.sha256}>
            {release.artifact.sha256.slice(0, 12)}…
          </code>
        </>
      )}
    </div>
  );
  const blocked = (!env.supported && !PREVIEW) || env.mobile;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {t("Skip to setup", "跳至安装流程")}
      </a>
      <header className="header">
        <a
          className="brand"
          href="#"
          onClick={async (e) => {
            e.preventDefault();
            if (!busy && !lock.current) {
              lock.current = true;
              setBusy(true);
              setConsent(false);
              setChecked(false);
              try {
                await closeDevice();
                setStep(0);
                setDecision(null);
                setError(null);
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }
          }}
          aria-label={t("Restart device setup", "重新开始设备安装")}
        >
          <img src={`${import.meta.env.BASE_URL}assets/sayso-88.png`} alt="" />
          <span>SaySo</span>
        </a>
        <span className="header-divider" />
        <span className="site-name">{t("Device setup", "设备安装")}</span>
        <div className="header-actions">
          <button
            className={`language ${lang === "en" ? "active" : ""}`}
            lang="en"
            aria-pressed={lang === "en"}
            onClick={() => setLang("en")}
          >
            EN
          </button>
          <span aria-hidden="true">/</span>
          <button
            className={`language ${lang === "zh" ? "active" : ""}`}
            lang="zh"
            aria-pressed={lang === "zh"}
            onClick={() => setLang("zh")}
          >
            中文
          </button>
          <span className="header-divider" />
          <button
            className="icon-button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={
              theme === "dark"
                ? t("Use light theme", "切换浅色主题")
                : t("Use dark theme", "切换深色主题")
            }
          >
            {theme === "dark" ? <Moon size={27} /> : <Sun size={27} />}
          </button>
        </div>
      </header>
      {PREVIEW && (
        <div className="preview-strip">
          <span>
            <Info size={17} />
            {t(
              "Interactive preview · No hardware access",
              "交互预览 · 不访问真实硬件",
            )}
          </span>
          <label>
            <input
              type="checkbox"
              checked={failPreview}
              disabled={busy}
              onChange={(e) => setFailPreview(e.target.checked)}
            />
            {t("Simulate write failure", "模拟写入失败")}
          </label>
        </div>
      )}
      <nav className="steps" aria-label={t("Setup progress", "安装进度")}>
        <ol>
          {[
            t("Compatibility", "兼容性"),
            t("Connect", "连接"),
            t("Confirm", "确认"),
            t("Install", "安装"),
            t("Verify", "验证"),
          ].map((label, i) => (
            <li
              key={i}
              className={i === step ? "current" : i < step ? "complete" : ""}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="step-index">
                {i < step ? <Check size={17} /> : i + 1}
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
      </nav>
      {!PREVIEW &&
        !installing &&
        (releaseError === "release-expired" ||
          releaseExpired ||
          releaseTiming.kind === "expiring") && (
          <aside
            className="release-health"
            role={
              releaseError === "release-expired" || releaseExpired
                ? "alert"
                : "status"
            }
          >
            <Info size={22} aria-hidden="true" />
            <div>
              <strong>
                {releaseError === "release-expired" || releaseExpired
                  ? t("Firmware release expired", "固件发行清单已过期")
                  : t("Firmware release expires soon", "固件发行清单即将到期")}
              </strong>
              <p>
                {releaseError === "release-expired" || releaseExpired
                  ? t(
                      "New installations are paused. Check for a newly signed release; do not change your clock to bypass expiry.",
                      "已暂停新的安装。请检查重新签名的版本，不要修改系统时钟绕过有效期。",
                    )
                  : t(
                      `Valid until ${releaseTiming.expiresAt}. The publisher should renew the signed release.`,
                      `有效期至 ${releaseTiming.expiresAt}，发布者应更新发行清单签名。`,
                    )}
              </p>
              <button
                className="text-link"
                disabled={busy}
                onClick={refreshRelease}
              >
                {t("Check releases again", "重新检查发行版本")}
              </button>
            </div>
          </aside>
        )}
      <main id="main" className="main">
        {blocked ? (
          <section className="columns">
            <div className="intro">
              <p className="eyebrow">SaySo Install</p>
              <h1 ref={heading} tabIndex={-1}>
                {t("Continue on\na computer.", "请在电脑上\n继续。")}
              </h1>
              <p className="lead">
                {t(
                  "The first installation needs a desktop browser and a USB connection.",
                  "首次安装需要电脑浏览器和 USB 连接。",
                )}
              </p>
              <Monitor size={64} className="standalone-icon" />
            </div>
            <div className="task">
              <h2>
                {t(
                  "Open this link in Chrome or Edge.",
                  "请用 Chrome 或 Edge 打开。",
                )}
              </h2>
              <p>
                {t(
                  "Use a Windows or Mac computer. Your iPhone will be used after the firmware is installed.",
                  "请使用 Windows 或 Mac 电脑，固件安装后再连接 iPhone。",
                )}
              </p>
              {btn(
                copied
                  ? t("Link copied", "已复制链接")
                  : t("Copy install link", "复制安装链接"),
                () => copy(location.href),
              )}
              <p className="helper">
                {t(
                  "No device has been connected or changed.",
                  "没有连接或更改任何设备。",
                )}
              </p>
              <button className="text-link" onClick={() => setModal("screen")}>
                {t("Learn about screen sharing", "了解屏幕共享")}
              </button>
            </div>
          </section>
        ) : (
          <>
            {step === 0 && (
              <section className="columns">
                <div className="intro">
                  <h1 ref={heading} tabIndex={-1}>
                    {t(
                      "Install SaySo on\nAtomS3 Lite.",
                      "为 AtomS3 Lite\n安装 SaySo。",
                    )}
                  </h1>
                  <p className="lead">
                    {t(
                      "Start on your computer.\nUpdate from the SaySo app later.",
                      "首次在电脑完成安装。\n之后通过 SaySo App 更新。",
                    )}
                  </p>
                  <ul className="requirements">
                    <li>
                      <Cpu size={36} />
                      <span>{t("AtomS3 Lite only", "仅支持 AtomS3 Lite")}</span>
                    </li>
                    <li>
                      <Usb size={36} />
                      <span>
                        {t("USB-C data cable required", "需要 USB-C 数据线")}
                      </span>
                    </li>
                  </ul>
                  <div className="secondary-copy">
                    <p>
                      {t(
                        "No device yet? Explore screen sharing.",
                        "还没有设备？先了解屏幕共享。",
                      )}
                    </p>
                    <button
                      className="text-link"
                      onClick={() => setModal("screen")}
                    >
                      {t("Learn about screen sharing", "了解屏幕共享")}
                    </button>
                  </div>
                </div>
                <div className="task">
                  <h2>
                    {t("Which iPhone will you use?", "你使用哪款 iPhone？")}
                  </h2>
                  <label className="field-label" htmlFor="model">
                    {t("iPhone model", "iPhone 机型")}
                  </label>
                  <div className="select-wrap">
                    <select
                      id="model"
                      value={model}
                      onChange={(e) => {
                        setModel(e.target.value);
                        setIOS("");
                        setDecision(null);
                        setError(null);
                      }}
                    >
                      <option value="">
                        {t("Select your iPhone", "选择你的 iPhone")}
                      </option>
                      <optgroup label={t("USB-C models", "USB-C 机型")}>
                        {MODELS.filter((m) => m.connector === "usb-c").map(
                          (m) => (
                            <option key={m.id}>{m.id}</option>
                          ),
                        )}
                      </optgroup>
                      <optgroup label={t("Lightning models", "Lightning 机型")}>
                        {MODELS.filter((m) => m.connector === "lightning").map(
                          (m) => (
                            <option key={m.id}>{m.id}</option>
                          ),
                        )}
                      </optgroup>
                      <option value="other">
                        {t("Another model / Not sure", "其他机型 / 不确定")}
                      </option>
                    </select>
                    <CaretDown size={20} />
                  </div>
                  <p className="helper">
                    {t(
                      "Find your model in Settings → General → About.",
                      "在“设置 → 通用 → 关于本机”查看机型。",
                    )}
                  </p>
                  {match.kind === "eligible" ? (
                    <fieldset className="ios-choice">
                      <legend>
                        {t(
                          `Is your iPhone running iOS ${match.minIOS}–${match.maxIOS}?`,
                          `你的 iPhone 是否运行 iOS ${match.minIOS}–${match.maxIOS}？`,
                        )}
                      </legend>
                      <p className="helper">
                        {PREVIEW
                          ? t(
                              "Preview range only. Not a hardware compatibility claim.",
                              "此范围仅用于预览，不代表硬件兼容性已验收。",
                            )
                          : t(
                              "Check iOS Version in Settings → General → About.",
                              "在“设置 → 通用 → 关于本机”查看 iOS 版本。",
                            )}
                      </p>
                      <div className="choices">
                        {[
                          ["yes", t("Yes", "是")],
                          ["no", t("No", "否")],
                          ["unsure", t("Not sure", "不确定")],
                        ].map(([v, l]) => (
                          <label
                            className={`choice ${ios === v ? "selected" : ""}`}
                            key={v}
                          >
                            <input
                              type="radio"
                              name="ios"
                              checked={ios === v}
                              onChange={() => {
                                setIOS(v);
                                setDecision(null);
                              }}
                            />
                            {l}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : (
                    <p className="context-copy">
                      {t(
                        "We'll check the connector and show the iOS requirement for your model.",
                        "我们会检查接口，并显示对应机型的 iOS 要求。",
                      )}
                    </p>
                  )}
                  {btn(
                    loading
                      ? t("Checking releases…", "正在检查版本…")
                      : t("Check my iPhone", "检查我的 iPhone"),
                    check,
                    !model || loading || (match.kind === "eligible" && !ios),
                  )}
                  <p className="helper privacy">
                    <ShieldCheck size={18} />
                    {t(
                      "Your model and iOS answers stay in this browser.",
                      "机型和 iOS 回答只留在当前浏览器。",
                    )}
                  </p>
                  {decision ? (
                    <div className="decision" role="status">
                      <Info size={24} />
                      <div>
                        <p>{decisionText[decision]}</p>
                        {decision === "unverified" && (
                          <button
                            className="text-link"
                            onClick={() => setModal("screen")}
                          >
                            {t("Explore screen sharing", "了解屏幕共享")}
                          </button>
                        )}
                        {decision === "unavailable" && (
                          <button
                            className="text-link"
                            onClick={() => {
                              setDecision(null);
                              setAttempt((n) => n + 1);
                            }}
                          >
                            {t("Check again", "重新检查")}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="quiet-note">
                      {releaseError === "release-expired"
                        ? messages["release-expired"]
                        : releaseError
                          ? t(
                              "Release information could not be verified. Try checking again.",
                              "无法验证版本信息，请重新检查。",
                            )
                          : t(
                              "Nothing is connected or written yet.",
                              "尚未连接设备或写入固件。",
                            )}
                    </p>
                  )}
                </div>
              </section>
            )}
            {step === 1 && (
              <section className="columns">
                <div className="intro">
                  <h1 ref={heading} tabIndex={-1}>
                    {t("Connect your\nAtomS3 Lite.", "连接你的\nAtomS3 Lite。")}
                  </h1>
                  <p className="lead">
                    {t(
                      "Plug it into this computer using a USB-C data cable, not a charge-only cable.",
                      "使用 USB-C 数据线连接这台电脑，请勿使用只能充电的线。",
                    )}
                  </p>
                  <ol className="instruction-list">
                    <li>
                      <span>1</span>
                      <Cpu size={28} />
                      {t(
                        "Check the label says AtomS3 Lite",
                        "核对设备标签为 AtomS3 Lite",
                      )}
                    </li>
                    <li>
                      <span>2</span>
                      <Usb size={28} />
                      {t("Connect the USB data cable", "连接 USB 数据线")}
                    </li>
                    <li>
                      <span>3</span>
                      <Monitor size={28} />
                      {t(
                        "Choose the device in your browser",
                        "在浏览器弹窗中选择设备",
                      )}
                    </li>
                  </ol>
                  <p className="helper icon-row">
                    <Info size={22} />
                    {t(
                      "AtomS3 and AtomS3R are different boards.",
                      "AtomS3 和 AtomS3R 是其他型号。",
                    )}
                  </p>
                </div>
                <div className="task">
                  <h2>{t("Choose your device.", "选择你的设备。")}</h2>
                  <p>
                    {t(
                      "Your browser will ask which USB device to use.",
                      "浏览器会询问你要连接哪个 USB 设备。",
                    )}
                  </p>
                  <label className="consent">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={(e) => setChecked(e.target.checked)}
                    />
                    <span>
                      {t(
                        "I checked the label: this is AtomS3 Lite.",
                        "我已核对标签：这是 AtomS3 Lite。",
                      )}
                    </span>
                  </label>
                  {btn(
                    busy
                      ? t("Connecting…", "正在连接…")
                      : t("Choose USB device", "选择 USB 设备"),
                    connect,
                    !checked || busy || releaseExpired,
                  )}
                  <p className="helper">
                    {t(
                      "Selecting a device will not erase or write anything.",
                      "选择设备不会擦除或写入任何内容。",
                    )}
                  </p>
                  {errorBox}
                  <div className="help-rows">
                    <button
                      disabled={busy}
                      onClick={() => setModal("download")}
                    >
                      <span>
                        <strong>
                          {t("Can't find your device?", "找不到设备？")}
                        </strong>
                        <small>
                          {t(
                            "Open the download-mode guide",
                            "查看下载模式指引",
                          )}
                        </small>
                      </span>
                      <CaretRight size={22} />
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setModal("reinstall")}
                    >
                      <span>
                        <strong>
                          {t("Reinstalling SaySo?", "已安装过 SaySo？")}
                        </strong>
                        <small>
                          {t(
                            "Use download mode to reconnect",
                            "通过下载模式重新连接",
                          )}
                        </small>
                      </span>
                      <CaretRight size={22} />
                    </button>
                  </div>
                  <button
                    className="text-link after-button"
                    disabled={busy}
                    onClick={back}
                  >
                    {t("Back", "返回")}
                  </button>
                </div>
              </section>
            )}
            {step === 2 && (
              <>
                <section className="columns">
                  <div className="intro">
                    <h1 ref={heading} tabIndex={-1}>
                      {t("Review before\nyou install.", "安装前，\n请核对。")}
                    </h1>
                    <p className="lead">
                      {t(
                        "Clean installation on AtomS3 Lite.",
                        "在 AtomS3 Lite 上清空并安装。",
                      )}
                    </p>
                    {metadata}
                    <p className="warning-text">
                      {t(
                        "Your existing program and saved settings will be erased.",
                        "原有程序和已保存的设置将被清除。",
                      )}
                    </p>
                    <p className="helper">
                      {t(
                        "Flashing other firmware later will not restore erased data.",
                        "之后刷入其他固件，也不会恢复已清除的数据。",
                      )}
                    </p>
                    <External url={RESTORE_GUIDE}>
                      {t("Restore M5Stack firmware", "恢复 M5Stack 固件")}
                    </External>
                  </div>
                  <div className="task">
                    <h2>{t("Your device stays yours.", "设备仍由你掌控。")}</h2>
                    <ul className="assurance">
                      {[
                        t("No eFuse writes", "不写入 eFuse"),
                        t(
                          "Hardware Secure Boot stays off",
                          "不启用硬件 Secure Boot",
                        ),
                        t(
                          "No flash or NVS encryption",
                          "不启用 Flash 或 NVS 加密",
                        ),
                        t(
                          "You can install other firmware later",
                          "之后仍可安装其他固件",
                        ),
                      ].map((s) => (
                        <li key={s}>
                          <CheckCircle size={28} />
                          {s}
                        </li>
                      ))}
                    </ul>
                    <p className="helper">
                      {t(
                        "The DIY profile covers the installer, first boot, updates and recovery.",
                        "DIY 配置覆盖安装器、首次启动、升级与恢复。",
                      )}
                    </p>
                    <details>
                      <summary>
                        {t(
                          "About DIY identity protection",
                          "关于 DIY 设备身份保护",
                        )}
                      </summary>
                      <p>
                        {t(
                          "Pairing keys are stored in ordinary NVS. Someone with physical flash access may copy them; this is not a tamper-proof manufacturer identity.",
                          "配对密钥存于普通 NVS。有物理闪存访问能力的人可能复制它，不能将其视为不可克隆的厂商身份。",
                        )}
                      </p>
                    </details>
                  </div>
                </section>
                <div className="confirm-bar">
                  <label className="consent">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <span>
                      {t(
                        "I understand that this clean install erases my program, settings and existing pairing.",
                        "我理解此清空安装会删除原程序、设置及已有配对。",
                      )}
                    </span>
                  </label>
                  <div className="action-row">
                    {btn(
                      t("Erase and install SaySo", "清空并安装 SaySo"),
                      install,
                      !consent || busy || releaseExpired,
                    )}
                    <button className="text-link" onClick={back}>
                      {t("Back", "返回")}
                    </button>
                  </div>
                  <p className="helper">
                    {t(
                      "The firmware is verified before erasing. Keep the device connected.",
                      "固件验证通过后才会擦除，请保持设备连接。",
                    )}
                  </p>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <section className="columns">
                  <div className="intro">
                    <h1 ref={heading} tabIndex={-1}>
                      {error
                        ? t("Installation\ninterrupted.", "安装已\n中断。")
                        : t("Installing SaySo.", "正在安装 SaySo。")}
                    </h1>
                    <div className="install-warning">
                      <Usb size={42} />
                      <div>
                        <strong>
                          {error
                            ? t(
                                "Reconnect before retrying.",
                                "重试前请重新连接。",
                              )
                            : t(
                                "Do not unplug the cable\nor close this page.",
                                "不要拔线，\n不要关闭页面。",
                              )}
                        </strong>
                        <p>
                          {error
                            ? t(
                                "Use download mode if the device is missing.",
                                "找不到设备时，请进入下载模式。",
                              )
                            : t(
                                "Keep your laptop open and awake.",
                                "请保持电脑打开并处于唤醒状态。",
                              )}
                        </p>
                      </div>
                    </div>
                    {metadata}
                    {PREVIEW && (
                      <p className="helper">
                        {t(
                          "Illustrative values · No real firmware is written.",
                          "示例数据 · 不写入真实固件。",
                        )}
                      </p>
                    )}
                    <button
                      className="text-link"
                      onClick={() => copy(details())}
                    >
                      <Copy size={19} />
                      {copied
                        ? t("Copied", "已复制")
                        : t("Copy install details", "复制安装详情")}
                    </button>
                  </div>
                  <div className="task">
                    <h2>
                      {error
                        ? t(
                            "The device needs another check.",
                            "设备需要重新检查。",
                          )
                        : phaseLabel(phase)}
                    </h2>
                    {!error && (
                      <>
                        <div className="progress-number" aria-hidden="true">
                          {progress === null ? (
                            <CircleNotch size={45} className="spin" />
                          ) : (
                            `${Math.floor(progress)}%`
                          )}
                        </div>
                        <progress
                          aria-label={phaseLabel(phase)}
                          {...(progress === null ? {} : { value: progress })}
                          max="100"
                        />
                        <p className="helper">
                          {phase === "write"
                            ? t(
                                "Write progress · Verification comes next",
                                "写入进度 · 随后将校验",
                              )
                            : t("Current stage progress", "当前阶段进度")}
                        </p>
                      </>
                    )}
                    {errorBox}
                    <ol className="phase-list" aria-live="polite">
                      {phases.map((p, i) => {
                        const current = phases.indexOf(phase);
                        return (
                          <li
                            className={
                              i === current
                                ? "active"
                                : i < current
                                  ? "done"
                                  : ""
                            }
                            key={p}
                          >
                            {i < current ? (
                              <CheckCircle weight="fill" size={25} />
                            ) : i === current && !error ? (
                              <CircleNotch size={25} className="spin" />
                            ) : (
                              <Circle size={25} />
                            )}
                            <span>{phaseLabel(p)}</span>
                          </li>
                        );
                      })}
                    </ol>
                    {error && (
                      <div className="retry-actions">
                        {btn(t("Reconnect and retry", "重新连接并重试"), retry)}
                        <button
                          className="text-link"
                          onClick={() => setModal("download")}
                        >
                          {t("Enter download mode", "进入下载模式")}
                        </button>
                      </div>
                    )}
                  </div>
                </section>
                {busy && (
                  <div className="wake-row">
                    <Monitor size={24} />
                    <strong>
                      {wake === "active"
                        ? t("Screen wake lock active", "屏幕唤醒保持已开启")
                        : t("Keep your computer awake", "请保持电脑唤醒")}
                    </strong>
                    <span>
                      {t(
                        "The browser may release it. Keep this page visible.",
                        "浏览器可能释放唤醒保持，请保持此页面可见。",
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
            {step === 4 && (
              <>
                <section className="columns">
                  <div className="intro">
                    <h1 ref={heading} tabIndex={-1}>
                      {t(
                        "Firmware written\nand verified.",
                        "固件已写入\n并通过校验。",
                      )}
                    </h1>
                    <p className="lead">
                      {t(
                        "One last check on your iPhone.",
                        "最后一步，在 iPhone 上检查。",
                      )}
                    </p>
                    <ul className="results">
                      <li>
                        <CheckCircle weight="fill" size={28} />
                        {t("Download verified", "下载验证通过")}
                      </li>
                      <li>
                        <CheckCircle weight="fill" size={28} />
                        {t("Flash read-back matched", "闪存读回一致")}
                      </li>
                      <li className="pending">
                        <Circle size={28} />
                        {t(
                          "Device startup — awaiting app check",
                          "设备启动 — 等待 App 检查",
                        )}
                      </li>
                    </ul>
                    <p className="helper">
                      {result?.restarted
                        ? t(
                            "A successful write does not yet confirm that the device has started.",
                            "写入成功还不能证明设备已正常启动。",
                          )
                        : t(
                            "Reconnect the cable to restart the device, then check it in the app.",
                            "请重新插拔数据线以重启设备，再在 App 中检查。",
                          )}
                    </p>
                    {metadata}
                  </div>
                  <div className="task">
                    <h2>
                      {t("Finish in the SaySo app.", "在 SaySo App 中完成。")}
                    </h2>
                    <ol className="finish-list">
                      <li>
                        {t(
                          "Connect AtomS3 Lite to your iPhone using a USB-C to USB-C data cable.",
                          "使用 USB-C 对 USB-C 数据线，将 AtomS3 Lite 连接到 iPhone。",
                        )}
                      </li>
                      <li>
                        {t(
                          "Open SaySo and pair your device.",
                          "打开 SaySo 并配对设备。",
                        )}
                      </li>
                      <li>
                        {t(
                          "Look for “Device ready” in the app.",
                          "等待 App 显示“设备已就绪”。",
                        )}
                      </li>
                    </ol>
                    <p className="helper">
                      {t(
                        "The app checks the device identity and installed firmware.",
                        "App 会检查设备身份和已安装的固件。",
                      )}
                    </p>
                    {btn(t("Show pairing steps", "查看配对步骤"), () =>
                      setModal("pairing"),
                    )}
                    <button
                      className="text-link after-button"
                      onClick={() => setModal("download")}
                    >
                      {t("Device not detected?", "没有检测到设备？")}
                    </button>
                  </div>
                </section>
                <div className="wake-row">
                  <Info size={24} />
                  <span>
                    {t(
                      "Future updates happen in the SaySo app.",
                      "后续更新在 SaySo App 中完成。",
                    )}
                  </span>
                  <button className="text-link" onClick={() => copy(details())}>
                    {copied
                      ? t("Copied", "已复制")
                      : t("Copy install details", "复制安装详情")}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </main>
      <footer>
        <div className="footer-main">
          <p>
            <Info size={21} />
            <span>
              {t(
                "Compatible with M5Stack AtomS3 Lite. Not affiliated with or endorsed by M5Stack.",
                "兼容 M5Stack AtomS3 Lite。SaySo 与 M5Stack 无合作或背书关系。",
              )}
            </span>
          </p>
          <div className="footer-links">
            {(siteLinks.repositoryUrl || SOURCE_URL) && (
              <External url={siteLinks.repositoryUrl || SOURCE_URL}>
                GitHub
              </External>
            )}
            <button onClick={() => setModal("notices")}>
              {t("Third-party notices", "第三方许可")}
            </button>
            <button onClick={() => setModal("privacy")}>
              {t("Privacy", "隐私")}
            </button>
          </div>
        </div>
        <p className="footer-status">
          {PREVIEW
            ? t(
                "Interactive preview · Not a live installer",
                "交互预览 · 不进行真实烧录",
              )
            : release
              ? t(
                  "Signed DIY release · Installation requires your confirmation",
                  "已签名 DIY 版本 · 安装须经你确认",
                )
              : t(
                  "DIY firmware release not yet available",
                  "DIY 固件版本尚未开放",
                )}
        </p>
      </footer>
      {siteLinks.homePath && (
        <nav
          className="website-links"
          aria-label={t("SaySo website", "SaySo 官网")}
        >
          {[
            [siteLinks.homePath, t("Back to SaySo", "返回 SaySo 官网")],
            [siteLinks.startPath, t("Get started", "开始使用")],
            [siteLinks.guidesPath, t("Guides", "使用文档")],
            [siteLinks.supportPath, t("Support", "支持与帮助")],
          ].map(
            ([href, label]) =>
              href &&
              (busy ? (
                <button key={label} disabled>
                  {label}
                </button>
              ) : (
                <a
                  key={label}
                  href={href}
                  onClick={guardWebsiteNavigation}
                  onAuxClick={guardWebsiteNavigation}
                >
                  {label}
                </a>
              )),
          )}
        </nav>
      )}
      {modal && (
        <HelpDialog
          kind={modal}
          setKind={setModal}
          t={t}
          copyText={copyText}
          siteLinks={siteLinks}
          navigationDisabled={busy}
          onWebsiteNavigate={guardWebsiteNavigation}
        />
      )}
    </div>
  );
}
