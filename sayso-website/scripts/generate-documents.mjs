// Render the same approved policy/support components into readable, script-free HTML.
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
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const { Privacy, Support } = await server.ssrLoadModule("/src/App.jsx");
  const { copy } = await server.ssrLoadModule("/src/copy.js");
  const config = JSON.parse(await readFile(path.join(root, "public/site-config.json"), "utf8"));
  for (const [route, Component] of [["support", Support], ["privacy", Privacy]]) {
    for (const lang of ["zh", "en"]) {
      const prefix = lang === "en" ? "../../" : "../";
      const languageLink = lang === "en" ? "../" : "./en/";
      const t = copy[lang];
      let body = renderToStaticMarkup(createElement(Component, { t, lang, config, staticDocument: true }));
      body = body.replaceAll('href="#/', `href="${prefix}#/`);
      const html = `<!doctype html><html lang="${lang === "zh" ? "zh-CN" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t[route]} · SaySo</title><link rel="stylesheet" href="${prefix}document.css"></head><body><header><a href="${prefix}"><img src="${prefix}assets/sayso-88.png" width="36" height="36" alt=""> SaySo</a><nav><a href="${languageLink}" lang="${lang === "zh" ? "en" : "zh"}">${lang === "zh" ? "English" : "中文"}</a><a href="${prefix}#/${route}">${lang === "zh" ? "交互版" : "Interactive page"}</a></nav></header><main>${body}</main><footer><a href="${prefix}support/">${t.support}</a> · <a href="${prefix}privacy/">${t.privacy}</a> · <a href="${prefix}#/start">${t.start}</a></footer></body></html>\n`;
      const dir = path.join(root, "public", route, lang === "en" ? "en" : "");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "index.html"), html);
    }
  }
} finally { await server.close(); }
