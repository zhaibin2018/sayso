import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names=execFileSync('git',['ls-files','--','mcp','plugins','INSTALL.md','LICENSE.md','LICENSE_DETAILS.md','TRADEMARK.md','THIRD_PARTY.md','CONTRIBUTING.md','scripts/verify-source.mjs'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
if(!names.includes('mcp/lib/bridge-engine.ts')||!names.includes('plugins/sayso/plugin.json'))throw new Error('Stage the complete reviewed source before generating the manifest');
const files=[];
for(const name of names){const bytes=await readFile(path.join(root,name));files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(path.join(root,'SOURCE_MANIFEST.json'),JSON.stringify({schema:1,snapshot:'SaySo public source 2026-11-16',license:'FSL-1.1-ALv2',licensor:'ZHAI BIN',mcpRuntime:'0.13.242',skillSourceVersion:'1.2.37',consumerEndToEndAccepted:false,files},null,2)+'\n');
console.log(`Manifest contains ${files.length} reviewed source files.`);
