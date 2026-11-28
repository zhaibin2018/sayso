import {
  readdir,
  mkdir,
  readFile,
  writeFile,
  lstat,
  realpath,
  rm,
  cp,
  access,
} from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { normalizeConfig } from "../src/config.mjs";

export function siteBase(value = process.env.SAYSO_SITE_BASE || "/sayso/") {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(value)) throw new Error("Invalid SaySo site base.");
  return value;
}

export function assertStagingTarget(root, target) {
  const expected = path.resolve(root, "dist", "pages");
  if (path.resolve(target) !== expected)
    throw new Error(
      "Staging deletion must target this project dist/pages exactly.",
    );
  return expected;
}
async function walk(root) {
  const list = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Linked build input rejected: ${full}`);
    if (entry.isDirectory()) list.push(...(await walk(full)));
    else list.push(full);
  }
  return list;
}
async function insideDirectory(root, dir) {
  const actual = await realpath(dir),
    prefix = await realpath(root);
  if (actual !== path.resolve(dir) || !actual.startsWith(prefix + path.sep))
    throw new Error(`Build path escapes project or uses a link: ${dir}`);
  return actual;
}
const previewMarkers = [
  "SIMULATED_INSTALL_ONLY",
  "1.0.3-preview",
  "simulateInstall",
  "Simulate write failure",
  "模拟写入失败",
  "Interactive preview · No hardware access",
];
export async function auditStaticTree(root, { installer = false } = {}) {
  const files = await walk(root);
  for (const full of files) {
    const relative = path.relative(root, full).replaceAll("\\", "/");
    if (
      relative
        .split("/")
        .some((part) =>
          [
            "node_modules",
            ".git",
            ".github",
            ".logs",
            "evidence",
            "reference",
            "qa",
            "dist-preview",
          ].includes(part),
        ) ||
      /(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|pfx|p12)$/i.test(relative)
    )
      throw new Error(
        `Private/development material in public artifact: ${relative}`,
      );
    if (/\.(?:js|html|json|txt|css)$/.test(full)) {
      const text = await readFile(full, "utf8");
      if (/-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----/.test(text))
        throw new Error(`Private signing key in public artifact: ${relative}`);
      if (installer && previewMarkers.some((marker) => text.includes(marker)))
        throw new Error(
          `Installer simulation code in production artifact: ${relative}`,
        );
      if (/\.(?:html|css)$/.test(full)) {
        const refs = [
          ...text.matchAll(
            /(?:src|href)=["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/g,
          ),
        ].map((m) => m[1] || m[2]);
        for (const ref of refs) {
          if (/^(?:https?:|data:|mailto:|#)/.test(ref)) continue;
          let localRef = ref.split(/[?#]/)[0];
          if (ref.startsWith("/")) {
            const base = siteBase();
            if (relative !== "404.html" || !ref.startsWith(base))
              throw new Error(`Root-relative asset breaks project Pages: ${ref}`);
            localRef = localRef.slice(base.length);
          }
          const target = path.resolve(path.dirname(full), localRef);
          if (target !== path.resolve(root) && !target.startsWith(path.resolve(root) + path.sep))
            throw new Error(`Asset escapes package: ${ref}`);
          await access(target);
        }
      }
    }
  }
  return files;
}
export function sharedLinks(raw) {
  const c = normalizeConfig(raw);
  return {
    schema: 1,
    homePath: "../",
    startPath: "../#/start",
    guidesPath: "../#/guides",
    privacyPath: "../#/privacy",
    supportPath: "../#/support",
    appStoreUrl: c.appStoreUrl,
    repositoryUrl: c.repositoryUrl,
    supportEmail: c.supportEmail,
  };
}
export async function assemblePages(projectRoot) {
  const root = await realpath(projectRoot);
  const home = await insideDirectory(root, path.join(root, "dist/client"));
  const installer = await insideDirectory(
    root,
    path.join(root, "sayso-install/dist/client"),
  );
  await access(path.join(home, "index.html"));
  await access(path.join(installer, "index.html"));
  await auditStaticTree(home);
  await auditStaticTree(installer, { installer: true });
  try {
    await lstat(path.join(home, "accessory-install"));
    throw new Error(
      "Homepage build already contains accessory-install/: refusing nested/stale installer assets.",
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const stage = assertStagingTarget(root, path.join(root, "dist/pages"));
  await insideDirectory(root, path.dirname(stage));
  try {
    const st = await lstat(stage);
    if (st.isSymbolicLink()) throw new Error("Staging target is a link.");
    await insideDirectory(root, stage);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  // Absolute path and real parent are verified above before recursive removal.
  await rm(stage, { recursive: true, force: true });
  await cp(home, stage, { recursive: true, force: false, errorOnExist: true });
  await mkdir(path.join(stage, "accessory-install"));
  await writeFile(path.join(stage, "accessory-install/index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Set up the accessory</title><script>location.replace("../flash/")</script><noscript><meta http-equiv="refresh" content="0;url=../flash/"></noscript><a href="../flash/">Set up the accessory · 准备配件</a></html>`);
  const raw = JSON.parse(
    await readFile(path.join(home, "site-config.json"), "utf8"),
  );
  await writeFile(
    path.join(stage, "site-config.json"),
    JSON.stringify({ ...raw, installerPath: "./flash/" }, null, 2) + "\n",
  );
  await writeFile(path.join(stage, ".nojekyll"), "");
  const files = await auditStaticTree(stage);

  const records = [];
  for (const file of files) {
    const bytes = await readFile(file);
    records.push({
      path: path.relative(stage, file).replaceAll("\\", "/"),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  await writeFile(
    path.join(stage, "BUILD_INFO.json"),
    JSON.stringify(
      {
        schema: 1,
        builtAt: new Date().toISOString(),
        apps: ["./", "./flash/"],
        files: records,
      },
      null,
      2,
    ) + "\n",
  );
  return {
    directory: stage,
    files: records.length,
    bytes: records.reduce((sum, r) => sum + r.bytes, 0),
  };
}
