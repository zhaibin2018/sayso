import React, { useEffect, useRef, useState } from "react";
import { X, Info, ArrowRight, ArrowSquareOut } from "@phosphor-icons/react";
import {
  APP_STORE_URL,
  MANUFACTURER_GUIDE,
  RESTORE_GUIDE,
} from "./release-policy.js";
import { safeAppStoreURL } from "./lib/policy.js";
export function External({ url, children }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowSquareOut size={16} aria-hidden="true" />
    </a>
  );
}
export function HelpDialog({
  kind,
  setKind,
  t,
  copyText,
  siteLinks = {},
  navigationDisabled = false,
  onWebsiteNavigate,
}) {
  const ref = useRef(),
    [qr, setQr] = useState(null),
    appStore = safeAppStoreURL(siteLinks.appStoreUrl || APP_STORE_URL);
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    return () => el.close();
  }, []);
  useEffect(() => {
    if (kind !== "pairing" || !appStore) return;
    let valid = true;
    import("qrcode")
      .then((m) =>
        m.default.toDataURL(appStore, {
          width: 184,
          margin: 2,
          errorCorrectionLevel: "M",
        }),
      )
      .then((url) => {
        if (valid) setQr(url);
      })
      .catch(() => {});
    return () => {
      valid = false;
    };
  }, [kind, appStore]);
  const titles = {
    download: t("Find your device", "找到你的设备"),
    reinstall: t("Reinstall or update?", "重装还是更新？"),
    screen: t(
      "Screen sharing, without a control device",
      "无需操控设备的屏幕共享",
    ),
    pairing: t("Continue on your iPhone", "在 iPhone 上继续"),
    notices: t("Third-party notices", "第三方许可"),
    privacy: t("Your privacy", "你的隐私"),
    copy: t("Copy this information", "复制以下信息"),
    navigation: t("Keep this page open", "请保持此页面打开"),
  };
  return (
    <dialog
      className="dialog"
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        setKind(null);
      }}
      onClick={(e) => {
        if (e.target === ref.current) setKind(null);
      }}
    >
      <div className="dialog-header">
        <h2 id="dialog-title">{titles[kind]}</h2>
        <button
          className="icon-button"
          onClick={() => setKind(null)}
          aria-label={t("Close", "关闭")}
        >
          <X size={24} />
        </button>
      </div>
      <div className="dialog-body">
        {kind === "navigation" && (
          <p>
            {t(
              "Device work is still in progress. Keep this page open and wait for the result before returning to the website.",
              "设备操作仍在进行。请保持页面打开，等待结果后再返回官网。",
            )}
          </p>
        )}
        {kind === "download" && (
          <>
            <p>
              {t(
                "If SaySo is already running, its USB control interfaces may replace the serial connection. Reinstalling needs download mode.",
                "SaySo 运行时，USB 控制接口可能替代串口连接。重新安装需要进入下载模式。",
              )}
            </p>
            <div className="notice">
              <Info size={24} />
              <p>
                {t(
                  "The SaySo-specific button and LED guide is awaiting hardware validation. Use the manufacturer’s instructions for your exact board.",
                  "SaySo 设备的按钮与灯序指引尚待真机验证，请查看对应型号的厂商说明。",
                )}
              </p>
            </div>
            <External url={MANUFACTURER_GUIDE}>
              {t(
                "Open AtomS3 Lite download-mode instructions",
                "查看 AtomS3 Lite 下载模式说明",
              )}
            </External>
            <ol className="help-list">
              <li>
                {t(
                  "Enter download mode following the manufacturer’s guide.",
                  "按厂商指引进入下载模式。",
                )}
              </li>
              <li>
                {t(
                  "Choose the serial device again in this browser.",
                  "在此浏览器重新选择串口设备。",
                )}
              </li>
              <li>
                {t(
                  "If it is still missing, check the data cable and USB port, and close apps using the port.",
                  "仍未出现时，检查数据线和 USB 端口，并关闭占用串口的软件。",
                )}
              </li>
            </ol>
            <p>
              {t(
                "The large top button and reset button are not interchangeable. Do not guess a button sequence.",
                "顶部大按钮与复位按钮并不相同，请勿猜测按键操作。",
              )}
            </p>
          </>
        )}
        {kind === "reinstall" && (
          <>
            <p>
              {t(
                "For a working SaySo device, use the app for normal firmware updates.",
                "设备运行正常时，请在 App 内进行日常固件更新。",
              )}
            </p>
            <p>
              {t(
                "This website implements clean installation only. It erases settings and existing pairing. Identity-preserving migration is not available.",
                "此网站只实现清空安装，会删除设置及已有配对。保留身份的迁移尚未提供。",
              )}
            </p>
            <button className="primary" onClick={() => setKind("download")}>
              {t("Open download-mode help", "查看下载模式帮助")}
              <ArrowRight size={21} />
            </button>
            <External url={RESTORE_GUIDE}>
              {t("Restore M5Stack firmware", "恢复 M5Stack 固件")}
            </External>
          </>
        )}
        {kind === "screen" && (
          <>
            <p>
              {t(
                "SaySo separates seeing your screen from controlling your phone. Screen sharing does not require an AtomS3 Lite.",
                "SaySo 将查看屏幕与操控手机分开。屏幕共享不需要 AtomS3 Lite。",
              )}
            </p>
            <p>
              {t(
                "You start sharing with the iPhone system prompt. Your chosen service and ChatGPT may receive screen content; you can stop sharing at any time.",
                "你通过 iPhone 系统提示主动开启共享。所选服务及 ChatGPT 可能接收屏幕内容，你可以随时停止共享。",
              )}
            </p>
            <div className="notice">
              <Info size={24} />
              <p>
                {t(
                  "Public availability, free features and supported iOS versions will be listed with the app release. No public download is configured in this installer yet.",
                  "公开可用时间、免费功能和支持的 iOS 版本将随 App 发布说明提供。此安装器暂未配置公开下载入口。",
                )}
              </p>
            </div>
            {appStore && (
              <External url={appStore}>
                {t("View SaySo on the App Store", "在 App Store 查看 SaySo")}
              </External>
            )}
          </>
        )}
        {kind === "pairing" && (
          <>
            <ol className="help-list">
              <li>
                {t(
                  "Use a USB-C to USB-C data cable to connect AtomS3 Lite to a supported iPhone.",
                  "使用 USB-C 对 USB-C 数据线，将 AtomS3 Lite 连接至受支持的 iPhone。",
                )}
              </li>
              <li>
                {t(
                  "Open SaySo and follow its device-pairing instructions.",
                  "打开 SaySo，按 App 中的设备配对指引操作。",
                )}
              </li>
              <li>
                {t(
                  "Confirm the firmware version and “Device ready” status in the app.",
                  "在 App 中确认固件版本及“设备已就绪”状态。",
                )}
              </li>
            </ol>
            {appStore ? (
              <div className="store-handoff">
                {qr && (
                  <img
                    src={qr}
                    alt={t(
                      "QR code for the SaySo App Store page",
                      "SaySo App Store 页面二维码",
                    )}
                  />
                )}
                <External url={appStore}>
                  {t("Download SaySo on your iPhone", "在 iPhone 上下载 SaySo")}
                </External>
              </div>
            ) : (
              <div className="notice">
                <Info size={24} />
                <p>
                  {t(
                    "The public App Store link is not configured yet. No QR code is shown until the real destination is available.",
                    "正式 App Store 链接尚未配置。真实下载地址可用后，才会显示二维码。",
                  )}
                </p>
              </div>
            )}
          </>
        )}
        {kind === "notices" && (
          <>
            <p>
              {t(
                "This installer uses the following components. SaySo branding is separate from these licenses.",
                "此安装器使用以下组件，SaySo 品牌资源不属于这些组件许可。",
              )}
            </p>
            <ul className="license-list">
              <li>React · MIT</li>
              <li>Vite · MIT</li>
              <li>Phosphor Icons · MIT</li>
              <li>esptool-js · Apache-2.0</li>
              <li>SparkMD5 · MIT</li>
              <li>QRCode · MIT</li>
              <li>Inter · SIL OFL 1.1</li>
            </ul>
            <a
              href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Read bundled license texts", "查看随附许可全文")}
              <ArrowSquareOut size={16} />
            </a>
            <p>
              {t(
                "Firmware dependency notices must accompany each actual release.",
                "实际固件的依赖许可须随对应发行包提供。",
              )}
            </p>
          </>
        )}
        {kind === "privacy" && (
          <>
            <p>
              {t(
                "Your iPhone model and iOS answers stay in memory in this browser and are not sent to a server. Only language and appearance preferences are saved locally.",
                "机型和 iOS 回答只保存在当前浏览器内存中，不发送到服务器。仅语言与外观偏好会保存在本地。",
              )}
            </p>
            <p>
              {t(
                "The installer downloads release files. Hosting providers may keep ordinary access logs. There are no analytics, tracking pixels or device-identity uploads in this site.",
                "安装器会下载版本文件，托管方可能保留常规访问日志。此网站没有分析埋点、跟踪像素或设备身份上传。",
              )}
            </p>
            <p>
              {t(
                "Later screen sharing in the SaySo app is a separate action with its own permissions.",
                "之后在 SaySo App 中进行屏幕共享是独立操作，具有独立授权。",
              )}
            </p>
          </>
        )}
        {kind === "copy" && (
          <>
            <p>
              {t(
                "Clipboard access was not available. Select and copy the text below.",
                "无法访问剪贴板，请选择并复制下方文字。",
              )}
            </p>
            <textarea
              readOnly
              rows={7}
              value={copyText}
              aria-label={t("Copyable information", "可复制信息")}
              onFocus={(e) => e.target.select()}
            />
          </>
        )}
      </div>
      {kind !== "navigation" && (
        <nav
          className="website-links"
          aria-label={t("Website help", "官网帮助")}
        >
          {[
            [
              kind === "privacy" ? siteLinks.privacyPath : siteLinks.startPath,
              kind === "privacy"
                ? t("SaySo privacy information", "SaySo 隐私说明")
                : t("SaySo setup guide", "SaySo 使用指南"),
            ],
            [siteLinks.supportPath, t("Support", "支持与帮助")],
          ].map(
            ([href, label]) =>
              href &&
              (navigationDisabled ? (
                <button disabled key={label}>
                  {label}
                </button>
              ) : (
                <a
                  href={href}
                  key={label}
                  onClick={onWebsiteNavigate}
                  onAuxClick={onWebsiteNavigate}
                >
                  {label}
                </a>
              )),
          )}
        </nav>
      )}
    </dialog>
  );
}
