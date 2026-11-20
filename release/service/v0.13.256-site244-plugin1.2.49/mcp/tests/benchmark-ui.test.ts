import {test} from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {crc32,gzipSync,inflateSync} from "node:zlib";
import jpeg from "jpeg-js";
import sharp from "sharp";
import {benchmarkFrame} from "../lib/benchmark-frame.ts";
import {BENCHMARK_UI_URI,benchmarkWidgetHtml} from "../lib/benchmark-widget.ts";
import {RENDERER_PROBE_URI,rendererProbeHtml} from "../lib/benchmark-renderer-probe.ts";
import {handleMcp} from "../lib/mcp-protocol.ts";

const caller=()=>({id:"benchmark-test-owner",label:"Software fixture owner"});
const noEngine=()=>{throw new Error("Fixture tools must not open the product/device engine");};
async function rpc(method:string,params:unknown={},authenticate=caller){
 const request=new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
 const response=await handleMcp(request,{engine:noEngine,caller:authenticate,origin:"https://test.example",toolAudience:"development"});
 return {status:response.status,body:await response.json() as any};
}

test("software: modern wire completion fields preserve images and resources; legacy stays unchanged",async()=>{
 for(const methodAndParams of [
  ["server/discover",{}],["tools/list",{}],["resources/list",{}],
  ["resources/read",{uri:BENCHMARK_UI_URI}],
  ["tools/call",{name:"read_benchmark_frame",arguments:{case_id:"c00"}}],
  ["tools/call",{name:"read_benchmark_frame",arguments:{case_id:"unknown"}}],
 ] as const){
  const [method,params]=methodAndParams;
  const request=new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params:{...params,_meta:{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}})});
  const response=await handleMcp(request,{engine:noEngine,caller,origin:"https://test.example",toolAudience:"development"});
  const result=(await response.json() as any).result;
  assert.equal(result.resultType,"complete");assert.equal(result._meta["io.modelcontextprotocol/serverInfo"].name,"sayso");
  if(method!=="tools/call"){assert.equal(result.cacheScope,"private");assert.equal(result.ttlMs,0);}
  if(method==="resources/read")assert.equal(result.contents[0].text,benchmarkWidgetHtml);
  if(method==="tools/call"&&params.arguments.case_id==="c00")assert.equal(result.content[0].data,benchmarkFrame("c00").content[0].data);
  if(method==="tools/call"&&params.arguments.case_id==="unknown")assert.equal(result.isError,true);
 }
 const legacy=(await rpc("tools/call",{name:"read_benchmark_frame",arguments:{case_id:"c00"}})).body.result;
 assert.equal(legacy.resultType,undefined);assert.equal(legacy.content[0].data,benchmarkFrame("c00").content[0].data);
});

