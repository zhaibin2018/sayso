import { installationMessage, installationUrl, serviceDefinition } from "../src/installation.js";
import { writeFile } from "node:fs/promises";
import { verifiedPackage } from "./service-package.mjs";

const started = "../#/start";
const copy = {
  en: {
    title: "Install SaySo",
    start: "Start in the SaySo app by tapping “Connect ChatGPT”.",
    pending: `The compatible SaySo service package isn’t available yet. See <a href="${started}">Get started</a> for the setup steps.`,
    technical: "For ChatGPT (technical)",
    guide: "Use the fixed installation guide for this release in the user’s own ChatGPT account.",
    copyMessage: "Copy installation message",
    release: "Release: ",
    versions: (version, plugin) => `Service: ${version} · Plugin: ${plugin}`,
    commit: "Public commit: ",
    links: ["Installation guide", "Release manifest", "ZIP archive"],
    manifestDigest: "Manifest SHA-256: ",
    zipDigest: "ZIP SHA-256: ",
    verify: "Verify the manifest, skills and migration order. For an existing service, confirm which installation to update. Keep the original iPhone request and follow the guide to return to SaySo. Report installation, scheduled cleanup and phone connection separately. The user chooses permissions in ChatGPT.",
    nav: ["Get started", "Troubleshooting", "Privacy", "Set up the accessory"],
  },
  zh: {
    title: "安装 SaySo",
    start: "请从 SaySo App 点“连接 ChatGPT”开始。",
    pending: `适用的 SaySo 服务安装包还未开放。查看“<a href="${started}">开始使用</a>”，了解设置步骤。`,
    technical: "给 ChatGPT 的技术说明",
    guide: "请在用户自己的 ChatGPT 账号里，按本版固定的安装手册执行。",
    copyMessage: "复制安装消息",
    release: "发行包：",
    versions: (version, plugin) => `服务：${version} · 插件：${plugin}`,
    commit: "公开提交：",
    links: ["安装手册", "发行清单", "ZIP 发行包"],
    manifestDigest: "清单 SHA-256：",
    zipDigest: "ZIP SHA-256：",
    verify: "安装前核对清单、技能和迁移顺序。已有服务时，先确认要更新哪一份。保留 iPhone 发起的连接请求，按手册回到 SaySo。分别报告安装、定期清理和手机连接情况。权限由用户自己在 ChatGPT 里选择。",
    nav: ["开始使用", "遇到问题", "隐私", "准备配件"],
  },
};
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

export function renderInstallDocument(pkg) {
  const section = (lang) => {
    const c = copy[lang];
    const zh = lang === "zh";
    const navPaths = [started, zh ? "../support/" : "../support/en/", zh ? "../privacy/" : "../privacy/en/", "../flash/"];
    const nav = c.nav.map((name, i) => `<a href="${navPaths[i]}">${name}</a>`).join("");
    let body = `<p>${serviceDefinition[lang]}</p><p>${c.pending}</p>`;
    if (pkg) {
      const urls = [pkg.guideURL, pkg.manifestURL, pkg.archiveURL];
      const links = c.links.map((label, i) => `<a href="${escape(urls[i])}">${label}</a>`).join(" · ");
      const visibleURL = installationUrl.match(/https?:\/\/|[^/]+\/?/g)
        .map(part => `<span class="url-part">${escape(part)}</span>`).join("<wbr>");
      const message = escape(installationMessage[lang]).replace(installationUrl, visibleURL);
      const commit = pkg.commit ? `<p>${c.commit}<code>${escape(pkg.commit)}</code></p>` : "";
      body = `<details><summary>${c.technical}</summary><p>${serviceDefinition[lang]}</p><p class="message">${message}</p><button type="button" class="button-primary" data-copy-message>${c.copyMessage}</button><p role="status"></p><p>${c.guide}</p><p>${c.release}${escape(pkg.label)}</p><p>${escape(c.versions(pkg.version, pkg.pluginVersion))}</p>${commit}<p>${links}</p><p>${c.manifestDigest}<code>${escape(pkg.manifestSha256)}</code></p><p>${c.zipDigest}<code>${escape(pkg.zipSha256)}</code></p><p>${c.verify}</p></details>`;
    }
    return `<section id="${lang}" data-locale="${lang}" lang="${zh ? "zh-CN" : "en"}"><h1>${c.title}</h1><p>${c.start}</p>${body}<footer>${nav}</footer></section>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Install SaySo</title><link rel="stylesheet" href="../site-chrome.css"><link rel="stylesheet" href="../document.css"><script type="module" src="../document-language.js"></script></head><body class="install-document"><header><a href="../">SaySo</a><nav><a href="#en" data-install-language="en" lang="en">English</a><a href="#zh" data-install-language="zh" lang="zh-CN">中文</a></nav></header><main>${section("en")}${section("zh")}</main></body></html>\n`;
}

export async function installDocument(root, record) {
  const page = new URL("install/index.html", root);
  try {
    await writeFile(page, renderInstallDocument(await verifiedPackage(record)));
  } catch (error) {
    await writeFile(page, renderInstallDocument(null));
    throw error;
  }
}
