import { spawn, execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { siteBase } from "./assemble-pages.mjs";
import { normalizeConfig } from "../src/config.mjs";
const run = promisify(execFile);

export function assertBetaAnchors(route, html, candidate) {
  const invite = normalizeConfig({ testFlightUrl: candidate }).testFlightUrl;
  const noScript = /<noscript>([\s\S]*?)<\/noscript>/g;
  const content = route === "entry"
    ? [...html.matchAll(noScript)].map(([, body]) => body).join("")
    : html.replace(noScript, "");
  const slots = route === "entry" ? ["entry", "entry"]
    : route === "support-static" ? ["support"]
    : ["banner", route === "home" ? "hero" : route];
  const expected = invite ? slots.map(slot => [slot, invite]) : [];
  const anchors = [...content.matchAll(/<a\b[^>]*>/g)].flatMap(([tag]) => {
    const href = tag.match(/\bhref="([^"]+)"/)?.[1];
    const slot = tag.match(/\bdata-beta-link="([^"]+)"/)?.[1];
    return slot || href?.startsWith("https://testflight.apple.com/") ? [[slot, href]] : [];
  });
  if (JSON.stringify(anchors) !== JSON.stringify(expected))
    throw Error("Missing or inconsistent beta anchors on " + route);
}

export async function checkBetaAnchors(invite) {
  const probe = createServer();
  await new Promise((resolve,reject)=>probe.once("error",reject).listen(0,"127.0.0.1",resolve));
  const port = probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  const server = spawn(process.execPath,[fileURLToPath(new URL("preview-integrated.mjs",import.meta.url))], {
    env:{...process.env, PORT:String(port)},stdio:"pipe",windowsHide:true
  });
  const profile=await mkdtemp(join(tmpdir(),"sayso-beta-check-"));
  try {
    await new Promise((resolve,reject)=>{
      server.stdout.once("data",resolve);
      server.once("error",reject);
      server.once("exit",code=>reject(Error("Preview exited: "+code)));
    });
    const chrome = process.env.CHROME_PATH || (process.platform==="win32" ? join(process.env.ProgramFiles,"Google/Chrome/Application/chrome.exe") : "google-chrome");
    const base = "http://127.0.0.1:" + port + siteBase();
    const entry = await fetch(base);
    if (!entry.ok) throw Error("No-script entry unavailable");
    assertBetaAnchors("entry", await entry.text(), invite);
    for (const route of ["home", "start", "support"]) {
      const {stdout}=await run(chrome,["--headless","--disable-gpu","--disable-background-networking","--no-first-run","--user-data-dir="+profile,
        "--virtual-time-budget=7000","--dump-dom",base+"#/"+route],{timeout:30000,maxBuffer:4000000,windowsHide:true});
      assertBetaAnchors(route, stdout, invite);
    }
    for (const route of ["support/", "support/en/"]) {
      const response = await fetch(base + route);
      if (!response.ok) throw Error("Static support unavailable at " + route);
      assertBetaAnchors("support-static", await response.text(), invite);
    }
  } finally {
    server.kill();
    await rm(profile,{recursive:true,force:true,maxRetries:3});
  }
}