test("software: fixture UI/resource and pixels require a caller and never use device storage",async()=>{
 const catalog=(await rpc("tools/list")).body.result.tools;
 assert.equal(catalog.find((t:any)=>t.name==="open_screen_benchmark")._meta.ui.resourceUri,BENCHMARK_UI_URI);
 assert.deepEqual(catalog.find((t:any)=>t.name==="read_benchmark_frame")._meta.ui.visibility,["model","app"]);
 assert.equal(catalog.find((t:any)=>t.name==="read_benchmark_frame")._meta.ui.resourceUri,undefined);
 const opened=(await rpc("tools/call",{name:"open_screen_benchmark",arguments:{case_id:"c00"}})).body.result;
 assert.equal(opened.structuredContent.simulated,true);assert.equal(opened.content.some((c:any)=>c.type==="image"),false);
 const frame=(await rpc("tools/call",{name:"read_benchmark_frame",arguments:{case_id:"c01"}})).body.result;
 const pixels=Buffer.from(frame.content[0].data,"base64");
 assert.deepEqual([...pixels.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(pixels.readUInt32BE(16),480);assert.equal(pixels.readUInt32BE(20),854);
 assert.equal(frame.structuredContent.source,"synthetic_fixture");assert.ok(!/expected|MapLab|ParcelDesk|TaskBoard/.test(JSON.stringify(frame.structuredContent)));
 const denied=(await rpc("tools/call",{name:"read_benchmark_frame",arguments:{case_id:"c00"}},()=>{throw new Error("No caller");})).body;
 assert.equal(denied.error.code,-32001);assert.equal(denied.result,undefined);
 const resource=(await rpc("resources/read",{uri:BENCHMARK_UI_URI})).body.result.contents[0];
 assert.equal(resource.mimeType,"text/html;profile=mcp-app");assert.ok(resource.text.includes('method:method'));
 const unauthorized=await rpc("resources/read",{uri:BENCHMARK_UI_URI},()=>{throw new Error("No caller");});
 assert.equal(unauthorized.status,401);
 const invalid=(await rpc("tools/call",{name:"read_benchmark_frame",arguments:{case_id:"../device"}})).body.result;
 assert.equal(invalid.isError,true);assert.equal(invalid.content.some((c:any)=>c.type==="image"),false);
});

test("software: renderer-only control needs authentication and cannot access devices or pixels",async()=>{
 const catalog=(await rpc("tools/list")).body.result.tools;
 const probe=catalog.find((t:any)=>t.name==="open_benchmark_renderer_probe");
 assert.equal(probe._meta.ui.resourceUri,RENDERER_PROBE_URI);
 assert.deepEqual(probe._meta["openai/ui"].entrypoints,[{type:"thread"}]);
 const opened=(await rpc("tools/call",{name:probe.name,arguments:{}})).body.result;
 assert.equal(opened.isError,false);assert.equal(opened.content.some((c:any)=>c.type==="image"),false);
 const result=(await rpc("resources/read",{uri:RENDERER_PROBE_URI})).body.result.contents[0];
 assert.ok(result.text.includes("PROBE_HTML_RENDERED"));
 assert.ok(!/fetch\(|tools\/call|sampling\/createMessage|update-model-context|data:image/.test(result.text));
 const denied=await rpc("resources/read",{uri:RENDERER_PROBE_URI},()=>{throw new Error("No caller");});
 assert.equal(denied.status,401);
 assert.equal((await rpc("resources/read",{uri:"ui://unknown/private"})).body.error.code,-32602);
});

test("software: content-only fixture preserves identical pixels and provenance without changing the widget contract",async()=>{
 const mixed=(await rpc("tools/call",{name:"read_benchmark_frame",arguments:{case_id:"c02"}})).body.result;
 const plain=(await rpc("tools/call",{name:"read_benchmark_pixels",arguments:{case_id:"c02"}})).body.result;
 assert.equal(plain.isError,false);assert.equal(plain.structuredContent,undefined);
 assert.equal(plain.content[0].data,mixed.content[0].data);assert.equal(plain.content[0].mimeType,"image/png");
 const metadata=JSON.parse(plain.content[1].text);
 assert.equal(metadata.source,"synthetic_fixture");assert.equal(metadata.case_id,"c02");assert.equal(metadata.simulated,true);
 assert.equal(mixed.structuredContent.source,"synthetic_fixture");
 const denied=(await rpc("tools/call",{name:"read_benchmark_pixels",arguments:{case_id:"c00"}},()=>{throw new Error("No caller");})).body;
 assert.equal(denied.error.code,-32001);assert.equal(denied.result,undefined);
 const invalid=(await rpc("tools/call",{name:"read_benchmark_pixels",arguments:{case_id:"../device"}})).body.result;
 assert.equal(invalid.isError,true);assert.equal(invalid.content.some((c:any)=>c.type==="image"),false);
});

test("software: JPEG fixture contains decodable JPEG bytes, authenticates, and never enters device storage",async()=>{
 for(const case_id of ["c00","c01","c02"]){
  const result=(await rpc("tools/call",{name:"read_benchmark_jpeg",arguments:{case_id}})).body.result;
  assert.equal(result.isError,false);assert.equal(result.structuredContent,undefined);
  assert.equal(result.content[0].mimeType,"image/jpeg");
  const bytes=Buffer.from(result.content[0].data,"base64");assert.equal(bytes.readUInt16BE(0),0xffd8);
  const image=jpeg.decode(bytes,{useTArray:true});assert.equal(image.width,480);assert.equal(image.height,854);
  const meta=JSON.parse(result.content[1].text);assert.equal(meta.simulated,true);assert.equal(meta.case_id,case_id);
  assert.ok(!/expected|MapLab|TaskBoard|ParcelDesk/.test(result.content[1].text));
 }
 const denied=(await rpc("tools/call",{name:"read_benchmark_jpeg",arguments:{case_id:"c00"}},()=>{throw new Error("No caller");})).body;
 assert.equal(denied.error.code,-32001);assert.equal(denied.result,undefined);
});

test("software: one synthetic tool controls image format, layout and equal image byte counts",async()=>{
 const invoke=async(args:Record<string,unknown>)=>(await rpc("tools/call",{name:"read_benchmark_frame",arguments:{case_id:"c09",...args}})).body.result;
 const png=await invoke({}),pngMatched=await invoke({image_format:"png",match_payload_size:true});
 const jpg=await invoke({image_format:"jpeg",match_payload_size:true});
 const pngOnly=await invoke({image_format:"png",response_layout:"content_only",match_payload_size:true});
 const jpgOnly=await invoke({image_format:"jpeg",response_layout:"content_only",match_payload_size:true});
 const first=(result:any)=>result.content[0];
 for(const value of [png,pngMatched,jpg,pngOnly,jpgOnly]){
  assert.equal(value.isError,false);
  assert.equal(value.content.length,2);
  assert.equal(first(value).type,"image");
  const metadata=JSON.parse(value.content[1].text);
  assert.deepEqual(Object.keys(metadata),Object.keys(png.structuredContent));
  assert.equal(metadata.case_id,"c09");
  assert.equal(metadata.simulated,true);
  assert.ok(!/expected|MapLab|TaskBoard|ParcelDesk/.test(value.content[1].text));
 }
 assert.equal(pngOnly.structuredContent,undefined);
 assert.equal(jpgOnly.structuredContent,undefined);
 assert.equal(first(pngMatched).data,first(pngOnly).data);
 assert.equal(first(jpg).data,first(jpgOnly).data);
 assert.equal(first(png).data,benchmarkFrame("c09").content[0].data);
 assert.equal(first(png).mimeType,"image/png");
 assert.equal(first(jpg).mimeType,"image/jpeg");
 const base=Buffer.from(first(png).data,"base64"),matched=Buffer.from(first(pngMatched).data,"base64");
 const jpegBytes=Buffer.from(first(jpg).data,"base64");
 assert.equal(matched.length,jpegBytes.length);
 assert.equal(first(pngMatched).data.length,first(jpg).data.length);
 const zippedLengths=[first(pngMatched).data,first(jpg).data].map(data=>gzipSync(data).length);
 assert.ok(Math.abs(zippedLengths[0]-zippedLengths[1])<2048);
 const image=jpeg.decode(jpegBytes,{useTArray:true});
 assert.deepEqual([image.width,image.height],[480,854]);
 const pngChunks=(bytes:Buffer)=>{
  assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  const idat:Buffer[]=[];
  for(let offset=8;offset<bytes.length;){
   const size=bytes.readUInt32BE(offset),end=offset+8+size,name=bytes.subarray(offset+4,offset+8).toString("ascii");
   assert.equal(crc32(bytes.subarray(offset+4,end)),bytes.readUInt32BE(end));
   if(name==="IDAT")idat.push(bytes.subarray(offset+8,end));
   if(name==="IEND")assert.equal(end+4,bytes.length);
   offset=end+4;
  }
  return inflateSync(Buffer.concat(idat));
 };
 assert.deepEqual(pngChunks(matched),pngChunks(base));
 assert.equal(matched.subarray(base.length-8,base.length-4).toString("ascii"),"npAd");
 const decodedPng=await sharp(base).raw().toBuffer({resolveWithObject:true});
 const decodedMatched=await sharp(matched).raw().toBuffer({resolveWithObject:true});
 assert.deepEqual(decodedMatched,decodedPng);
 assert.deepEqual([decodedMatched.info.width,decodedMatched.info.height],[480,854]);
 const preview=await invoke({preview:true,response_layout:"content_only"});
 const previewBytes=Buffer.from(first(preview).data,"base64");
 const decodedPreview=await sharp(previewBytes).raw().toBuffer({resolveWithObject:true});
 assert.deepEqual([decodedPreview.info.width,decodedPreview.info.height],[240,427]);
 assert.deepEqual([JSON.parse(preview.content[1].text).native_width_px,JSON.parse(preview.content[1].text).native_height_px],[480,854]);
 assert.ok(previewBytes.length<base.length);
});

test("software: synthetic carrier options reject unsupported formats, layouts and preview combinations",async()=>{
 for(const fields of [{image_format:"gif"},{response_layout:"resource"},{match_payload_size:39501},
  {preview:true,image_format:"jpeg"},{preview:true,match_payload_size:true},{pad_to:39501}]){
  const payload=(await rpc("tools/call",{name:"read_benchmark_frame",arguments:{case_id:"c09",...fields}})).body.result;
  assert.equal(payload.isError,true);
  assert.equal(payload.content.some((item:any)=>item.type==="image"),false);
 }
});

test("software mock only: minimal renderer waits for its actual parent initialization reply",()=>{
 const elements:any={stage:{textContent:"PROBE_HTML_RENDERED"},details:{textContent:""}};
 let listener:(event:any)=>void=()=>{},timeout:()=>void=()=>{};const sent:any[]=[];
 const parent={postMessage:(message:any)=>sent.push(message)};
 const window={parent,addEventListener:(_kind:string,callback:any)=>{listener=callback;}};
 const script=rendererProbeHtml.match(/<script>([\s\S]*?)<\/script>/)![1];
 vm.runInNewContext(script,{window,document:{getElementById:(id:string)=>elements[id]},setTimeout:(cb:any)=>{timeout=cb;return 1;},clearTimeout:()=>{}});
 assert.equal(elements.stage.textContent,"PROBE_SCRIPT_EXECUTED");assert.equal(sent.length,1);
 const reply={jsonrpc:"2.0",id:"sb-renderer-probe-init",result:{protocolVersion:"2026-01-26",hostInfo:{name:"SOFTWARE MOCK"},hostCapabilities:{}}};
 listener({source:{},data:reply});assert.equal(elements.stage.textContent,"PROBE_SCRIPT_EXECUTED");
 timeout();assert.equal(elements.stage.textContent,"PROBE_INITIALIZE_TIMEOUT");
 listener({source:parent,data:reply});assert.equal(elements.stage.textContent,"PROBE_INITIALIZED");
 assert.equal(sent.at(-1).method,"ui/notifications/initialized");
});

type HostOptions={rejectImage?:boolean;sampling?:boolean;holdFrame?:boolean;inline?:boolean;draft?:boolean;preview?:boolean;denyInline?:boolean};
function mockHost(options:HostOptions={}){
 const ids=["sample","question","delivery","screen","prefetch","ask","clear","status","error","reply","debug"];
 const elements:any=Object.fromEntries(ids.map(id=>[id,{value:id==="sample"?"c00":id==="question"?"describe":id==="delivery"?(options.draft?"draft":options.inline?"inline":"context"):"",disabled:false,hidden:true,textContent:""}]));
 let listener:(event:any)=>void;
 const requests:any[]=[];const contexts:any[]=[];let held:any;
 const parent={postMessage(message:any){
  requests.push(message);
  if(message.method==="ui/notifications/initialized")deliver({jsonrpc:"2.0",method:"ui/notifications/tool-input",params:{arguments:{case_id:"c00",preview:!!options.preview}}});
  if(!Object.hasOwn(message,"id")||!message.method)return;
  const result:any=message.method==="ui/initialize"?{protocolVersion:"2026-01-26",hostInfo:{name:"SOFTWARE MOCK",version:"1"},hostCapabilities:{...((options.inline||options.draft)&&!options.denyInline?{experimental:{"openai/message":{}}}:{}),serverTools:{},updateModelContext:{image:{},text:{}},message:{text:{}},...(options.sampling?{sampling:{}}:{})}}:
   message.method==="tools/call"?benchmarkFrame(message.params.arguments.case_id,message.params.arguments.preview===true):
   message.method==="sampling/createMessage"?{role:"assistant",model:"mock-only",content:{type:"text",text:"MOCK RESPONSE; NOT REAL INFERENCE"}}:{};
  if(message.method==="ui/initialize")assert.ok(message.params.appInfo&&message.params.appCapabilities);
  if(message.method==="ui/update-model-context"){
   contexts.push(message.params);
   if(options.rejectImage&&message.params.content?.some((c:any)=>c.type==="image")){deliver({jsonrpc:"2.0",id:message.id,error:{code:-32602,message:"image not accepted"}});return;}
  }
  const response={jsonrpc:"2.0",id:message.id,result};
  if(options.holdFrame&&message.method==="tools/call"){held=response;return;}
  deliver(response);
 }};
 function deliver(message:any,source=parent){queueMicrotask(()=>listener({source,data:message}));}
 const window:any={parent,addEventListener:(kind:string,handler:any)=>{if(kind==="message")listener=handler;}};
 const document:any={body:{dataset:{}},getElementById:(id:string)=>elements[id]};
 const script=benchmarkWidgetHtml.match(/<script>([\s\S]*?)<\/script>/)![1];
 vm.runInNewContext(script,{window,document,setTimeout,clearTimeout,performance,Map,Promise,console});
 return {elements,document,requests,contexts,deliver,release:()=>{if(held)deliver(held);},teardown:()=>deliver({jsonrpc:"2.0",id:"mock-host-close",method:"ui/resource-teardown",params:{}})};
}
async function settle(){for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));}

test("software mock only: widget passes actual pixels to model-context and overwrites the chosen frame",async()=>{
 const h=mockHost();await settle();
 assert.equal(h.document.body.dataset.contextReady,"true");assert.equal(h.document.body.dataset.case,"c00");
 assert.equal(h.contexts.at(-1).content[0].data,benchmarkFrame("c00").content[0].data);
 h.elements.sample.value="c02";await h.elements.sample.onchange();await settle();
 assert.equal(h.contexts.at(-1).structuredContent.case_id,"c02");assert.equal(h.contexts.at(-1).content[0].data,benchmarkFrame("c02").content[0].data);
 assert.ok(!JSON.stringify(h.contexts.at(-1).structuredContent).includes("expected"));h.teardown();await settle();
 assert.equal(h.contexts.at(-1).content.length,0);
});

test("software mock only: a refused context is not treated as image delivery",async()=>{
 const h=mockHost({rejectImage:true});await settle();
 assert.equal(h.document.body.dataset.contextReady,"false");assert.equal(h.elements.ask.disabled,true);
 assert.ok(h.elements.error.textContent.includes("image not accepted"));
 assert.equal(h.requests.some(x=>x.method==="ui/message"||x.method==="sampling/createMessage"),false);h.teardown();await settle();
});

test("software mock only: submitting a question is not falsely timed as a model answer",async()=>{
 const h=mockHost();await settle();await h.elements.ask.onclick();await settle();
 const message=h.requests.find(x=>x.method==="ui/message");assert.equal(message.params.role,"user");assert.ok(Array.isArray(message.params.content));
 assert.equal(h.elements.reply.textContent,"");assert.ok(h.elements.status.textContent.includes("不代表模型回答耗时"));
 const diagnostic=JSON.parse(h.elements.debug.textContent);assert.equal(diagnostic.timings.round_feedback_ms,undefined);h.teardown();await settle();
});

test("software mock only: host sampling is capability-gated and contains image pixels",async()=>{
 const h=mockHost({sampling:true});await settle();await h.elements.ask.onclick();await settle();
 const sample=h.requests.find(x=>x.method==="sampling/createMessage");assert.equal(sample.params.messages[0].content.type,"image");
 assert.equal(sample.params.messages[0].content.data,benchmarkFrame("c00").content[0].data);
 assert.equal(sample.params.includeContext,"none");assert.ok(h.elements.reply.textContent.includes("MOCK RESPONSE"));h.teardown();await settle();
});

test("software mock only: cancellation prevents a delayed frame from re-entering context",async()=>{
 const h=mockHost({holdFrame:true});await settle();
 h.deliver({jsonrpc:"2.0",method:"ui/notifications/tool-cancelled",params:{}});await settle();h.release();await settle();
 assert.equal(h.document.body.dataset.contextReady,"false");assert.equal(h.elements.ask.disabled,true);
 assert.equal(h.contexts.filter(x=>x.content?.some((c:any)=>c.type==="image")).length,0);h.teardown();await settle();
});

test("software: unseen benchmark fixtures keep both encodings decodable and provenance answer-free",async()=>{
 const catalogue=(await rpc("tools/list",{})).body.result.tools;
 for(const name of ["read_benchmark_pixels","read_benchmark_jpeg"]){
  const tool=catalogue.find((t:any)=>t.name===name);
  assert.ok(tool.inputSchema.properties.case_id.enum.includes("c11"));
  for(let n=3;n<=11;n++){
   const case_id=`c${String(n).padStart(2,"0")}`;
   const value=(await rpc("tools/call",{name,arguments:{case_id}})).body.result;
   assert.equal(value.isError,false);assert.equal(value.structuredContent,undefined);
   const meta=JSON.parse(value.content[1].text);
   assert.equal(meta.case_id,case_id);assert.equal(meta.simulated,true);
   assert.ok(!/expected|NEXT|MapLab|TaskBoard|ParcelDesk/.test(value.content[1].text));
   const bytes=Buffer.from(value.content[0].data,"base64");
   if(name==="read_benchmark_jpeg"){
    const decoded=jpeg.decode(bytes,{useTArray:true});assert.equal(decoded.width,480);assert.equal(decoded.height,854);
   }else{
    assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16),480);assert.equal(bytes.readUInt32BE(20),854);
   }
  }
 }
});

