import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import jpeg from "jpeg-js";
import {validatedJpegDimensions} from "../lib/jpeg-validation.ts";

type Fixture={name:string;width:number;height:number;jpeg_base64:string};
const fixtures=(JSON.parse(readFileSync(new URL("./fixtures/jpeg-validation.json",import.meta.url),"utf8")) as {fixtures:Fixture[]}).fixtures;
const baseline=(bytes:Uint8Array)=>jpeg.decode(bytes,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:4.2,maxMemoryUsageInMB:48});
function check(action:()=>{width:number;height:number},w:number,h:number){try{const v=action();return {accepted:v.width===w&&v.height===h,width:v.width,height:v.height};}catch{return {accepted:false};}}

test("JPEG: strict validation matches baseline/progressive RGB, grayscale, CMYK and resource boundary admission",()=>{
  for(const f of fixtures){
    const bytes=Buffer.from(f.jpeg_base64,"base64"),original=Buffer.from(bytes);
    const a=check(()=>baseline(bytes),f.width,f.height),b=check(()=>validatedJpegDimensions(bytes,f.width,f.height),f.width,f.height);
    assert.deepEqual(b,a,f.name);assert.deepEqual(bytes,original,"Never rewrite authenticated JPEG bytes");
    if(f.name.startsWith("limits-1500")||f.name.startsWith("limits-2048"))assert.equal(b.accepted,false,f.name);
  }
});
test("JPEG: malformed/truncated entropy is not made admissible by omitting color conversion",()=>{
  let seed=0x51a750;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(const f of fixtures.filter(f=>f.width===17&&f.height===31)){
    const source=Buffer.from(f.jpeg_base64,"base64");
    for(let n=0;n<24;n++){
      let bytes=Buffer.from(source);
      if(n<8)bytes=bytes.subarray(0,random()%bytes.length);else bytes[random()%bytes.length]^=1<<(random()%8);
      assert.equal(check(()=>validatedJpegDimensions(bytes,f.width,f.height),f.width,f.height).accepted,check(()=>baseline(bytes),f.width,f.height).accepted,f.name+" mutation "+n);
    }
  }
});
test("JPEG: validation returns dimensions only and keeps the expected-dimension/pixel guards",()=>{
  const f=fixtures.find(f=>f.name==="ui-443x960")!,bytes=Buffer.from(f.jpeg_base64,"base64");
  assert.deepEqual(validatedJpegDimensions(bytes,f.width,f.height),{width:f.width,height:f.height});
  for(const [w,h] of [[0,1],[1,0],[1.5,2],[2048,2052]])assert.throws(()=>validatedJpegDimensions(bytes,w,h),/Invalid expected/);
});
