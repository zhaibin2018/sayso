import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const visited = new Set();
let text =
  "SaySo Install — third-party notices\n\nSaySo brand assets are not relicensed by these dependency licenses.\nFirmware has separate release-specific notices.\n";
async function collect(name, from = "") {
  const candidates = from
    ? [`${from}/node_modules/${name}`, `node_modules/${name}`]
    : [`node_modules/${name}`];
  const key = candidates.find((k) => lock.packages[k]);
  if (!key || visited.has(key)) return;
  visited.add(key);
  const pkg = lock.packages[key];
  const files = await readdir(key);
  text += `\n\n=== ${name} ${pkg.version} (${pkg.license || "see license"}) ===\n`;
  for (const f of files.filter((f) =>
    /^(license|licence|copying|notice|ofl)(\.|$)/i.test(f),
  ))
    text += "\n" + (await readFile(path.join(key, f), "utf8")) + "\n";
  for (const dep of Object.keys(pkg.dependencies || {}))
    await collect(dep, key);
}
for (const dep of Object.keys(lock.packages[""].dependencies))
  await collect(dep);
await writeFile("public/THIRD_PARTY_NOTICES.txt", text);
console.log(`Bundled notices for ${visited.size} installed dependencies.`);