test("software mock only: inline image-message carries actual pixels after a fresh MCP read without a context round trip",async()=>{
 const h=mockHost({inline:true});await settle();
 assert.equal(h.contexts.length,0);assert.equal(h.elements.ask.disabled,false);
 const before=h.requests.filter(x=>x.method==="tools/call").length;
 await h.elements.ask.onclick();await settle();
 assert.equal(h.requests.filter(x=>x.method==="tools/call").length,before+1);
 const message=h.requests.find(x=>x.method==="ui/message");
 assert.equal(message.params.content[0].type,"image");
 assert.equal(message.params.content[0].data,benchmarkFrame("c00").content[0].data);
 assert.equal(message.params.content[1].type,"text");
 assert.equal(h.contexts.length,0);assert.equal(h.elements.reply.textContent,"");
 const diagnostic=JSON.parse(h.elements.debug.textContent);
 assert.equal(diagnostic.timings.context_update_ms,0);assert.equal(diagnostic.timings.round_feedback_ms,undefined);
 h.teardown();await settle();
});

test("software mock only: image-message support is checked before submitting pixels",async()=>{
 const h=mockHost({inline:true,denyInline:true});await settle();assert.equal(h.elements.ask.disabled,true);
 await h.elements.ask.onclick();await settle();
 assert.equal(h.requests.some(x=>x.method==="ui/message"),false);assert.equal(h.contexts.length,0);
 h.teardown();await settle();
});

