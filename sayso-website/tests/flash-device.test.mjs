import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { flashDevice } from "../public/flash/flash-device.js";
import { languageFrom } from "../public/language.js";
import { preferredLanguage } from "../sayso-install/src/site-links.js";
import { dialogCopy } from "../public/flash/flash-dialog.js";
const root = new URL("../public/flash/firmware/", import.meta.url);
async function bundle() {
  const release = JSON.parse(await readFile(new URL("release.json", root)));
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root)));
  const bytes = new Uint8Array(await readFile(new URL(release.file, root)))
    .buffer;
  return { release, manifest, bytes };
}
function fake(bundle, options = {}) {
  const calls = [],
    safe = {
      chipId: 9,
      flags: 0,
      flashCryptCnt: 0,
      keyPurposes: [0, 0, 0, 0, 0, 0],
    };
  let reads = 0;
  const tool = {
    Transport: class {
      constructor() {
        calls.push("transport");
      }
      async disconnect() {
        calls.push("disconnect");
        if (options.disconnectedOnReset) throw Error("already disconnected");
      }
    },
    ESPLoader: class {
      chip = {
        CHIP_NAME: options.chip || "ESP32-S3",
        readMac: async () =>
          options.changed && reads++ ? "other" : "identity",
      };
      async detectChip() {
        calls.push("connect");
      }
      async getSecurityInfo() {
        return options.security || safe;
      }
      async detectFlashSize() {
        return options.size || "8MB";
      }
      async runStub() {
        calls.push("stub");
      }
      async eraseFlash() {
        calls.push("erase");
      }
      async writeFlash(config) {
        calls.push("write");
        assert.equal(config.fileArray[0].address, 0);
        assert.deepEqual(
          config.fileArray[0].data,
          new Uint8Array(bundle.bytes),
        );
        assert.equal(config.eraseAll, false);
        if (options.writeError) throw Error("write");
        config.reportProgress(0, 46, 100);
      }
      async readFlash() {
        calls.push("readback");
        const bytes = new Uint8Array(bundle.bytes.slice(0));
        if (options.badReadback) bytes[0] ^= 1;
        return bytes;
      }
      async after() {
        calls.push("restart");
      }
    },
    md5: { ArrayBuffer: { hash: () => "md5" } },
  };
  return { tool, calls };
}
test("primary browser language and explicit preference agree across website installers", () => {
  for (const langs of [
    ["zh-Hans"],
    ["zh-SG"],
    ["zh-CN"],
    ["zh-TW"],
    ["en-SG", "zh"],
    ["en-US"],
    ["fr", "zh"],
    [],
  ]) {
    for (const saved of [null, "invalid", "zh", "en"])
      assert.equal(languageFrom(saved, langs), preferredLanguage(saved, langs));
  }
  assert.equal(languageFrom(null, ["zh-SG"]), "zh");
  assert.equal(languageFrom(null, ["fr", "zh-CN"]), "en");
  assert.deepEqual(
    Object.keys(dialogCopy.zh).sort(),
    Object.keys(dialogCopy.en).sort(),
  );
});
test("verified bytes pass security/identity checks, erase first and verify readback before success", async () => {
  const b = await bundle(),
    { tool, calls } = fake(b),
    states = [];
  await flashDevice({}, b, tool, (s) => states.push(s));
  assert.deepEqual(calls, [
    "transport",
    "connect",
    "stub",
    "erase",
    "write",
    "readback",
    "restart",
    "disconnect",
  ]);
  assert.deepEqual(
    states.map((s) => s.phase),
    ["preparing", "erasing", "writing", "writing", "verifying", "restarting"],
  );
  assert.equal(states[3].percent, 46);
});
test("tampered bytes and unauthorized release fail before any port is opened", async () => {
  for (const kind of ["bytes", "release"]) {
    const b = await bundle();
    if (kind === "bytes") new Uint8Array(b.bytes)[0] ^= 1;
    else b.release.channel = "internal";
    const { tool, calls } = fake(b);
    await assert.rejects(flashDevice({}, b, tool, () => {}));
    assert.deepEqual(calls, []);
  }
});
test("unsupported chip, flash size, changed identity and provisioned security cannot erase or write", async () => {
  for (const options of [
    { chip: "ESP32" },
    { size: "4MB" },
    { changed: true },
    { security: { chipId: 9, flags: 1 } },
  ]) {
    const b = await bundle(),
      { tool, calls } = fake(b, options);
    await assert.rejects(
      flashDevice({}, b, tool, () => {}),
      /wrongDevice|safetyFailed/,
    );
    assert.ok(!calls.includes("erase") && !calls.includes("write"));
    assert.equal(calls.at(-1), "disconnect");
  }
});
test("write failure and bad readback close transport and cannot report completion", async () => {
  for (const options of [{ writeError: true }, { badReadback: true }]) {
    const b = await bundle(),
      { tool, calls } = fake(b, options);
    await assert.rejects(flashDevice({}, b, tool, () => {}));
    assert.equal(calls.at(-1), "disconnect");
    assert.ok(!calls.includes("restart"));
  }
});
test("verified USB reset disconnect is successful; readback is still required", async () => {
  const b = await bundle(),
    { tool, calls } = fake(b, { disconnectedOnReset: true });
  await flashDevice({}, b, tool, () => {});
  assert.ok(calls.includes("readback") && calls.includes("restart"));
  assert.equal(calls.at(-1), "disconnect");
});
