import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseGaps, normalizeConfig } from "../src/config.mjs";
const contentRoot = fileURLToPath(
  new URL(
    process.argv.includes("--integrated") ? "../dist/pages/" : "../public/",
    import.meta.url,
  ),
);
const raw = JSON.parse(
  await readFile(resolve(contentRoot, "site-config.json"), "utf8"),
);
const gaps = releaseGaps(raw),
  c = normalizeConfig(raw);
const assets = [
  c.appStoreBadge,
  ...c.screenshots.map((s) => s.src),
  ...Object.values(c.videos)
    .filter(Boolean)
    .flatMap((v) => Object.values(v)),
].filter(Boolean);
for (const p of assets)
  if (!p.startsWith("https:"))
    try {
      await access(resolve(contentRoot, p));
    } catch {
      gaps.push(`missing local asset: ${p}`);
    }
if (c.installerPath)
  try {
    await access(resolve(contentRoot, "install/index.html"));
  } catch {
    gaps.push("missing integrated installer build");
  }
if (gaps.length) {
  console.error(
    "Public release is not ready:\n" + gaps.map((x) => `- ${x}`).join("\n"),
  );
  process.exitCode = 1;
} else
  console.log(
    "Configuration and local assets complete. Product acceptance and external destinations still require human verification.",
  );