test("software: old UI resources remain authenticated while new tools advertise the new URI",async()=>{
 assert.equal(BENCHMARK_UI_URI,"ui://sayso/benchmark/v4.html");
 const old=(await rpc("resources/read",{uri:"ui://sayso/benchmark/v1.html"})).body.result;
 assert.ok(old.contents[0].text.includes("round_submission_ack_ms"));
 const denied=await rpc("resources/read",{uri:"ui://sayso/benchmark/v1.html"},()=>{throw Error("No caller");});
 assert.equal(denied.status,401);
});

test("software mock only: draft-image mode stages actual pixels without sending a model request or changing chats",async()=>{
 const h=mockHost({draft:true});await settle();
 assert.equal(h.elements.ask.disabled,false);assert.equal(h.contexts.length,0);
 await h.elements.ask.onclick();await settle();
 const message=h.requests.find(x=>x.method==="ui/message");
 assert.equal(message.params._meta["openai/message"].target,"active");
 assert.equal(message.params._meta["openai/message"].send,false);
 assert.equal(message.params.content.length,1);assert.equal(message.params.content[0].type,"image");
 assert.equal(message.params.content[0].data,benchmarkFrame("c00").content[0].data);
 assert.equal(JSON.parse(h.elements.debug.textContent).draft_ready,true);
 assert.equal(h.elements.reply.textContent,"");h.teardown();await settle();
});

