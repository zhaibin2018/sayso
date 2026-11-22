import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { copy } from "../src/copy.js";
import { installation, installationUrl } from "../src/installation.js";
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const plain = (html) => html.replace(/<[^>]*>/g, "").replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">");
function strings(value) {
  if (typeof value === "string") return [value.replaceAll("**", "")];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value?.blocks) return value.blocks.flatMap((b) => strings(b.text || b.items));
  return [];
}
test("both readable policy/support locales retain all approved paragraphs and FAQ answers", async () => {
  for (const lang of ["zh", "en"]) {
    const t = copy[lang];
    for (const route of ["support", "privacy"]) {
      const html = await read(`public/${route}/${lang === "en" ? "en/" : ""}index.html`);
      assert.doesNotMatch(html, /\bonclick\s*=/i);
      assert.match(html, /<script type="module" src="(?:\.\.\/)+document-language\.js"><\/script>/);
      const content = plain(html);
      const values = route === "privacy"
        ? [t.privacyIntro, ...strings(t.privacySections), t.privacyResources, t.publisherLabel, "BIN ZHAI", "saysoapp.help@gmail.com"]
        : strings(t.supportItems).concat(strings(t.supportContactBody));
      for (const value of values) assert.ok(content.includes(value), `${lang}/${route}: ${value}`);
      assert.ok(html.includes(`href="${lang === "en" ? "../../" : "../"}#/${route}"`));
      if (route === "support") for (let i = 0; i < t.supportItems.length; i++) assert.match(html, new RegExp(`<details[^>]*id="faq-${i}"[^>]*open`));
    }
  }
});
test("short link keeps a single immutable release pointer and shares only the language preference", async () => {
  const html = await read("public/install/index.html");
  assert.doesNotMatch(html, /\bonclick\s*=/i);
  assert.match(html, /<script type="module" src="\.\.\/document-language\.js"><\/script>/);
  const commits = [...html.matchAll(/github(?:usercontent)?\.com\/zhaibin2018\/sayso\/(?:blob\/|tree\/)?([a-f0-9]{40})\//g)].map((m) => m[1]);
  assert.ok(commits.length >= 4);
  assert.equal(new Set(commits).size, 1);
  assert.match(html, /Manifest SHA-256:[^]*?<code>[a-f0-9]{64}<\/code>/);
  assert.equal(installation.zh.prompt, `请帮我安装 SaySo：${installationUrl}`);
  assert.equal(installation.en.prompt, `Please install SaySo for me: ${installationUrl}`);
  for (const t of Object.values(installation)) {
    assert.equal(t.phoneSteps.length, 5);
    assert.equal(t.desktopSteps.length, 3);
    assert.equal(t.controlSteps.length, 3);
    for (const steps of [t.phoneSteps, t.desktopSteps, t.controlSteps]) for (const [, body, expected, faq] of steps) {
      assert.ok(body && expected);
      assert.ok(Number.isInteger(faq) && faq >= 0 && faq < copy.en.supportItems.length);
    }
  }
});
