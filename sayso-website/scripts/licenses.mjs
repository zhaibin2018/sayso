import { readFile, writeFile, readdir } from "node:fs/promises";
const packages = [
  "react",
  "react-dom",
  "scheduler",
  "@phosphor-icons/react",
  "@fontsource-variable/inter",
  "qrcode",
  "dijkstrajs",
  "pngjs",
];
let text =
  "SaySo website — third-party notices\n\nThese licenses cover their named dependencies only. They do not license the SaySo app, firmware, plugin or brand.\n";
for (const name of packages) {
  const root = new URL(`../node_modules/${name}/`, import.meta.url);
  const meta = JSON.parse(
    await readFile(new URL("package.json", root), "utf8"),
  );
  const files = await readdir(root);
  const license = files.find((x) => /^(license|ofl)(\.|$)/i.test(x));
  if (!license) throw new Error(`No license file found: ${name}`);
  text += `\n\n===== ${name} ${meta.version} (${meta.license}) =====\n\n${await readFile(new URL(license, root), "utf8")}`;
}
// Frozen notices for the exact CDN tools; standalone website builds stay independent.
text += await readFile(
  new URL("../public/flash/TOOL_NOTICES.txt", import.meta.url),
  "utf8",
);
await writeFile(
  new URL("../public/THIRD_PARTY_NOTICES.txt", import.meta.url),
  text,
);
console.log("Bundled third-party notices generated.");
