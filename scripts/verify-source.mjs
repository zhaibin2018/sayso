import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(path.join(root,'SOURCE_MANIFEST.json'),'utf8'));
if(manifest.schema!==1||manifest.license!=='FSL-1.1-ALv2'||manifest.licensor!=='ZHAI BIN')throw new Error('Unexpected source manifest');
for(const file of manifest.files){
  if(file.path.startsWith('/')||file.path.includes('\\')||file.path.split('/').includes('..'))throw new Error('Invalid source path');
  const bytes=await readFile(path.join(root,file.path));
  if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error(`Source digest mismatch: ${file.path}`);
}
console.log(`Verified ${manifest.files.length} source files for ${manifest.snapshot}. No service or device actions performed.`);
