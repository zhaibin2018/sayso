import test from "node:test";
import assert from "node:assert/strict";
import { assertBetaAnchors } from "../scripts/verify-beta-anchors.mjs";
import {
  normalizeConfig,
  releaseGaps,
  httpsUrl,
  assetUrl,
} from "../src/config.mjs";

test("empty config keeps release-dependent actions unavailable", () => {
  const c = normalizeConfig(null);
  assert.equal(c.appStoreUrl, null);
  assert.equal(c.installerUrl, null);
  assert.deepEqual(c.compatibility, []);
  assert.ok(releaseGaps({ releaseReady: true }).includes("quotaVerified"));
});
test("App Store link requires HTTPS, correct host and an actual product identifier", () => {
  for (const v of [
    "javascript:alert(1)",
    "https://apps.apple.com.evil.example/us/app/id123",
    "https://apps.apple.com/",
    "https://apps.apple.com/app/id123fake",
    "https://user:pass@apps.apple.com/app/id123",
    "http://apps.apple.com/app/id123",
  ])
    assert.equal(normalizeConfig({ appStoreUrl: v }).appStoreUrl, null);
  assert.equal(
    normalizeConfig({
      appStoreUrl: "https://apps.apple.com/us/app/sayso/id123456789",
    }).appStoreUrl,
    "https://apps.apple.com/us/app/sayso/id123456789",
  );
});
test("missing captions or poster cannot silently become a ready demo", () => {
  assert.equal(
    normalizeConfig({ videos: { food: { mp4: "media/food.mp4" } } }).videos
      .food,
    null,
  );
  assert.ok(
    normalizeConfig({
      videos: {
        food: {
          mp4: "media/food.mp4",
          poster: "media/food.jpg",
          captionsEn: "media/food.en.vtt",
        },
      },
    }).videos.food,
  );
});
test("asset and outbound URL handling rejects executable and traversal locations", () => {
  for (const p of [
    "../private.png",
    "//evil.example/x",
    "data:image/svg+xml,evil",
    "javascript:foo",
    "a\\b.png",
  ])
    assert.equal(assetUrl(p), null);
  assert.equal(assetUrl("media/food.en.vtt"), "media/food.en.vtt");
  assert.equal(
    httpsUrl("https://github.com/sayso/project", "github.com"),
    "https://github.com/sayso/project",
  );
  assert.equal(
    httpsUrl("https://github.com.evil.example/x", "github.com"),
    null,
  );
});
test("compatibility only lists explicit verified combinations and control requires hardware versions", () => {
  const base = {
    model: "test iPhone",
    ios: "test version",
    appVersion: "test build",
    testedAt: "2026-11-16",
    verified: true,
  };
  const c = normalizeConfig({
    compatibility: [
      { ...base, mode: "screen" },
      { ...base, mode: "control" },
      {
        ...base,
        mode: "control",
        accessory: "AtomS3 Lite",
        firmware: "test firmware",
      },
      { ...base, mode: "screen", verified: false },
    ],
  });
  assert.equal(c.compatibility.length, 2);
});
test("step screenshots require provenance and correct language/step", () => {
  const s = {
    step: 1,
    locale: "en",
    src: "media/setup-1.png",
    capturedAt: "2026-11-16",
    ios: "test",
    appVersion: "test",
    chatgptVersion: "test",
  };
  assert.equal(
    normalizeConfig({
      screenshots: [s, { ...s, step: 5 }, { ...s, chatgptVersion: null }],
    }).screenshots.length,
    1,
  );
});

test("beta invitations require the Apple join origin and an invitation code", () => {
  const base="https://testflight.apple.com";
  for (const value of [null,"",base+"/",base+"/join/",base+":8443/join/abc",base+"/join/placeholder",base+"/join/code?else",base+".example/join/123","https://user@testflight.apple.com/join/abc"])
    assert.equal(normalizeConfig({testFlightUrl:value}).testFlightUrl,null);
  assert.equal(normalizeConfig({testFlightUrl:base+"/join/Ab12cD34"}).testFlightUrl,base+"/join/Ab12cD34");
});

test("beta gate checks invitation placement and consistency on Home and Get started", () => {
  const invite = "https://testflight.apple.com/join/Ab12cD34";
  const link = (slot, href = invite) => `<a href="${href}" data-beta-link="${slot}">Invitation</a>`;
  for (const [route, slot] of [["home", "hero"], ["start", "start"]]) {
    assert.doesNotThrow(() => assertBetaAnchors(route, "<span>Beta sign-up opens soon</span>", null));
    assert.doesNotThrow(() => assertBetaAnchors(route, "<p>Pending</p>", invite + "?invalid=1"));
    assert.doesNotThrow(() => assertBetaAnchors(route, link("banner") + link(slot), invite));
    assert.throws(() => assertBetaAnchors(route, link("banner") + link("banner"), invite), /inconsistent/);
    assert.throws(() => assertBetaAnchors(route, link("banner") + link(slot, invite + "Bad"), invite), /inconsistent/);
    assert.throws(() => assertBetaAnchors(route, link("banner"), null), /inconsistent/);
  }
});
