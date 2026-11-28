import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { copy } from "../src/copy.js";
import { installation, installationMessage, installationUrl, serviceDefinition, sharingInstructions, switchingGuide } from "../src/installation.js";
import { normalizeConfig } from "../src/config.mjs";
import { renderEntryBeta } from "../scripts/entry-beta.mjs";
import { assertBetaAnchors } from "../scripts/verify-beta-anchors.mjs";
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const normalizeLines = (value) => value.replace(/\r\n/g, "\n");
const plain = (html) => normalizeLines(html).replace(/<[^>]*>/g, "").replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">");
function strings(value) {
  if (typeof value === "string") return [value.replaceAll("**", "")];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value?.blocks) return value.blocks.flatMap((b) => strings(b.text || b.items || b.link));
  if (value?.route) return [value.before + value.label + value.after];
  return [];
}
test("both readable policy/support locales retain all approved paragraphs and FAQ answers", async () => {
  const config = normalizeConfig(JSON.parse(await read("public/site-config.json")));
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
      for (const value of values) assert.ok(content.includes(normalizeLines(value)), `${lang}/${route}: ${value}`);
      assert.ok(html.includes(`href="${lang === "en" ? "../../" : "../"}#/${route}"`));
      if (route === "support") {
        for (let i = 0; i < t.supportItems.length; i++) assert.match(html, new RegExp(`<details[^>]*id="faq-${i}"[^>]*open`));
        assert.match(html, /id="faq-2"[\s\S]*?<p>[^<]*<a href="(?:\.\.\/)+#\/start"[^>]*>[^<]+<\/a>[^<]*<\/p><ol>/);
        assertBetaAnchors("support-static", html, config.testFlightUrl);
        if (!config.testFlightUrl) assert.ok(content.includes(t.supportBetaPending));
      } else {
        assert.ok(content.includes(lang === "en" ? "diagnostic data" : "诊断数据"));
        assert.doesNotMatch(content, /diagnostic numbers|诊断数字/);
      }
      if (lang === "zh") assert.doesNotMatch(plain(html), /"/);
    }
  }
});
test("short link keeps a single immutable release pointer and shares only the language preference", async () => {
  const html = await read("public/install/index.html");
  assert.doesNotMatch(html, /\bonclick\s*=/i);
  assert.match(html, /<script type="module" src="\.\.\/document-language\.js"><\/script>/);
  const commits = [...html.matchAll(/github(?:usercontent)?\.com\/zhaibin2018\/sayso\/(?:blob\/|tree\/)?([a-f0-9]{40})\//g)].map((m) => m[1]);
  const config = JSON.parse(await read("public/site-config.json"));
  if (!config.servicePackage) {
    assert.equal(commits.length,0);
    assert.match(html,/The compatible SaySo service package isn’t available yet/);
    assert.match(html,/适用的 SaySo 服务安装包还未开放/);
    assert.match(html,/<p>[^<]*<a href=['"]\.\.\/#\/start['"]>Get started<\/a>/);
    assert.match(html,/<p>[^<]*<a href=['"]\.\.\/#\/start['"]>开始使用<\/a>/);
    assert.doesNotMatch(html,/data-copy-message/);
  } else { assert.deepEqual([...new Set(commits)],[config.servicePackage.commit]); }
  assert.equal(installationMessage.zh, `请帮我安装 SaySo：${installationUrl}`);
  assert.equal(installationMessage.en, `Please install SaySo for me: ${installationUrl}`);
  for (const [lang, locale] of Object.entries(installation)) {
    assert.ok(plain(html).includes(serviceDefinition[lang]));
    assert.equal(locale.connection.steps.length, 2);
    assert.equal(locale.controlSteps.length, 2);
    for (const [title, , , faq] of locale.controlSteps) {
      assert.ok(title);
      assert.ok(Number.isInteger(faq) && faq >= 0 && faq < copy.en.supportItems.length);
    }
  }
  assertInstallFooters(html);
});

function assertInstallFooters(html) {
  const sections = [...html.matchAll(/<footer>(.*?)<\/footer>/g)].map((match) => match[1]);
  assert.equal(sections.length, 2);
  for (const [index, footer] of sections.entries()) {
    const languagePath = index === 0 ? "en/" : "";
    assert.deepEqual([...footer.matchAll(/href="([^"]+)"/g)].map((match) => match[1]),
      ["../#/start", `../support/${languagePath}`, `../privacy/${languagePath}`, "../flash/"]);
    assert.doesNotMatch(footer, /·/);
  }
}

test("compatible package requires both pinned digests and every ordered migration", async () => {
  const { verifiedPackage } = await import("../scripts/service-package.mjs");
  const { createHash } = await import("node:crypto");
  const hash = s => createHash("sha256").update(s).digest("hex");
  const commit = "a".repeat(40), label = "v0.13.292-test", archivePath = "release/service/"+label+".zip";
  const skills = Array.from({length:10},(_,i)=>"sayso-test-"+i);
  const migrations = Array.from({length:39},(_,i)=>({path:"mcp/drizzle/"+String(i).padStart(4,"0")+"_test.sql",sha256:hash("fixture")}));
  const files = ["INSTALL.md","mcp/worker/index.ts","mcp/lib/share-control.ts","mcp/contracts/current-actions.json",...skills.map(s=>"plugins/sayso/skills/"+s+"/SKILL.md")].map(path=>({path,sha256:hash("fixture")})).concat(migrations).map(f=>({...f,bytes:7}));
  const manifest={version:"0.13.292",skill_version:"1.2.61",release_label:label,skills,migrations,files};
  const {spawnSync}=await import("node:child_process");
  function makeArchive(body) {
    const program=[
      "import io,json,sys,zipfile",
      "m=json.load(sys.stdin); out=io.BytesIO(); prefix=m['release_label']+'/'",
      "with zipfile.ZipFile(out,'w') as z:",
      " z.writestr(prefix+'manifest.json',json.dumps(m,ensure_ascii=False,separators=(',',':')))",
      " for f in m['files']: z.writestr(prefix+f['path'],sys.argv[1])",
      "sys.stdout.buffer.write(out.getvalue())"
    ].join("\n");
    const result=spawnSync(process.platform==="win32"?"python":"python3",["-c",program,body],{input:JSON.stringify(manifest)});
    assert.equal(result.status,0);
    return result.stdout;
  }
  let archive=makeArchive("fixture");
  const pin=()=>({commit,label,archivePath,manifestSha256:hash(JSON.stringify(manifest)),zipSha256:hash(archive)});
  const load=async url=>new Response(url.endsWith("manifest.json")?JSON.stringify(manifest):url.endsWith(".zip")?archive:"fixture");
  assert.ok((await verifiedPackage(pin(),load)).guideURL.includes(commit));
  await assert.rejects(verifiedPackage({...pin(),zipSha256:"0".repeat(64)},load),/digest/);
  archive=makeArchive("changed");
  await assert.rejects(verifiedPackage(pin(),load),/Archive contents/);
  const latestLabel = "v0.13.293-test";
  const latest = { ...pin(), label: latestLabel, archivePath: `release/service/${latestLabel}.zip` };
  Object.assign(manifest, { release_label: latestLabel, version: "0.13.293", skill_version: "1.2.62" });
  archive = makeArchive("fixture");
  const latestPin = () => ({ ...latest, manifestSha256: hash(JSON.stringify(manifest)), zipSha256: hash(archive) });
  assert.equal((await verifiedPackage(latestPin(), load)).pluginVersion, "1.2.62");
  manifest.skill_version = "1.2.61";
  await assert.rejects(verifiedPackage(latestPin(), load), /Incompatible/);
  Object.assign(manifest, { release_label: label, version: "0.13.292", skill_version: "1.2.61" });
  manifest.migrations.pop();
  await assert.rejects(verifiedPackage(pin(),load),/Incompatible/);
});

test("both installation languages retain the raw message and localized technical fields", async () => {
  const {renderInstallDocument}=await import("../scripts/install-document.mjs");
  const fields={commit:"a".repeat(40),label:"v0.13.293-test",version:"0.13.293",pluginVersion:"1.2.62",guideURL:"https://example.invalid/INSTALL.md",manifestURL:"https://example.invalid/manifest.json",archiveURL:"https://example.invalid/package.zip",manifestSha256:"a".repeat(64),zipSha256:"b".repeat(64)};
  const html=renderInstallDocument(fields);
  assert.equal((html.match(/data-copy-message/g)||[]).length,2);
  for(const lang of ["zh","en"]) assert.ok(plain(html).includes(installationMessage[lang]));
  for(const name of ["公开提交","Public commit","清单 SHA-256","Manifest SHA-256","0.13.293","1.2.62"]) assert.ok(html.includes(name));
  assert.match(html,/<wbr>/);
  const outsideDetails = plain(html.replace(/<details>[\s\S]*?<\/details>/g, ""));
  assert.match(outsideDetails, /Start in the SaySo app by tapping “Connect ChatGPT”\./);
  assert.match(outsideDetails, /请从 SaySo App 点“连接 ChatGPT”开始。/);
  assert.doesNotMatch(html, /installing the SaySo service from a computer|用电脑安装 SaySo 服务/);
  for (const message of Object.values(installationMessage)) assert.ok(!outsideDetails.includes(message));
  assert.doesNotMatch(html.replace(/<details>[\s\S]*?<\/details>/g, ""), /data-copy-message|Manifest SHA-256|清单 SHA-256/);
  assertInstallFooters(html);
});

test("an invalid package replaces stale install links and fails generation", async () => {
  const { installDocument } = await import("../scripts/install-document.mjs");
  const directory = await mkdtemp(join(tmpdir(), "sayso-install-page-"));
  const page = join(directory, "install", "index.html");
  try {
    await mkdir(join(directory, "install"));
    const { writeFile } = await import("node:fs/promises");
    await writeFile(page, '<a data-copy-message href="https://example.invalid/package.zip">Stale</a>');
    await assert.rejects(installDocument(pathToFileURL(directory + "/"), { commit: "invalid" }), /Invalid service package/);
    const html = await readFile(page, "utf8");
    assert.doesNotMatch(html, /data-copy-message|package\.zip|For ChatGPT/);
    assertInstallFooters(html);
  } finally {
    await rm(page);
    const { rmdir } = await import("node:fs/promises");
    await rmdir(join(directory, "install"));
    await rmdir(directory);
  }
});

function stringsWithStraightQuotes(value, path = "zh") {
  if (typeof value === "string") return value.includes('"') ? [[path, value]] : [];
  return value && typeof value === "object"
    ? Object.entries(value).flatMap(([key, child]) => stringsWithStraightQuotes(child, `${path}.${key}`))
    : [];
}

test("Chinese copy contains no ASCII double quotes and the scan identifies a nested bad value", () => {
  assert.deepEqual(stringsWithStraightQuotes(copy.zh), []);
  assert.deepEqual(stringsWithStraightQuotes({ support: ['点"共享"'] }), [["zh.support.0", '点"共享"']]);
});

test("interactive documents and setup use the reviewed bilingual links and button names", async () => {
  const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
  try {
    const { Home, Start, Support, Privacy, Guides, Licenses } = await server.ssrLoadModule("/src/App.jsx");
    for (const lang of ["en", "zh"]) {
      const props = { t: copy[lang], lang, config: normalizeConfig() };
      const render = (Component) => renderToStaticMarkup(createElement(Component, props));
      const support = render(Support);
      const start = render(Start);
      const home = render(Home);
      const guides = render(Guides);
      const labels = installation[lang];
      const sharing = sharingInstructions[lang];
      const staticStart = await read(`public/start/${lang === "en" ? "en/" : ""}index.html`);
      for (const [html, prefix] of [[start, ""], [staticStart, lang === "en" ? "../../" : "../"]]) {
        assert.ok(plain(html).includes(labels.title + labels.before + props.t.startPrerequisite + props.t.beforeSub + labels.phone));
        assert.ok(html.includes(`<h2 id="control-title">${labels.optional}</h2>`));
        assert.ok(html.includes(`<a href="${prefix}#/buy">${props.t.buy}</a></p>`));
        const help = html.match(/<div class="details-content start-help">(.*?)<\/div>/s)[1];
        assert.ok(help.startsWith(`<h3>${props.t.approve}</h3>`));
        assert.ok(!plain(help).includes(props.t.requirementGroups.screen[1][1]));
      }
      assert.doesNotMatch(support + render(Privacy), /Read without scripts|无需脚本阅读|href="[^"]*(?:support|privacy)\/(?:en\/)?"/);
      assert.match(support, /id="faq-2"[\s\S]*?<p>[^<]*<a href="#\/start"[^>]*>[^<]+<\/a>[^<]*<\/p><ol>/);
      for (const html of [start, support, guides]) {
        assert.ok(plain(html).includes(sharing.steps.join("") + sharing.accessoryPrompt));
      }
      assert.equal(sharing.steps.length, 5);
      assert.ok(plain(home).includes(sharing.short));
      assert.ok(plain(home).includes(sharing.example));
      assert.ok(plain(start).includes(labels.sharingResult));
      assert.doesNotMatch(start, /View installation message|查看安装消息|desktop-install-title/);
      assert.ok(start.includes(switchingGuide));
      const connection = plain(start);
      assert.ok(connection.indexOf(serviceDefinition[lang]) < connection.indexOf(labels.workChat));
      for (const [action, outcome] of labels.connection.steps)
        assert.ok(connection.includes(action + (outcome ?? "")));
      assert.ok(start.includes(`</p><p class="setup-step-detail">${labels.connection.steps[0][1]}`));
      assert.ok(start.includes(`<p class="small-note">${labels.sharingResult}</p>`));
      assert.ok(!connection.includes(labels.install.expected));
      assert.ok(start.includes("id=\"assistive-touch\""));
      assert.ok(connection.includes(labels.assistiveTouch.steps.join("")));
      assert.equal(labels.assistiveTouch.steps.length, 7);
      assert.ok(connection.includes(labels.assistiveTouch.open));
      assert.ok(connection.includes(labels.assistiveTouch.confirm));
      assert.doesNotMatch(connection, /Settings did not open|记住你的确认|没能打开设置/);
      assert.ok(connection.includes(labels.permissions.title + labels.permissions.body));
      assert.ok(connection.indexOf(labels.permissions.title) < connection.indexOf(labels.tapping.title));
      for (const text of Object.values(labels.tapping)) assert.ok(connection.includes(text));
      assert.ok(plain(start).includes(lang === "en" ? "Start pairing" : "开始配对"));
      assert.ok(plain(start).includes(copy[lang].approve));
      assert.doesNotMatch(copy[lang].approve, /[.。]$/);
      assert.ok(plain(support).includes(copy[lang].supportBetaPending));
      assert.equal(copy[lang].sceneExamples.food[2], copy[lang].finalTapNote);
      assert.equal(copy[lang].sceneExamples.subscription[2], copy[lang].finalTapNote);
      assert.ok(plain(guides).includes(copy[lang].finalTapNote));
      if (lang === "zh") {
        assert.ok(!plain(home).includes(copy.zh.appNameNote));
        assert.ok(connection.includes(copy.zh.appNameNote + copy.zh.keyboardNote));
        assert.ok(plain(guides).includes(copy.zh.appNameNote + copy.zh.keyboardNote));
      }
      for (const html of [home, start, guides]) {
        assert.ok(plain(html).includes(copy[lang].comparisonBody));
        assert.ok(html.includes("https://help.openai.com/en/articles/20001274-chatgpt-voice"));
      }
      assert.ok(plain(render(Licenses)).includes(copy[lang].licensesTitle + copy[lang].licensesIntro + copy[lang].licensesSub));
    }
  } finally { await server.close(); }
});

test("both support renderers use the validated invitation, including the closed state", async () => {
  const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
  try {
    const { Support, Start } = await server.ssrLoadModule("/src/App.jsx");
    const invite = "https://testflight.apple.com/join/Fixture123";
    const invalid = "https://testflight.apple.com.example.invalid/join/Fixture123";
    for (const lang of ["en", "zh"]) {
      for (const candidate of [null, invalid, invite]) {
        const config = normalizeConfig({ testFlightUrl: candidate });
        const props = { t: copy[lang], lang, config };
        for (const staticDocument of [false, true]) {
          const html = renderToStaticMarkup(createElement(Support, { ...props, staticDocument }));
          assertBetaAnchors("support-static", html, candidate);
          assert.equal(plain(html).includes(copy[lang].supportBetaPending), candidate !== invite);
          assert.equal(plain(html).includes(copy[lang].betaJoin), candidate === invite);
        }
        const start = renderToStaticMarkup(createElement(Start, props));
        assert.equal(plain(start).includes(installation[lang].install.expected), candidate === invite);
      }
    }
  } finally { await server.close(); }
});


test("returning to SaySo and sending a new Work message are conditional on first installing the service", () => {
  const [en, enCondition] = installation.en.connection.steps[0];
  const [zh, zhCondition] = installation.zh.connection.steps[0];
  assert.match(en, /You’ll see a connection link\.$/);
  assert.match(zh, /你会看到连接链接。$/);
  assert.match(enCondition, /^If ChatGPT installs the SaySo service first instead, wait for it to finish, return to the SaySo app, tap “Connect ChatGPT” again, and send the new message in a new Work conversation\.$/);
  assert.match(zhCondition, /^如果 ChatGPT 先帮你安装了 SaySo 服务，请等它装好，回到 SaySo App 再点一次“连接 ChatGPT”，在新的“工作”对话里发送新的消息。$/);
});

test("the no-script entry contains distinct localized headings, beta status and matching document links", async () => {
  const template = await read("index.html");
  const css = await read("public/site-chrome.css");
  const invite = "https://testflight.apple.com/join/Fixture123";
  const invalid = "https://testflight.apple.com.example.invalid/join/Fixture123";
  for (const candidate of [null, invalid, invite]) {
    const html = renderEntryBeta(template, { testFlightUrl: candidate });
    assertBetaAnchors("entry", html, candidate);
    const entries = [...html.matchAll(/<main id="(en|zh)" class="shell no-script-home" lang="[^"]+">([\s\S]*?)<\/main>/g)];
    assert.deepEqual(entries.map(([, lang]) => lang), ["en", "zh"]);
    for (const [, lang, entry] of entries) {
      const suffix = lang === "en" ? "en/" : "";
      const other = lang === "en" ? "zh" : "en";
      assert.equal(entry.includes(copy[lang].betaPending), candidate !== invite);
      assert.equal(entry.includes(copy[lang].betaJoin), candidate === invite);
      assert.ok(!entry.includes(copy[other].betaPending) && !entry.includes(copy[other].betaJoin));
      assert.ok(entry.includes(copy[lang].subtitle));
      assert.ok(entry.includes(`href="./start/${suffix}">${copy[lang].start}</a>`));
      assert.ok(entry.includes(`href="./support/${suffix}"`));
      assert.ok(entry.includes(`href="./privacy/${suffix}"`));
    }
    assert.doesNotMatch(html, /Like having someone beside you|isn’t available to download yet|暂时不能下载使用/);
  }
  for (const [lang, suffix] of [["en", "en/"], ["zh", ""]]) {
    const start = plain(await read(`public/start/${suffix}index.html`));
    assert.ok(start.includes(installation[lang].connection.action));
    assert.ok(start.includes(sharingInstructions[lang].steps.join("")));
  }
  assert.match(css, /\.no-script-entry:not\(:has\(#zh:target\)\) #zh,\s*\.no-script-entry:has\(#zh:target\) #en \{ display: none; \}/);
});

test("website button references use curly double quotes in both languages", async () => {
  const sources = ["src/copy.js", "src/installation.js", "src/requirements.js", "public/flash/flash-copy.js",
    "public/flash/flash-dialog.js", "public/flash/index.html", "public/flash/zh.html", "scripts/install-document.mjs"];
  for (const file of sources) assert.doesNotMatch(await read(file), /‘[^’]+’/, file);
  assert.match(installation.en.tapping.askBody, /“Allow tapping”/);
  assert.match(installation.zh.tapping.askBody, /“允许帮你点”/);
  assert.match(installation.en.controlSteps[0][2], /“All installed!”/);
  assert.match(installation.en.controlSteps[1][1], /“Start pairing”/);
});
