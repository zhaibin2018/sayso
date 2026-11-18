import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
const files=execFileSync("git",["ls-files"],{encoding:"utf8"}).trim().split("\n");
const denied=[/https:\/\/sayso\.[a-z0-9]+\.chatgpt\.site/i,/plugin_asdk_app_sites_[0-9a-f]{20,}/,/appgprj_[0-9a-f]{20,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{36,}/,/\bsk-proj-[A-Za-z0-9_-]{25,}/];
const findings=[];
for(const name of files){if(/(^|\/)(ios|firmware|node_modules|\.wrangler|\.env)(\/|$)|\.(swift|cpp|ino|bin|pem|p12|pfx)$/.test(name))findings.push(name+": forbidden source path");const bytes=readFileSync(name);if(!bytes.includes(0)&&denied.some(re=>re.test(bytes.toString("utf8"))))findings.push(name+": private binding or credential pattern");}
if(findings.length)throw Error(findings.join("\n"));
console.log(`Public boundary check passed for ${files.length} tracked files.`);