test("software mock only: draft placement requires the specific host extension",async()=>{
 const h=mockHost({draft:true,denyInline:true});await settle();assert.equal(h.elements.ask.disabled,true);
 await h.elements.ask.onclick();await settle();assert.equal(h.requests.some(x=>x.method==="ui/message"),false);
 h.teardown();await settle();
});

test("software: lightweight preview uses actual smaller pixels and truthful native dimensions",async()=>{
 const value=(await rpc("tools/call",{name:"read_benchmark_frame",arguments:{case_id:"c06",preview:true}})).body.result;
 assert.equal(value.isError,false);const bytes=Buffer.from(value.content[0].data,"base64");
 assert.equal(bytes.readUInt32BE(16),240);assert.equal(bytes.readUInt32BE(20),427);
 assert.equal(value.structuredContent.width,240);assert.equal(value.structuredContent.height,427);
 assert.equal(value.structuredContent.native_width_px,480);assert.equal(value.structuredContent.native_height_px,854);
 assert.equal(value.structuredContent.preview,true);
 const invalid=(await rpc("tools/call",{name:"read_benchmark_frame",arguments:{case_id:"c06",preview:"yes"}})).body.result;
 assert.equal(invalid.isError,true);assert.ok(!invalid.content.some((x:any)=>x.type==="image"));
});

test("software mock only: preview input reaches the actual image draft without model feedback claims",async()=>{
 const h=mockHost({draft:true,preview:true});await settle();
 const diagnostic=JSON.parse(h.elements.debug.textContent);
 assert.equal(diagnostic.image_width,240);assert.equal(diagnostic.image_height,427);
 await h.elements.ask.onclick();await settle();
 const sent=h.requests.find(x=>x.method==="ui/message");
 assert.equal(sent.params.content[0].data,benchmarkFrame("c00",true).content[0].data);
 assert.equal(h.elements.reply.textContent,"");h.teardown();await settle();
});
