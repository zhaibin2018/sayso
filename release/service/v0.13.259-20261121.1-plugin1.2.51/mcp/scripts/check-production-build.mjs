import {readdirSync,readFileSync} from "node:fs";
import {join,basename} from "node:path";
const files=(dir)=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):e.name.endsWith(".js")?[join(dir,e.name)]:[]);
const output=files("dist");
if(process.env.SAYSO_BUILD_DIAGNOSTICS==="1") {console.log("Explicit diagnostic build; never treat it as the production profile.");}
else {
 const fixture=readFileSync("lib/benchmark-images.ts","utf8").match(/c00["']?\s*:\s*["']([^"']{128})/);
 if(!fixture)throw Error("Diagnostic fixture signature unavailable");
 for(const file of output){if(/^(benchmark-frame|benchmark-resources|VoiceBenchmark)-/.test(basename(file)))throw Error("Diagnostic module in production build: "+file);const source=readFileSync(file,"utf8");if(source.includes(fixture[1]))throw Error("Diagnostic pixels in production build: "+file);if(source.includes("SAYSO_DIAGNOSTIC_PARALLEL_SHARING"))throw Error("Parallel sharing configuration in production build: "+file);}
 console.log(`Production diagnostic boundary passed for ${output.length} JS artifacts.`);
}
