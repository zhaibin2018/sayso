import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import jpeg from 'jpeg-js';
import {validatedJpegDimensions} from '../lib/jpeg-validation.ts';

const fixtures=JSON.parse(readFileSync('tests/fixtures/jpeg-validation.json','utf8')).fixtures;
const baseline=bytes=>jpeg.decode(bytes,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:4.2,maxMemoryUsageInMB:48});
const rgb=(bytes,w,h)=>jpeg.decode(bytes,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:4.2,maxMemoryUsageInMB:48-w*h/1048576,formatAsRGBA:false});
const outcome=(fn,bytes,w,h)=>{try{const image=fn(bytes,w,h);return {accepted:image.width===w&&image.height===h,width:image.width,height:image.height};}catch{return {accepted:false};}};
const checks=[];
for(const fixture of fixtures){
  const bytes=Buffer.from(fixture.jpeg_base64,'base64'),a=outcome(baseline,bytes,fixture.width,fixture.height),b=outcome(validatedJpegDimensions,bytes,fixture.width,fixture.height);
  assert.deepEqual(b,a,fixture.name);checks.push({name:fixture.name,accepted:a.accepted,bytes:bytes.length});
}
let seed=0x51a750;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
const fuzz=[];
for(const fixture of fixtures.filter(x=>x.width===17&&x.height===31)){
  const original=Buffer.from(fixture.jpeg_base64,'base64');
  for(let i=0;i<24;i++){
    let bytes=Buffer.from(original);
    if(i<8)bytes=bytes.subarray(0,random()%bytes.length);
    else{const index=random()%bytes.length;bytes[index]^=1<<(random()%8);}
    const a=outcome(baseline,bytes,fixture.width,fixture.height),b=outcome(validatedJpegDimensions,bytes,fixture.width,fixture.height);
    assert.equal(b.accepted,a.accepted,fixture.name+' mutation '+i);
    fuzz.push({fixture:fixture.name,mutation:i,accepted_by_baseline:a.accepted,accepted_by_candidate:b.accepted});
  }
}
const samples=[];
for(const fixture of fixtures.filter(x=>x.name.startsWith('ui-'))){
  const bytes=Buffer.from(fixture.jpeg_base64,'base64'),w=fixture.width,h=fixture.height;
  const options=[['rgba',baseline],['rgb',rgb],['components',validatedJpegDimensions]],times={rgba:[],rgb:[],components:[]};
  for(let round=0;round<14;round++)for(let shift=0;shift<3;shift++){
    const [name,fn]=options[(round+shift)%3],start=performance.now();const image=fn(bytes,w,h);
    assert.equal(image.width,w);assert.equal(image.height,h);
    if(round>=2)times[name].push(performance.now()-start);
  }
  const median=v=>v.toSorted((a,b)=>a-b)[Math.floor(v.length/2)];
  samples.push({fixture:fixture.name,width:w,height:h,jpeg_bytes:bytes.length,times_ms:times,
    medians_ms:Object.fromEntries(Object.entries(times).map(([k,v])=>[k,median(v)])),rgba_output_bytes:w*h*4,component_output_bytes:w*h*3});
}
const report={schema:'sayso.jpeg_validation_candidate.v1',synthetic_fixture:true,fixtures:checks,mutation_checks:fuzz,samples,
  limits:['Local Node CPU, not production Worker CPU or an end-to-end freshness result.','Every supported component mode and progressive/baseline fixture is compared against the pinned current decoder.','Mutation equivalence is a bounded audit, not a proof for all possible JPEGs.','Original JPEG bytes remain the served/stored image.'],three_second_goal_verified:false};
writeFileSync('../../evidence/jpeg-validation-candidate-20261103.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({fixture_checks:checks.length,mutation_checks:fuzz.length,rejected_fixtures:checks.filter(x=>!x.accepted).map(x=>x.name),samples:samples.map(x=>({fixture:x.fixture,width:x.width,height:x.height,jpeg_bytes:x.jpeg_bytes,medians_ms:x.medians_ms,rgba_output_bytes:x.rgba_output_bytes,component_output_bytes:x.component_output_bytes}))}));
