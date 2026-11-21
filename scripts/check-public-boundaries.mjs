import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const firmwareRoot="sayso-website/public/flash/firmware/";
const firmwareFiles=new Set([firmwareRoot+"manifest.json",firmwareRoot+"release.json",firmwareRoot+"sayso-c124-0.6.0.bin"]);
const bytes=readFileSync(firmwareRoot+"sayso-c124-0.6.0.bin");
const release=JSON.parse(readFileSync(firmwareRoot+"release.json","utf8"));
const manifest=JSON.parse(readFileSync(firmwareRoot+"manifest.json","utf8"));
if(createHash("sha256").update(bytes).digest("hex")!=="32d29251e181b4ae1b951618bc8d172d5aab3acd0a78c0b570a97f53382432b6"||release.sha256!=="32d29251e181b4ae1b951618bc8d172d5aab3acd0a78c0b570a97f53382432b6"||release.version!=="0.6.0"||release.profile!=="c124-production"||release.identityIncluded!==false||!bytes.subarray(0x9000,0x10000).equals(Buffer.alloc(0x7000,255))||JSON.stringify(manifest.builds)!==JSON.stringify([{chipFamily:"ESP32-S3",parts:[{path:"sayso-c124-0.6.0.bin",offset:0}]}]))throw Error("Pinned virgin USB firmware mismatch");
const files=execFileSync("git",["ls-files"],{encoding:"utf8"}).trim().split("\n");
const denied=[/https:\/\/sayso\.[a-z0-9]+\.chatgpt\.site/i,/plugin_asdk_app_sites_[0-9a-f]{20,}/,/appgprj_[0-9a-f]{20,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{36,}/,/\bsk-proj-[A-Za-z0-9_-]{25,}/];
const findings=[];
for(const name of files){if(!firmwareFiles.has(name)&&/(^|\/)(ios|firmware|node_modules|\.wrangler|\.env)(\/|$)|\.(swift|cpp|ino|bin|pem|p12|pfx)$/.test(name))findings.push(name+": forbidden source path");const bytes=readFileSync(name);if(!bytes.includes(0)&&denied.some(re=>re.test(bytes.toString("utf8"))))findings.push(name+": private binding or credential pattern");}
if(findings.length)throw Error(findings.join("\n"));
execFileSync(process.platform==="win32"?"python":"python3",["scripts/verify-release-candidate.py"],{stdio:"inherit"});
console.log(`Public boundary check passed for ${files.length} tracked files; only pinned virgin USB firmware is allowed.`);
