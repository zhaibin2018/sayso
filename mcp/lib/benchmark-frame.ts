import {Buffer} from "node:buffer";
import {gzipSync} from "node:zlib";
import { benchmarkImages } from "./benchmark-images.ts";
import { benchmarkPreviews } from "./benchmark-previews.ts";
import { benchmarkJpegs } from "./benchmark-jpegs.ts";
import { BridgeError } from "./bridge-engine.ts";

export const benchmarkCaseIDs = Object.keys(benchmarkImages);

export function benchmarkCase(value: unknown): string {
  const id = value == null ? "c00" : value;
  if (typeof id !== "string" || !Object.hasOwn(benchmarkImages,id)) throw new BridgeError("UNKNOWN_BENCHMARK_CASE",422);
  return id;
}

export function benchmarkFrame(value: unknown, preview = false) {
  if(typeof preview!=="boolean")throw new BridgeError("INVALID_ARGUMENTS",422);
  const id=benchmarkCase(value);
  const metadata={source:"synthetic_fixture",simulated:true,case_id:id,frame_id:crypto.randomUUID(),width:preview?240:480,height:preview?427:854,native_width_px:480,native_height_px:854,preview,assumed_ready_age_ms:0};
  return {content:[{type:"image",mimeType:"image/png",data:preview?benchmarkPreviews[id]:benchmarkImages[id]},{type:"text",text:JSON.stringify(metadata)}],structuredContent:metadata,isError:false};
}

export function benchmarkJpegFrame(value: unknown) {
  const original=benchmarkFrame(value), id=original.structuredContent.case_id;
  const data=benchmarkJpegs[id];
  if(typeof data!=="string")throw new BridgeError("UNKNOWN_BENCHMARK_CASE",422);
  return {...original,content:[{type:"image",mimeType:"image/jpeg",data},{type:"text",text:JSON.stringify(original.structuredContent)}]};
}

function pngMatchingJpegSize(png:string,jpeg:string) {
  const byteLength=Buffer.byteLength(jpeg,"base64");
  const source=Buffer.from(png,"base64"),payloadLength=byteLength-source.length-12;
  if(payloadLength<0||byteLength>64*1024||source.subarray(-8,-4).toString()!=="IEND")
    throw new BridgeError("BENCHMARK_SIZE_MATCH_UNAVAILABLE",422);
  // A private, ancillary, safe-to-copy PNG chunk before IEND. An image
  // decoder ignores it, so neither the stored fixture nor its pixels change.
  const chunk=Buffer.alloc(payloadLength+12);
  chunk.writeUInt32BE(payloadLength,0);
  chunk.write("npAd",4,"ascii");
  // Match image bytes exactly and approximate the JPEG's compressed size.
  // The remainder of this ignored chunk is zero-filled.
  const entropyLength=Math.min(payloadLength, Math.max(0,gzipSync(jpeg).length-gzipSync(png).length));
  let seed=0x1cae0000^source.length;
  for(let index=0;index<entropyLength;index++){
    seed^=seed<<13; seed^=seed>>>17; seed^=seed<<5;
    chunk[index+8]=seed&0xff;
  }
  let crc=0xffffffff;
  for(const byte of chunk.subarray(4,-4)){
    crc^=byte;
    for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(crc&1?0xedb88320:0);
  }
  chunk.writeUInt32BE((crc^0xffffffff)>>>0,chunk.length-4);
  return Buffer.concat([source.subarray(0,-12),chunk,source.subarray(-12)]).toString("base64");
}

export function benchmarkCarrier(args:Record<string,unknown>) {
  const format=args.image_format===undefined?"png":args.image_format;
  const layout=args.response_layout===undefined?"mixed":args.response_layout;
  const match=args.match_payload_size===undefined?false:args.match_payload_size;
  const preview=args.preview??false;
  if((format!=="png"&&format!=="jpeg")||(layout!=="mixed"&&layout!=="content_only")||
     typeof match!=="boolean"||typeof preview!=="boolean"||preview&&(format==="jpeg"||match))
    throw new BridgeError("INVALID_BENCHMARK_CARRIER",422);
  const frame=format==="jpeg"?benchmarkJpegFrame(args.case_id):benchmarkFrame(args.case_id,preview);
  if(match&&format==="png"){
    const {case_id}=frame.structuredContent;
    frame.content[0].data=pngMatchingJpegSize(frame.content[0].data!,benchmarkJpegs[case_id]);
  }
  return {frame,layout,match};
}
