import { verifyBundle, canInstall } from "./flash-policy.js";
import { preparationIsSlow } from "./flash-progress.js";
import { loadTool, flashDevice } from "./flash-device.js";
import { createFlashDialog } from "./flash-dialog.js";
import { initSiteChrome } from "../site-chrome.js";
import { flashCopy, diagramAlts } from "./flash-copy.js";

let lang = "en",
  verificationState = "checking",
  installerFailed = false;
let bundle,
  tool,
  active = false,
  flashing = false,
  modal,
  currentState,
  clipboardResult;
const supported = window.isSecureContext && "serial" in navigator;
function render() {
  const t = flashCopy[lang];
  const localeIndex = lang === "zh" ? 1 : 0;
  document.title = t.title + " · SaySo";
  document.querySelectorAll("[data-copy]").forEach((el) => {
    el.textContent = t[el.dataset.copy] ?? el.textContent;
  });
  const status = document.getElementById("verification");
  status.hidden = installerFailed;
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
  const ready = Boolean(bundle && tool && verificationState === "verified");
  document.getElementById("desktop-install").hidden = !supported;
  document.getElementById("desktop-examples").hidden = !supported;
  document.getElementById("mobile-install").hidden = supported;
  document.getElementById("handoff").hidden = supported;
  button.hidden = !ready;
  document.querySelector('[data-copy="choose"]').hidden = !ready;
  renderClipboard(t);
  button.disabled = active || !supported || !ready;
  button.textContent = verificationState === "verified" ? t.install : t.locked;
  const browserStatus = document.getElementById("browser-status");
  browserStatus.hidden = !installerFailed;
  browserStatus.textContent = installerFailed ? t.cdnFailed : "";
  document.querySelectorAll("[data-image]").forEach((img) => {
    img.src = new URL(
      `images/${img.dataset.image}-${lang}.svg`,
      location.href,
    ).href;
    img.parentElement.href = img.src;
    img.alt = diagramAlts[img.dataset.image][localeIndex];
  });
  document.querySelectorAll("[data-static-image]").forEach((img) => {
    img.src = new URL(
      `images/install-${img.dataset.staticImage}-${lang}.png`,
      location.href,
    ).href;
    img.parentElement.href = img.src;
    img.alt = diagramAlts[img.dataset.staticImage][localeIndex];
  });
  document.getElementById("official-link").href =
    `https://docs.m5stack.com/${lang === "zh" ? "zh_CN" : "en"}/core/AtomS3-Lite`;
  document.getElementById("flash-support").href =
    lang === "zh" ? "../support/" : "../support/en/";
  document.getElementById("flash-privacy").href =
    lang === "zh" ? "../privacy/" : "../privacy/en/";
  if (modal && currentState) modal.render(currentState, lang);
}
const chrome = initSiteChrome((locale) => {
  lang = locale;
  render();
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
    onLanguage: chrome.setLanguage,
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

function renderClipboard(t) {
  const status = document.getElementById("copy-feedback");
  const address = document.getElementById("copy-address");
  status.textContent =
    clipboardResult === "copied"
      ? t.copySuccess
      : clipboardResult === "denied"
        ? t.copyFallback
        : "";
  address.hidden = clipboardResult !== "denied";
  address.textContent =
    clipboardResult === "denied" ? new URL("./", location.href).href : "";
}
document.getElementById("copy-link").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(new URL("./", location.href).href);
    clipboardResult = "copied";
  } catch {
    clipboardResult = "denied";
  }
  renderClipboard(flashCopy[lang]);
});
