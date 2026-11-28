import { readFile, writeFile } from "node:fs/promises";
import { siteBase } from "./assemble-pages.mjs";
const prefix = siteBase();
const base = "http://127.0.0.1:"+(process.env.PORT || "4320")+prefix;
const manifest = JSON.parse(
  await readFile(
    new URL("../dist/pages/BUILD_INFO.json", import.meta.url),
    "utf8",
  ),
);
const failures = [],
  records = [];
for (const file of manifest.files) {
  const response = await fetch(new URL(file.path, base));
  const bytes = await response.arrayBuffer();
  records.push({
    path: file.path,
    status: response.status,
    bytes: bytes.byteLength,
  });
  if (!response.ok || bytes.byteLength !== file.bytes) failures.push(file.path);
}
for (const route of ["", "accessory-install/", "accessory-install/index.html"]) {
  const response = await fetch(new URL(route, base));
  if (response.status !== 200) failures.push(route);
}
const slash = await fetch(base + "accessory-install", { redirect: "manual" });
if (slash.status !== 308 || slash.headers.get("location") !== prefix + "accessory-install/")
  failures.push("installer trailing-slash redirect");
const missing = await fetch(base + "accessory-install/assets/does-not-exist.js");
if (missing.status !== 404)
  failures.push("missing assets must not become homepage HTML");
for (const route of ["install/","flash/","support/","support/en/","privacy/","privacy/en/"]) {
  if (!(await fetch(base+route)).ok) failures.push(route);
}
const legacy = await (await fetch(base+"accessory-install/")).text();
if (!legacy.includes('location.replace("../flash/")')) failures.push("legacy redirect");
const deep = await fetch(base+"unlisted/deep/path");
const deepBody = await deep.text();
if (deep.status !== 404 || !deepBody.includes("Page not found") || !deepBody.includes(`href="${prefix}site-chrome.css"`)) failures.push("deep 404");
if ((await fetch(base+"#/webrepo-invalid-path")).status !== 200) failures.push("unknown hash document");
const install = await fetch(base+"install?created_at=123");
const canonicalInstall = await fetch(base+"install/");
if (install.status !== 200 || !install.url.endsWith("/install/?created_at=123") ||
    await install.text() !== await canonicalInstall.text()) failures.push("App install URL and request query");
const report = {
  checkedAt: new Date().toISOString(),
  base,
  filesChecked: records.length,
  records,
  trailingSlashStatus: slash.status,
  missingAssetStatus: missing.status,

  failures,
};
await writeFile(
  process.env.SAYSO_HTTP_REPORT || new URL("../integration/http-verification.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
if (failures.length) throw new Error(failures.join(", "));
console.log(
  `Verified ${records.length} static assets, both entrypoints, direct index, directory redirect, missing-asset 404 and localized fallbacks.`,
);
