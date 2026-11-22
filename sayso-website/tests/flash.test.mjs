import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { preparationIsSlow } from "../public/flash/flash-progress.js";
import {
  verifyBundle,
  canInstall,
  PREVIEW_ONLY,
  INSTALLER_URL,
} from "../public/flash/flash-policy.js";

const folder = new URL("../public/flash/firmware/", import.meta.url);
test("preparation warning waits one minute and clears during writing or completion", () => {
  assert.equal(preparationIsSlow("preparing", 1000, 60999), false);
  assert.equal(preparationIsSlow("preparing", 1000, 61000), true);
  assert.equal(preparationIsSlow("preparing", null, 61000), false);
  for (const state of ["writing", "erasing", "finished", "error"])
    assert.equal(preparationIsSlow(state, 1000, 99999), false);
});
async function bundle() {
  const release = JSON.parse(
    await readFile(new URL("release.json", folder), "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", folder), "utf8"),
  );
  const bytes = await readFile(new URL(release.file, folder));
  return { release, manifest, bytes };
}
test("actual production firmware hash, manifest, partition limits and erased NVS agree", async () => {
  const { release, manifest, bytes } = await bundle();
  assert.equal(await verifyBundle(manifest, release, bytes), release.sha256);
  assert.equal(release.usb.pid, "0x4004");
  assert.deepEqual(
    release.parts.map((p) => p.offset),
    [0, 0x8000, 0x10000],
  );
  assert.ok(release.appPartitionFreeBytes > 0);
  assert.deepEqual(bytes.subarray(0x9000, 0x10000), Buffer.alloc(0x7000, 255));
  assert.deepEqual(
    (await readdir(folder)).sort(),
    [release.file, "manifest.json", "release.json"].sort(),
  );
});
test("a changed firmware byte is rejected", async () => {
  const { release, manifest, bytes } = await bundle();
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(
    verifyBundle(manifest, release, bytes),
    /SHA256_MISMATCH/,
  );
});
test("wrong chip, offset, filename, size or identity payload fails closed", async () => {
  const { release, manifest, bytes } = await bundle();
  for (const mutate of [
    (m) => (m.builds[0].chipFamily = "ESP32"),
    (m) => (m.builds[0].parts[0].offset = 4096),
    (m) => (m.builds[0].parts[0].path = "https://other.example/firmware.bin"),
    (m) => (m.version = "other"),
  ]) {
    const changed = structuredClone(manifest);
    mutate(changed);
    await assert.rejects(
      verifyBundle(changed, release, bytes),
      /MANIFEST_MISMATCH/,
    );
  }
  for (const changes of [
    { file: "../private.bin" },
    { bytes: bytes.length + 1 },
    { identityIncluded: true },
    { nvsErasedPadding: false },
  ])
    await assert.rejects(
      verifyBundle(manifest, { ...release, ...changes }, bytes),
      /MANIFEST_MISMATCH/,
    );
});
test("D144 only the production release and complete feature set can install", async () => {
  const { release } = await bundle();
  const ready = {
    secure: true,
    serial: true,
    verified: true,
    installerLoaded: true,
  };
  assert.equal(PREVIEW_ONLY, false);
  assert.equal(release.version, "0.6.1");
  assert.equal(release.channel, "release");
  assert.deepEqual(release.missingFeatures, []);
  assert.equal(canInstall(release, ready), true);
  for (const field of Object.keys(ready))
    assert.equal(canInstall(release, { ...ready, [field]: false }), false);
  for (const change of [
    { channel: "internal" },
    { releaseReady: false },
    {
      features: release.features.filter(
        (f) => f !== "cancel_current_operation",
      ),
    },
  ])
    assert.equal(canInstall({ ...release, ...change }, ready), false);
});
test("installer has a fixed CDN version and only requests a port from a click handler", async () => {
  assert.equal(
    INSTALLER_URL,
    "https://cdn.jsdelivr.net/npm/esptool-js@0.7.1/+esm",
  );
  const script = await readFile(
    new URL("../public/flash/flash.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(script, /getPorts\s*\(/);
  assert.equal((script.match(/requestPort\s*\(/g) || []).length, 1);
  assert.doesNotMatch(script, /esp-web-install-button|ewt-install-dialog/);
  const html = await readFile(
    new URL("../public/flash/index.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /id="locked-install"[^>]*disabled/);
  assert.match(
    html,
    /https:\/\/docs.m5stack.com\/(?:en|zh_CN)\/core\/AtomS3-Lite/,
  );
  assert.match(html, /https:\/\/docs.espressif.com/);
});
