import {validSigningSecret} from "../lib/signing-configuration.ts";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
const args=process.argv.slice(2),get=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
if(args.includes("--check-signing-key")){
  if(!validSigningSecret(process.env.SAYSO_FRAME_PERMIT_HMAC_KEY_HEX))throw Error("SIGNING_CONFIGURATION_INVALID: expected exactly 64 hex characters in the environment; the value is never printed.");
  console.log("Signing configuration format valid; no credentials written.");process.exit(0);
}
if(process.env.SAYSO_FRAME_PERMIT_HMAC_KEY_HEX!==undefined&&!validSigningSecret(process.env.SAYSO_FRAME_PERMIT_HMAC_KEY_HEX))throw Error("SIGNING_CONFIGURATION_INVALID");
const project=get("--project-id"),origin=get("--origin");
if(!project||!/^appgprj_[a-zA-Z0-9]+$/.test(project)||!origin)throw Error("Use the project ID and HTTPS origin returned by your own newly created Site.");
const url=new URL(origin);
if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw Error("Expected a bare HTTPS Site origin.");
const root=resolve(import.meta.dirname,".."),manifest=resolve(root,".openai/hosting.json"),runtime=resolve(root,"lib/bridge-runtime.ts");
const hosting=JSON.parse(readFileSync(manifest,"utf8"));
if(hosting.project_id&&hosting.project_id!==project)throw Error("This source is already bound to another Site; use a fresh exported template.");
const code=readFileSync(runtime,"utf8");
if(!code.includes('"https://YOUR-SITE.chatgpt.site"'))throw Error("Use this configuration helper only in an exported source template.");
hosting.project_id=project;writeFileSync(manifest,JSON.stringify(hosting,null,2)+"\n");
writeFileSync(runtime,code.replaceAll('"https://YOUR-SITE.chatgpt.site"',JSON.stringify(url.origin)));
console.log("Configured the new Site identity. No deployment, account change or device action was performed.");
