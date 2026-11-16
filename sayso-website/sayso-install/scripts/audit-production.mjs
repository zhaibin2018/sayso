import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist/client");
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
const forbidden = [
  "SIMULATED_INSTALL_ONLY",
  "1.0.3-preview",
  "simulateInstall",
  "Simulate write failure",
  "模拟写入失败",
  "Interactive preview · No hardware access",
];
for (const file of await walk(root)) {
  if (/preview.*\.js$/.test(path.basename(file)))
    throw new Error(`Preview chunk leaked: ${file}`);
  if (!/\.(js|html|json)$/.test(file)) continue;
  const contents = await readFile(file, "utf8");
  for (const marker of forbidden)
    if (contents.includes(marker))
      throw new Error(`Preview marker leaked: ${marker} in ${file}`);
  if (/PRIVATE KEY-----/.test(contents))
    throw new Error("Private key in public build");
}
const html = await readFile(path.join(root, "index.html"), "utf8");
if (/(?:src|href)="\/assets\//.test(html))
  throw new Error("Root-relative assets break GitHub project Pages");
console.log(
  "Production audit passed: no simulation code, private keys or root-relative assets.",
);
