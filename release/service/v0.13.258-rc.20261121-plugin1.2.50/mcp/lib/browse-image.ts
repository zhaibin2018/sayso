import { Buffer } from "node:buffer";
import jpeg from "jpeg-js";
import { finite, hash, integer, need, record, text } from "./bridge-engine.ts";
import { canonical, exact } from "./browse-contract.ts";
import { LiveFrameCache } from "./live-frame-cache.ts";

// Separate namespace/cache: never replaces the legacy view-only frame slot.
export const browseImageCache = new LiveFrameCache(4*1024*1024);
export type BrowseImageRow = {run_id:string;owner_id:string;device_id:string;session_id:string;step_id:string;frame_id:string;checkpoint_seq:number;image_key:string;sha256:string;image_digest:string;metadata:string;capture_lower:number;expires_at:number};

export async function decodeBrowseImage(raw:unknown, encoded:unknown, expected:Record<string,unknown>) {
  const m=record(raw);
  exact(m,["schema","source","test_fixture","frame_metadata","source_pixel_sha256","source_width","source_height","image_width","image_height","transform","jpeg_sha256","jpeg_bytes","encoded_mono_ms","encode_ms"]);
  need(m.schema==="browse_frame_image.v1" && m.source==="verified_replaykit_source_frame" && m.test_fixture===false,"ACTUAL_BROWSE_IMAGE_REQUIRED",422);
  need(canonical(m.frame_metadata)===canonical(expected),"BROWSE_IMAGE_FRAME_MISMATCH",422);
  const width=integer(m.image_width,2,1280),height=integer(m.image_height,2,1280),sw=integer(m.source_width,2,8192),sh=integer(m.source_height,2,8192);
  need(m.transform==="full_frame_upright_resize.v1" && sw===expected.width && sh===expected.height && width<=sw && height<=sh && Math.abs(width/sw-height/sh)<=1/Math.min(sw,sh),"BROWSE_IMAGE_GEOMETRY_MISMATCH",422);
  const pixels=text(m.source_pixel_sha256,64),sha=text(m.jpeg_sha256,64);
  need(/^[a-f0-9]{64}$/.test(pixels) && /^[a-f0-9]{64}$/.test(sha),"INVALID_BROWSE_IMAGE_HASH",422);
  finite(m.encode_ms,0,2000);finite(m.encoded_mono_ms,Number(expected.capture_mono_ms),Number(expected.capture_mono_ms)+2000);
  const base64=text(encoded,349528);need(base64.length%4===0 && /^[A-Za-z0-9+/]*={0,2}$/.test(base64),"INVALID_BROWSE_IMAGE_BASE64",422);
  const bytes=new Uint8Array(Buffer.from(base64,"base64"));
  need(bytes.length<=262144 && bytes.length===integer(m.jpeg_bytes,1,262144) && Buffer.from(bytes).toString("base64")===base64 && await hash(bytes)===sha,"BROWSE_IMAGE_BYTES_MISMATCH",422);
  let decoded:{width:number;height:number};
  try {decoded=jpeg.decode(bytes,{useTArray:true,maxResolutionInMP:2,maxMemoryUsageInMB:32,tolerantDecoding:false});}
  catch {need(false,"BROWSE_IMAGE_DECODE_FAILED",422);}
  need(decoded.width===width && decoded.height===height,"BROWSE_IMAGE_DIMENSIONS_MISMATCH",422);
  return {bytes,metadata:m,sha,digest:await hash(canonical(m))};
}
