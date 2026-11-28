import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, stat, realpath } from "node:fs/promises";
import { siteBase } from "./assemble-pages.mjs";
const root = await realpath(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/pages"),
);
const prefix = siteBase();
const port = Number(process.env.PORT || 4320);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".vtt": "text/vtt",
  ".bin": "application/octet-stream",
};
http
  .createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405).end();
        return;
      }
      const u = new URL(req.url, "http://127.0.0.1");
      if (u.pathname === prefix.slice(0, -1)) {
        res.writeHead(308, { Location: prefix + u.search }).end();
        return;
      }
      if (!u.pathname.startsWith(prefix)) {
        res.writeHead(404).end("Not found");
        return;
      }
      const relative = decodeURIComponent(u.pathname.slice(prefix.length));
      if (relative.includes("\\") || relative.split("/").includes("..")) {
        res.writeHead(400).end();
        return;
      }
      let target = path.resolve(root, relative);
      if (target !== root && !target.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      if ((await stat(target)).isDirectory()) {
        if (!u.pathname.endsWith("/")) {
          res.writeHead(308, { Location: u.pathname + "/" + u.search }).end();
          return;
        }
        target = path.join(target, "index.html");
      }
      const actual = await realpath(target);
      if (!actual.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const bytes = await readFile(actual);
      res.writeHead(200, {
        "Content-Type":
          mime[path.extname(actual)] || "application/octet-stream",
        "Content-Length": bytes.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }).end(req.method === "HEAD" ? undefined : await readFile(path.join(root, "404.html")));
      } else { res.writeHead(400).end("Bad request"); }
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Integrated preview: http://127.0.0.1:${port}${prefix}`),
  );
