import {readFileSync,readdirSync} from "node:fs";
import {join,relative} from "node:path";
const root=join(import.meta.dirname,".."),limits=JSON.parse(readFileSync(join(root,"source-budgets.json"),"utf8"));
const files=folder=>readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(folder,entry.name)):/\.tsx?$/.test(entry.name)?[join(folder,entry.name)]:[]);
const failures=[];
for(const file of [...files(join(root,"lib")),...files(join(root,"app"))]){
  const path=relative(root,file).replaceAll("\\","/"),lines=readFileSync(file,"utf8").trimEnd().split(/\r?\n/).length;
  const limit=limits.existing_file_limits[path]??limits.default_lines;
  const bytes=Buffer.byteLength(readFileSync(file,"utf8").replaceAll("\r\n","\n"));
  if(limits.existing_file_bytes?.[path]!==undefined&&bytes>limits.existing_file_bytes[path])failures.push(`${path}: ${bytes} bytes > ${limits.existing_file_bytes[path]}`);
  if(lines>limit)failures.push(`${path}: ${lines} > ${limit}`);
}
if(failures.length){console.error(failures.join("\n"));process.exitCode=1;}else console.log("Source file budgets passed.");
