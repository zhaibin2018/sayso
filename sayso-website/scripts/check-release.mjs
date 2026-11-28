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
const beta = process.argv.includes("--channel=beta");
const pending = process.argv.includes("--channel=pre-beta");
const gaps = beta || pending ? [] : releaseGaps(raw),
  c = normalizeConfig(raw);
if (beta || pending) {
  if (!process.argv.includes("--integrated")) gaps.push("publication checks require the final integrated artifact");
  const source = JSON.parse(await readFile(new URL("../public/site-config.json", import.meta.url), "utf8"));
  const expected = normalizeConfig(source);
  if (expected.testFlightUrl !== c.testFlightUrl) gaps.push("final artifact invitation differs from source");
  if (beta && !c.testFlightUrl) gaps.push("valid public TestFlight invitation");
  if (pending && (source.testFlightUrl !== null || raw.testFlightUrl !== null))
    gaps.push("pre-beta publication requires an empty TestFlight invitation");
  if (!c.repositoryUrl || !c.supportEmail || !c.publisherName || !c.privacyApproved) gaps.push("public source, support and privacy");
  const { currentServiceRelease, verifiedPackage } = await import("./service-package.mjs");
  const pkg = await verifiedPackage(raw.servicePackage);
  if (!pkg || (pending && (pkg.version !== currentServiceRelease.version || pkg.pluginVersion !== currentServiceRelease.pluginVersion))) gaps.push(`compatible public service ${currentServiceRelease.version} + plugin ${currentServiceRelease.pluginVersion} package`);
  else {
    const page = await readFile(resolve(contentRoot,"install/index.html"),"utf8");
    for (const field of ["guideURL","manifestURL","archiveURL","manifestSha256","zipSha256"])
      if (!page.includes(pkg[field])) gaps.push("install page "+field);
  }
  if (beta && c.testFlightUrl && pkg) {
    const { checkBetaAnchors } = await import("./verify-beta-anchors.mjs");
    await checkBetaAnchors(c.testFlightUrl);
  }
  if (beta && c.testFlightUrl) {
    for (const file of ["README.md","README.zh-CN.md"]) {
      const checkout = new URL("../.publish/sayso/.git",import.meta.url);
      const local = await access(checkout).then(()=>true,()=>false);
      const text = await readFile(new URL((local ? "../.publish/sayso/" : "../../")+file,import.meta.url),"utf8");
      if (!text.includes("]("+c.testFlightUrl+")")) gaps.push(file+" beta invitation");
    }
  }
}
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
    await access(resolve(contentRoot, "accessory-install/index.html"));
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
