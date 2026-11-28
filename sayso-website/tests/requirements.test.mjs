import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requirements, requirementGroups, requirementRows } from "../src/requirements.js";
import { copy } from "../src/copy.js";

test("requirements have matching locale fields and one website/installer source", () => {
  assert.deepEqual(Object.keys(requirements.en), Object.keys(requirements.zh));
  assert.equal(readFileSync("src/requirements.js", "utf8"), readFileSync("sayso-install/src/requirements.js", "utf8"));
  for (const lang of ["en", "zh"]) {
    assert.deepEqual(copy[lang].requirementGroups, requirementGroups(lang));
    assert.deepEqual(requirementGroups(lang).screen, ["phone", "chatgpt", "network"].map(key => requirements[lang][key]));
    assert.deepEqual(requirementGroups(lang).tapping, ["verified", "accessory", "computer"].map(key => requirements[lang][key]));
    assert.equal(copy[lang].hardware, requirements[lang].hardwareSummary);
    assert.equal(copy[lang].free, requirements[lang].fees);
  }
});

import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {normalizeConfig} from '../src/config.mjs';
test("Home, Start, Requirements and accessory setup render the shared localized requirements", async () => {
  const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
  try {
    const { Home, Start, Requirements, Firmware } = await server.ssrLoadModule("/src/App.jsx");
    const escape = (value) => value.replaceAll("'", "&#x27;").replaceAll("& ", "&amp; ");
    for (const lang of ["en", "zh"]) {
      const props = { t: copy[lang], lang, config: normalizeConfig() };
      const render = (Component) => renderToStaticMarkup(React.createElement(Component, props));
      const home = render(Home);
      const start = render(Start);
      const summary = escape(requirements[lang].hardwareSummary);
      for (const key of ["setupSummary", "compatibilityNote", "screenSummary"])
        assert.equal(requirements[lang][key], requirements[lang].hardwareSummary);
      for (const html of [home, start, render(Requirements)])
        assert.equal(html.split(summary).length, 2);
      const homeFees = home.match(/class="pricing-band".*?<\/section>/)?.[0];
      assert.equal(homeFees?.match(/<p>/g)?.length, 3);
      for (const paragraph of requirements[lang].feeParagraphs)
        assert.ok(homeFees.includes(`<p>${escape(paragraph)}</p>`));
      assert.ok(start.includes(escape(requirements[lang].fees)));
      for (const html of [home, start]) {
        assert.match(html, lang === "en" ? /SaySo’s free plan includes 10/ : /SaySo 免费版每月包含 10 次/);
        assert.match(html, lang === "en" ? /“Subscription plans” under SaySo Pro/ : /在 SaySo Pro 下点“订阅方案”/);
      }
      const requirementsPage = render(Requirements);
      assert.ok(requirementsPage.includes(`<p class="requirements-keyboard">${copy[lang].requirementsKeyboard}</p></section>`));
      assert.ok(!requirementsPage.includes(copy[lang].keyboardNote));
      assert.ok(!requirementsPage.includes(copy[lang].controlCompatibility));
      assert.equal(requirementsPage.split(copy[lang].usbRequirement).length, 2);
      for (const row of requirementRows(lang)) for (const value of row)
        assert.ok(start.includes(escape(value)), value);
      const firmware = render(Firmware);
      const list = firmware.match(/class="accessory-requirements"[\s\S]*?<ul>(.*?)<\/ul>/)?.[1];
      assert.equal(list?.match(/<li>/g)?.length, 3);
      const label = lang === "en" ? "Start installing" : "开始安装";
      assert.match(firmware, new RegExp(`<a class="button-primary" href="[^"]*flash/">${label}</a>`));
      assert.ok(!home.includes(copy.zh.appNameNote));
      const demoHeading = home.match(/<h2 id="demo-title">(.*?)<\/h2>/)?.[1].replace(/<[^>]+>/g, "");
      assert.equal(demoHeading, escape(copy[lang].everyday.join(" ")));
    }
  } finally { await server.close(); }
});
