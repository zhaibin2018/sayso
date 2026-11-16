import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assemblePages } from "./assemble-pages.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.npm_execpath)
  throw new Error("Run with npm run build:integrated.");
function run(cwd, ...args) {
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, ...args],
    { cwd, stdio: "inherit", env: process.env },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${args.join(" ")} failed in ${path.basename(cwd)}`);
}
run(root, "test");
run(root, "run", "build");
run(root, "run", "test:sites");
run(path.join(root, "sayso-install"), "run", "verify");
run(path.join(root, "sayso-install"), "run", "check:expiry");
const result = await assemblePages(root);
console.log(
  `Integrated Pages artifact: ${result.directory} (${result.files} files, ${result.bytes} bytes)`,
);
