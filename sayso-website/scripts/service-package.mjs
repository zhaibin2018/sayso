import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const currentServiceRelease = { version: "0.13.293", pluginVersion: "1.2.62" };
const compatiblePlugins = new Map([["0.13.292", "1.2.61"], [currentServiceRelease.version, currentServiceRelease.pluginVersion]]);

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export async function verifiedPackage(record, load = fetch) {
  if (record == null) return null;
  const { commit, label, manifestSha256, zipSha256, archivePath } = record;
  const version = /^v(\d+\.\d+\.\d+)[-.a-zA-Z0-9]+$/.exec(label)?.[1];
  const pluginVersion = compatiblePlugins.get(version);
  if (!/^[a-f0-9]{40}$/.test(commit) || !pluginVersion ||
      ![manifestSha256,zipSha256].every(v => /^[a-f0-9]{64}$/.test(v)) ||
      archivePath !== "release/service/"+label+".zip") throw Error("Invalid service package pin");
  const root = "https://raw.githubusercontent.com/zhaibin2018/sayso/"+commit+"/";
  const directory = root+"release/service/"+label+"/";
  async function bytes(url, expected) {
    const response = await load(url, {redirect:"error",signal:AbortSignal.timeout(60000)});
    if (!response.ok) throw Error("Public package file unavailable");
    const result = Buffer.from(await response.arrayBuffer());
    if (digest(result) !== expected) throw Error("Public package digest mismatch");
    return result;
  }
  const manifestURL = directory+"manifest.json", archiveURL = root+archivePath;
  const manifest = JSON.parse(await bytes(manifestURL,manifestSha256));
  if (manifest.version !== version || manifest.skill_version !== pluginVersion || manifest.release_label !== label ||
      manifest.skills?.length !== 10 || new Set(manifest.skills).size !== 10 || manifest.migrations?.length !== 39)
    throw Error("Incompatible service, plugin, skills or migrations");
  const files = new Map(manifest.files.map(f=>[f.path,f.sha256]));
  const required = ["INSTALL.md","mcp/worker/index.ts","mcp/lib/share-control.ts","mcp/contracts/current-actions.json",...manifest.skills.map(name=>{
    if (!/^sayso-[a-z0-9-]+$/.test(name)) throw Error("Invalid skill name");
    return "plugins/sayso/skills/"+name+"/SKILL.md";
  })];
  for (const [i, migration] of manifest.migrations.entries()) {
    if (!new RegExp("^mcp/drizzle/"+String(i).padStart(4,"0")+"_[a-zA-Z0-9_-]+\\.sql$").test(migration.path) ||
        files.get(migration.path) !== migration.sha256) throw Error("Incomplete ordered migrations");
    required.push(migration.path);
  }
  for (const name of required) await bytes(directory+name,files.get(name));
  const archive = await bytes(archiveURL,zipSha256);
  const result = spawnSync(process.platform === "win32" ? "python" : "python3",
    [fileURLToPath(new URL("./verify-package-archive.py",import.meta.url)),label,manifestSha256],
    {input:archive,encoding:"utf8",windowsHide:true});
  if (result.status !== 0) throw Error("Archive contents do not match the pinned manifest");

  return {...record,version,pluginVersion,manifestURL,archiveURL,guideURL:directory+"INSTALL.md"};
}
