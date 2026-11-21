// Serve the built website at the real Pages prefix, on loopback only. No device access.
import http from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = await realpath(
  fileURLToPath(new URL("../dist/client/", import.meta.url)),
);
const prefix = "/sayso/";
const port = Number(process.env.PORT || 4327);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".bin": "application/octet-stream",
};
http
  .createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405).end();
        return;
      }
      const url = new URL(req.url, "http://127.0.0.1");
      if (!url.pathname.startsWith(prefix)) {
        res.writeHead(404).end();
        return;
      }
      const relative = decodeURIComponent(url.pathname.slice(prefix.length));
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
        if (!url.pathname.endsWith("/")) {
          res
            .writeHead(308, { Location: url.pathname + "/" + url.search })
            .end();
          return;
        }
        target = path.join(target, "index.html");
      }
      target = await realpath(target);
      if (!target.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const bytes = await readFile(target);
      res.writeHead(200, {
        "Content-Type":
          mime[path.extname(target)] || "application/octet-stream",
        "Content-Length": bytes.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`F07 preview: http://127.0.0.1:${port}/sayso/flash/`),
  );
