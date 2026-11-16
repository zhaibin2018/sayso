import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSiteLinks,
  preferredLanguage,
  canLeaveForWebsite,
} from "../src/site-links.js";
test("only exact parent website routes and public destinations survive", () => {
  const c = normalizeSiteLinks({
    schema: 1,
    homePath: "../",
    startPath: "../#/start",
    privacyPath: "//evil.example",
    supportPath: "../../secret",
    repositoryUrl: "javascript:alert(1)",
    appStoreUrl: "https://apps.apple.com/us/app/id123",
    releaseReady: true,
    TRUSTED_RELEASE_KEYS: { evil: "key" },
    compatibility: [{ verified: true }],
    firmwareUrl: "evil.bin",
  });
  assert.equal(c.homePath, "../");
  assert.equal(c.startPath, "../#/start");
  assert.equal(c.privacyPath, null);
  assert.equal(c.supportPath, null);
  assert.equal(c.repositoryUrl, null);
  assert.equal(c.appStoreUrl, "https://apps.apple.com/us/app/id123");
  for (const key of [
    "releaseReady",
    "TRUSTED_RELEASE_KEYS",
    "compatibility",
    "firmwareUrl",
  ])
    assert.equal(Object.hasOwn(c, key), false);
});
test("standalone mode has no invented parent website or store", () => {
  const c = normalizeSiteLinks();
  assert.equal(c.homePath, null);
  assert.equal(c.appStoreUrl, null);
});
test("shared preferences follow same supported-language and default rules", () => {
  assert.equal(preferredLanguage("zh", ["en"]), "zh");
  assert.equal(preferredLanguage(null, ["fr", "zh-CN"]), "zh");
  assert.equal(preferredLanguage(null, ["en-US", "zh"]), "en");
  assert.equal(preferredLanguage(null, ["fr"]), "en");
});
test("website navigation is blocked while busy or synchronously locked", () => {
  assert.equal(canLeaveForWebsite(false, false), true);
  for (const pair of [
    [true, false],
    [false, true],
    [true, true],
  ])
    assert.equal(canLeaveForWebsite(...pair), false);
});
