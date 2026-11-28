import { installDocument } from "./install-document.mjs";
import { siteBase } from "./assemble-pages.mjs";
import { flashCopy, diagramAlts } from "../public/flash/flash-copy.js";
import { normalizeConfig } from "../src/config.mjs";
// Readable policy/support HTML; one small module shares the site's language preference.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// This renderer only loads SSR modules. Avoid the browser config's client warmup
// and watcher: writing the generated pages must not start a new dependency scan
// while the short-lived renderer is closing.
const server = await createServer({
  configFile: false,
  root,
  plugins: [react()],
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const { Privacy, Start, Support } = await server.ssrLoadModule("/src/App.jsx");
  const { SiteHeader, NotFound } = await server.ssrLoadModule("/src/SiteChrome.jsx");
  const { copy } = await server.ssrLoadModule("/src/copy.js");
  const rawConfig = JSON.parse(await readFile(path.join(root, "public/site-config.json"), "utf8"));
  const config = normalizeConfig(rawConfig);
  await installDocument(new URL("../public/",import.meta.url),rawConfig.servicePackage);
  const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
  const base = siteBase();
  const errorParts = ["en", "zh"].map((lang) => {
    const t = copy[lang];
    const header = render(SiteHeader, { lang, base, languageLinks: { en: "#en", zh: "#zh" } });
    return `<section id="${lang}" lang="${lang === "zh" ? "zh-CN" : lang}"><a class="skip-link" href="#error-${lang}">${t.skip}</a>${header}<main id="error-${lang}" class="shell route-not-found" tabindex="-1">${render(NotFound, { lang, base, staticDocument: true })}</main></section>`;
  });
  await writeFile(path.join(root, "public", "404.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found · SaySo</title><link rel="icon" href="${base}assets/sayso-88.png"><link rel="stylesheet" href="${base}site-chrome.css"><script type="module" src="${base}site-not-found.js"></script></head><body class="static-site error-page">${errorParts.join("")}</body></html>\n`);
  const flashHeaders = ["en", "zh"].map((lang) => render(SiteHeader, {
    lang, route: "firmware", base: "../", languageLinks: { en: "./", zh: "./zh.html" },
  }));
  const flashRelease = JSON.parse(await readFile(path.join(root, "public/flash/firmware/release.json"), "utf8"));
  const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  for (const [file, lang] of [["index.html", "en"], ["zh.html", "zh"]]) {
    const location = path.join(root, "public", "flash", file);
    const html = await readFile(location, "utf8");
    const marker = /<!-- site-header -->[\s\S]*?<!-- \/site-header -->/;
    if (!marker.test(html)) throw new Error(`Missing flash header marker in ${file}`);
    const dialogSizes = Object.fromEntries(await Promise.all(["confirm", "progress", "success"].map(async (phase) => {
      const png = await readFile(path.join(root, "public", "flash", "images", `install-${phase}-${lang}.png`));
      return [phase, { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }];
    })));
    const updated = html.replace(marker, `<!-- site-header -->${flashHeaders.join("")}<!-- /site-header -->`)
      .replace(/(<[^>]+ data-copy="([^"]+)"[^>]*>)[^<]*(<\/)/g,
        (_, open, key, close) => open + escape(flashCopy[lang][key]) + close)
      .replace(/(<img data-(?:static-)?image="([^"]+)"[^>]* alt=")[^"]*/g,
        (_, open, key) => open + escape(diagramAlts[key][lang === "zh" ? 1 : 0]))
      .replace(/(<img data-static-image="([^"]+)"[^>]*?) width="\d+" height="\d+"/g,
        (_, open, key) => `${open} width="${dialogSizes[key].width}" height="${dialogSizes[key].height}"`)
      .replace(/(<dd id="version">)[^<]*/, (_, open) => open + escape(flashRelease.version))
      .replace(/(<code id="sha256">)[^<]*/, (_, open) => open + escape(flashRelease.sha256));
    await writeFile(location, updated);
  }
  for (const [route, Component] of [["start", Start], ["support", Support], ["privacy", Privacy]]) {
    for (const lang of ["zh", "en"]) {
      const prefix = lang === "en" ? "../../" : "../";
      const languageLink = lang === "en" ? "../" : "./en/";
      const t = copy[lang];
      const documentPrefix = route === "start" ? prefix : undefined;
      let body = render(Component, { t, lang, config, staticDocument: true, documentPrefix });
      body = body.replaceAll('href="#/', `href="${prefix}#/`);
      const home = lang === "zh" ? `${prefix}#zh` : prefix;
      const localePath = lang === "en" ? "en/" : "";
      const html = `<!doctype html><html lang="${lang === "zh" ? "zh-CN" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t[route]} · SaySo</title><link rel="stylesheet" href="${prefix}site-chrome.css"><link rel="stylesheet" href="${prefix}document.css"><script type="module" src="${prefix}document-language.js"></script></head><body class="${route}-document" data-document-locale="${lang}"><header><a href="${home}"><img src="${prefix}assets/sayso-88.png" width="36" height="36" alt=""> SaySo</a><nav><a href="${languageLink}" data-language="${lang === "zh" ? "en" : "zh"}" lang="${lang === "zh" ? "en" : "zh"}">${lang === "zh" ? "English" : "中文"}</a><a href="${prefix}#/${route}">${lang === "zh" ? "交互版" : "Interactive page"}</a></nav></header><main>${body}</main><footer><a href="${prefix}support/${localePath}">${t.support}</a><a href="${prefix}privacy/${localePath}">${t.privacy}</a><a href="${prefix}start/${localePath}">${t.start}</a></footer></body></html>\n`;
      const dir = path.join(root, "public", route, lang === "en" ? "en" : "");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "index.html"), html);
    }
  }
} finally { await server.close(); }
