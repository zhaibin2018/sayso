import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  assertStagingTarget,
  assemblePages,
  sharedLinks,
  auditStaticTree,
} from "../scripts/assemble-pages.mjs";
import { linkTarget, normalizeConfig, releaseGaps } from "../src/config.mjs";
test("installer pathname navigation survives root and nested project bases", () => {
  for (const base of [
    "https://owner.github.io/sayso/",
    "https://custom.example/",
    "https://owner.github.io/RepoCase/",
  ]) {
    for (const app of ["./accessory-install/", "./accessory-install/index.html"]) {
      const link = linkTarget(app, "app");
      assert.equal(link.external, false);
      assert.equal(
        new URL(link.href, base + "#/firmware").href,
        new URL(app, base).href,
      );
    }
  }
  assert.deepEqual(linkTarget("firmware"), {
    href: "#/firmware",
    external: false,
  });
  for (const bad of [
    "/accessory-install/",
    "//evil.example",
    "../accessory-install/",
    "./accessory-install/../",
    "./accessory-install/%2e%2e/",
    "javascript:alert(1)",
  ])
    assert.equal(linkTarget(bad, "app"), null);
  assert.equal(
    normalizeConfig({ installerPath: "./accessory-install/" }).installerPath,
    "./accessory-install/",
  );
  assert.equal(
    releaseGaps({ installerPath: "./accessory-install/" }).includes(
      "installer destination",
    ),
    false,
  );
});
test("shared presentation configuration excludes all authorization and firmware fields", () => {
  const result = sharedLinks({
    releaseReady: true,
    compatibility: [{ verified: true }],
    TRUSTED_RELEASE_KEYS: { x: "y" },
    installerUrl: "https://other.example",
    appStoreUrl: "javascript:alert(1)",
    repositoryUrl: "https://github.com/example/repo",
  });
  assert.equal(result.appStoreUrl, null);
  assert.equal(result.repositoryUrl, "https://github.com/example/repo");
  for (const key of [
    "releaseReady",
    "compatibility",
    "TRUSTED_RELEASE_KEYS",
    "installerUrl",
  ])
    assert.equal(Object.hasOwn(result, key), false);
  assert.equal(
    new URL(result.startPath, "https://owner.github.io/sayso/accessory-install/").href,
    "https://owner.github.io/sayso/#/start",
  );
});
test("staging removal refuses any other target", () => {
  const root = path.resolve("test-project");
  assert.equal(
    assertStagingTarget(root, path.join(root, "dist/pages")),
    path.join(root, "dist/pages"),
  );
  for (const wrong of [
    root,
    path.dirname(root),
    path.join(root, "dist/client"),
    path.join(root, "../pages"),
  ])
    assert.throws(() => assertStagingTarget(root, wrong));
});
test("aggregation isolates apps, removes stale output and cannot authorize firmware", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "sayso-pages-test-"));
  try {
    for (const folder of ["dist/client", "sayso-install/dist/client"]) {
      const full = path.join(fixture, folder);
      await mkdir(path.join(full, "assets"), { recursive: true });
      await writeFile(
        path.join(full, "index.html"),
        '<html><script src="./assets/main.js"></script></html>',
      );
      await writeFile(
        path.join(full, "assets/main.js"),
        `console.log(${JSON.stringify(folder)})`,
      );
    }
    await mkdir(path.join(fixture, "sayso-install/dist/client/releases"));
    const channel = '{"status":"unavailable"}';
    await writeFile(
      path.join(fixture, "sayso-install/dist/client/releases/channel.json"),
      channel,
    );
    await writeFile(
      path.join(fixture, "dist/client/site-config.json"),
      JSON.stringify({
        releaseReady: true,
        compatibility: [{ verified: true }],
      }),
    );
    await mkdir(path.join(fixture, "dist/client/install"));
    const installPage = '<html><a href="../">SaySo service installation</a></html>';
    await writeFile(path.join(fixture, "dist/client/install/index.html"), installPage);
    const result = await assemblePages(fixture);
    assert.equal(await readFile(path.join(result.directory, "install/index.html"), "utf8"), installPage);
    assert.equal(
      JSON.parse(
        await readFile(path.join(result.directory, "site-config.json"), "utf8"),
      ).installerPath,
      "./accessory-install/",
    );
    assert.equal(
      await readFile(
        path.join(result.directory, "accessory-install/releases/channel.json"),
        "utf8",
      ),
      channel,
    );
    assert.notEqual(
      await readFile(path.join(result.directory, "assets/main.js"), "utf8"),
      await readFile(
        path.join(result.directory, "accessory-install/assets/main.js"),
        "utf8",
      ),
    );
    await writeFile(path.join(result.directory, "accessory-install/stale.bin"), "stale");
    await assemblePages(fixture);
    await assert.rejects(
      access(path.join(result.directory, "accessory-install/stale.bin")),
    );
    await writeFile(
      path.join(fixture, "sayso-install/dist/client/assets/main.js"),
      "SIMULATED_INSTALL_ONLY",
    );
    await assert.rejects(assemblePages(fixture), /simulation/);
  } finally {
    const absolute = path.resolve(fixture);
    if (
      path.dirname(absolute) !== path.resolve(os.tmpdir()) ||
      !path.basename(absolute).startsWith("sayso-pages-test-")
    )
      throw new Error("Unexpected fixture cleanup target");
    await rm(absolute, { recursive: true, force: true });
  }
});
test("public artifact audit rejects leaked private or debug files", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "sayso-pages-test-"));
  try {
    await writeFile(path.join(fixture, ".env.local"), "TEST_ONLY=1");
    await assert.rejects(auditStaticTree(fixture), /Private\/development/);
  } finally {
    if (
      path.dirname(path.resolve(fixture)) === path.resolve(os.tmpdir()) &&
      path.basename(fixture).startsWith("sayso-pages-test-")
    )
      await rm(fixture, { recursive: true, force: true });
  }
});
