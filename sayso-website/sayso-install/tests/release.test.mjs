import test from "node:test";
import assert from "node:assert/strict";
import {
  assertManifest,
  verifyEnvelope,
  assertVerified,
  sha256,
  boundedRead,
  downloadFirmware,
} from "../src/lib/release.js";
import { flashDevice } from "../src/lib/serial.js";
import {
  assertSecurity,
  compatibility,
  environment,
  languageFrom,
  safeAppStoreURL,
  MODELS,
} from "../src/lib/policy.js";
import { expiryStatus } from "../src/lib/expiry.js";

const security = () => ({
  chipId: 9,
  flags: 0,
  flashCryptCnt: 0,
  keyPurposes: [0, 0, 0, 0, 0, 0, 0],
});
test("current Apple model names do not imply release compatibility", () => {
  for (const id of [
    "iPhone 17",
    "iPhone 17 Pro",
    "iPhone 17 Pro Max",
    "iPhone Air",
    "iPhone 17e",
    "iPhone 18 Pro",
    "iPhone 18 Pro Max",
    "iPhone Duo",
  ]) {
    assert.equal(MODELS.find((model) => model.id === id)?.connector, "usb-c");
    assert.equal(compatibility(id, null).kind, "unavailable");
    assert.equal(
      compatibility(id, {
        compatibility: [{ model: "iPhone 16 Pro", minIOS: 17, maxIOS: 26 }],
      }).kind,
      "unverified",
    );
  }
  assert.equal(new Set(MODELS.map((model) => model.id)).size, MODELS.length);
});
test("expiry warning includes the exact 30-day and expiry boundaries", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(expiryStatus(null, now).kind, "unavailable");
  assert.equal(expiryStatus({ expiresAt: "invalid" }, now).kind, "invalid");
  assert.equal(
    expiryStatus(
      { expiresAt: new Date(now + 30 * 86400000 + 1).toISOString() },
      now,
    ).kind,
    "current",
  );
  const warning = expiryStatus(
    { expiresAt: new Date(now + 30 * 86400000).toISOString() },
    now,
  );
  assert.equal(warning.kind, "expiring");
  assert.equal(warning.daysRemaining, 30);
  assert.equal(warning.reviewBy, new Date(now).toISOString());
  assert.equal(
    expiryStatus({ expiresAt: new Date(now).toISOString() }, now).kind,
    "expired",
  );
});
async function fixture(change = (x) => x) {
  const image = new Uint8Array(65536);
  image[0] = 0xe9;
  image[12] = 9;
  const payload = change({
    schema: 1,
    status: "published",
    profile: "atoms3-lite-diy",
    version: "1.0.0",
    issuedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    hardware: { chip: "ESP32-S3", flashBytes: 8388608 },
    security: {
      efuseWrites: false,
      secureBoot: false,
      flashEncryption: false,
      nvsEncryption: false,
    },
    approvals: {
      efuseLifecycle: true,
      downloadMode: true,
      usbMatrix: true,
      evidenceSha256: "a".repeat(64),
    },
    installMode: "clean",
    compatibility: [{ model: "iPhone 16 Pro", minIOS: 17, maxIOS: 26 }],
    artifact: {
      path: "firmware/test.bin",
      offset: 0,
      size: image.length,
      sha256: await sha256(image),
    },
  });
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    raw,
  );
  const publicKey = Buffer.from(
    await crypto.subtle.exportKey("spki", keys.publicKey),
  ).toString("base64");
  return {
    image,
    payload,
    envelope: {
      algorithm: "ECDSA-P256-SHA256",
      keyId: "test",
      payload: Buffer.from(raw).toString("base64"),
      signature: Buffer.from(signature).toString("base64"),
    },
    keys: { test: publicKey },
  };
}
function device(image) {
  const calls = [];
  return {
    calls,
    identity: "test-only",
    close: async () => calls.push("close"),
    loader: {
      chip: { readMac: async () => "test-only" },
      getSecurityInfo: async () => security(),
      detectFlashSize: async () => "8MB",
      runStub: async () => calls.push("stub"),
      eraseFlash: async () => calls.push("erase"),
      writeFlash: async (options) => {
        calls.push("write");
        assert.equal(options.eraseAll, false);
        assert.equal(options.flashMode, "keep");
        assert.equal(options.flashSize, "keep");
        assert.equal(options.flashFreq, "keep");
        assert.match(options.calculateMD5Hash(image), /^[a-f0-9]{32}$/);
        options.reportProgress(0, image.length, image.length);
      },
      readFlash: async () => {
        calls.push("readback");
        return image.slice();
      },
      after: async () => calls.push("restart"),
    },
  };
}
test("signed exact payload is accepted, frozen and tracked", async () => {
  const f = await fixture();
  const r = await verifyEnvelope(f.envelope, f.keys);
  assertVerified(r);
  assert(Object.isFrozen(r.artifact));
  assert.throws(() => assertVerified(f.payload), /unverified/);
  assert.throws(() => {
    r.security.efuseWrites = true;
  });
});
test("tampering and untrusted signer cannot pass", async () => {
  const f = await fixture();
  const bad = {
    ...f.envelope,
    payload: Buffer.from(
      JSON.stringify({ ...f.payload, version: "9.0.0" }),
    ).toString("base64"),
  };
  await assert.rejects(verifyEnvelope(bad, f.keys), /signature/);
  await assert.rejects(verifyEnvelope(f.envelope, {}), /signature/);
});
test("expired signed releases get a distinct error only after signature validation", async () => {
  const f = await fixture((m) => ({
    ...m,
    issuedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
  }));
  await assert.rejects(
    verifyEnvelope(f.envelope, f.keys),
    (error) =>
      error.message === "release-expired" &&
      error.expiresAt === f.payload.expiresAt,
  );
  await assert.rejects(verifyEnvelope(f.envelope, {}), /signature-invalid/);
});
test("expiry while waiting blocks a previously verified release before device actions", async () => {
  const f = await fixture();
  const release = await verifyEnvelope(f.envelope, f.keys);
  const connected = device(f.image),
    originalNow = Date.now;
  try {
    Date.now = () => Date.parse(release.expiresAt);
    assert.throws(() => assertVerified(release), /release-expired/);
    await assert.rejects(
      flashDevice(connected, release, f.image, () => {}),
      /release-expired/,
    );
    assert.deepEqual(connected.calls, []);
  } finally {
    Date.now = originalNow;
  }
});
test("release validation rejects unsafe security, stale release, unapproved lifecycle and incompatible images", async (t) => {
  const f = await fixture();
  const changes = [
    (x) => (x.security.efuseWrites = true),
    (x) => (x.security.flashEncryption = true),
    (x) => (x.security.nvsEncryption = true),
    (x) => (x.security.secureBoot = true),
    (x) => (x.approvals.efuseLifecycle = false),
    (x) => (x.profile = "brand-hardware"),
    (x) => (x.expiresAt = "2000-01-01"),
    (x) => (x.issuedAt = "2099-01-01"),
    (x) => (x.artifact.path = "../private.bin"),
    (x) => (x.artifact.path = "https://evil.invalid/a.bin"),
    (x) => (x.artifact.size = 9000000),
    (x) => (x.artifact.offset = 65536),
    (x) => (x.compatibility[0].maxIOS = 16),
    (x) => (x.hardware.flashBytes = 16777216),
  ];
  for (let i = 0; i < changes.length; i++)
    await t.test(`guard ${i + 1}`, () => {
      const m = structuredClone(f.payload);
      changes[i](m);
      assert.throws(() => assertManifest(m), /manifest-invalid/);
    });
});
test("bounded streaming rejects overruns even without content-length", async () => {
  const r = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(8));
        c.enqueue(new Uint8Array(8));
        c.close();
      },
    }),
  );
  await assert.rejects(boundedRead(r, 12), /download-size/);
});
test("firmware hash is checked before returning bytes", async () => {
  const f = await fixture(),
    r = await verifyEnvelope(f.envelope, f.keys),
    old = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(f.image);
    assert.equal(
      (
        await downloadFirmware(
          r,
          "https://example.com/install/",
          undefined,
          () => {},
        )
      ).length,
      f.image.length,
    );
    globalThis.fetch = async () => new Response(new Uint8Array(f.image.length));
    await assert.rejects(
      downloadFirmware(r, "https://example.com/install/", undefined, () => {}),
      /hash-mismatch/,
    );
  } finally {
    globalThis.fetch = old;
  }
});
test("flash checks hash and security before any destructive call", async () => {
  const f = await fixture(),
    r = await verifyEnvelope(f.envelope, f.keys),
    d = device(f.image),
    bad = f.image.slice();
  bad[25] = 1;
  await assert.rejects(
    flashDevice(d, r, bad, () => {}),
    /hash/,
  );
  assert.deepEqual(d.calls, []);
  d.loader.getSecurityInfo = async () => ({ ...security(), flags: 1 });
  await assert.rejects(
    flashDevice(d, r, f.image, () => {}),
    /security/,
  );
  assert.deepEqual(d.calls, []);
});
test("changed identity prevents erase", async () => {
  const f = await fixture(),
    r = await verifyEnvelope(f.envelope, f.keys),
    d = device(f.image);
  d.loader.chip.readMac = async () => "other";
  await assert.rejects(
    flashDevice(d, r, f.image, () => {}),
    /device-changed/,
  );
  assert.deepEqual(d.calls, []);
});
test("successful write requires independent readback; never asserts startup", async () => {
  const f = await fixture(),
    r = await verifyEnvelope(f.envelope, f.keys),
    d = device(f.image);
  const result = await flashDevice(d, r, f.image, () => {});
  assert.deepEqual(d.calls, [
    "stub",
    "erase",
    "write",
    "readback",
    "restart",
    "close",
  ]);
  assert.equal(result.startupVerified, false);
  assert.equal(result.readback, true);
});
test("readback mismatch cannot report success or restart", async () => {
  const f = await fixture(),
    r = await verifyEnvelope(f.envelope, f.keys),
    d = device(f.image);
  d.loader.readFlash = async () => new Uint8Array(f.image.length);
  await assert.rejects(
    flashDevice(d, r, f.image, () => {}),
    /readback/,
  );
  assert(!d.calls.includes("restart"));
});
test("failed reset preserves distinction between written and booted", async () => {
  const f = await fixture(),
    r = await verifyEnvelope(f.envelope, f.keys),
    d = device(f.image);
  d.loader.after = async () => {
    throw new Error("port lost");
  };
  const result = await flashDevice(d, r, f.image, () => {});
  assert.equal(result.written, true);
  assert.equal(result.restarted, false);
  assert.equal(result.startupVerified, false);
});
test("security info fails closed including HMAC keys and crypt count", () => {
  assert.doesNotThrow(() => assertSecurity(security()));
  for (const bad of [
    null,
    { ...security(), chipId: 0 },
    { ...security(), flashCryptCnt: 1 },
    { ...security(), keyPurposes: [0, 0, 8, 0, 0, 0] },
  ])
    assert.throws(() => assertSecurity(bad));
});
test("compatibility never treats USB-C as approval", () => {
  assert.equal(compatibility("iPhone 16 Pro", null).kind, "unavailable");
  assert.equal(compatibility("iPhone 11", null).kind, "lightning");
  assert.equal(compatibility("other", null).kind, "unknown");
  assert.equal(
    compatibility("iPhone 15", { compatibility: [] }).kind,
    "unverified",
  );
});
test("mobile and unsupported browser blocked before serial permission", () => {
  assert.equal(
    environment(
      { userAgent: "Mozilla Chrome/132", serial: {}, maxTouchPoints: 0 },
      true,
    ).supported,
    true,
  );
  for (const nav of [
    { userAgent: "iPhone Chrome/132", serial: {} },
    { userAgent: "Macintosh Chrome/132", maxTouchPoints: 5, serial: {} },
    { userAgent: "Firefox/132", serial: {} },
    { userAgent: "Chrome/132" },
  ])
    assert.equal(environment(nav, true).supported, false);
});
test("language fallback and App Store target are deterministic", () => {
  assert.equal(languageFrom(null, ["zh-SG"]), "zh");
  assert.equal(languageFrom(null, ["fr-FR"]), "en");
  assert.equal(languageFrom("en", ["zh"]), "en");
  assert.equal(
    safeAppStoreURL("https://apps.apple.com/us/app/test/id123"),
    "https://apps.apple.com/us/app/test/id123",
  );
  for (const url of [
    "",
    "javascript:alert(1)",
    "https://apps.apple.com.evil/a/id1",
    "http://apps.apple.com/a/id1",
  ])
    assert.equal(safeAppStoreURL(url), null);
});
