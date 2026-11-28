import {diagnosticsEnabled} from "./build-profile";
import { env } from "cloudflare:workers";
import { BridgeEngine, BridgeError, type User } from "./bridge-engine";
import { background } from "./bridge-context";
import { PrivatePixelCache } from "./private-pixel-cache";
import {boundedBody} from "./bounded-body";
import {FrameUploadPermits} from "./frame-upload-permit";
import {imageReleaseClockSampler} from "./image-release-clock";
export const maintenanceOwnerID = env.SAYSO_INSTALL_OWNER_ID;
export const publicOrigin = "https://YOUR-SITE.chatgpt.site";
export function createImageReleaseClockSampler() {
  // A named, read-only Cache API miss is native local I/O and cannot go to
  // the origin. The fixed key carries no request, owner or image data.
  return imageReleaseClockSampler(typeof caches==="undefined"?undefined:
    ()=>caches.open("sayso-release-clock-v1").then(cache=>cache.match(publicOrigin+"/__sayso_release_clock/v1")));
}
const privatePixels=typeof caches==="undefined"?undefined:new PrivatePixelCache(publicOrigin,()=>caches.open("sayso-private-pixels-v1"));
const framePermits=new FrameUploadPermits(env.SAYSO_FRAME_PERMIT_HMAC_KEY_HEX);
export function engine() {
  if (!env.DB || !env.BUCKET) throw new BridgeError("STORAGE_UNAVAILABLE", 503);
  return new BridgeEngine({ db: env.DB, bucket: env.BUCKET, privatePixels, framePermits,
    frameUploadTraceDevice: env.SAYSO_FRAME_UPLOAD_TRACE_DEVICE,
    diagnosticParallelSharing: diagnosticsEnabled && env.SAYSO_DIAGNOSTIC_PARALLEL_SHARING === "1",
    browseEnabled: diagnosticsEnabled && env.SAYSO_BROWSE_ENABLED === "1", schedule: (delay, job) => background(new Promise<void>(resolve => setTimeout(resolve, delay)).then(job)) });
}
export function caller(request: Request): User {
  const id = request.headers.get("oai-authenticated-user-id");
  if (!id || !id.trim() || id.length > 256) throw new BridgeError("UNAUTHENTICATED", 401);
  let label = request.headers.get("oai-authenticated-user-email") ?? "已授权用户";
  if (request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { label = decodeURIComponent(request.headers.get("oai-authenticated-user-full-name") ?? label); } catch { /* Use verified fallback. */ }
  }
  return { id, label: label.slice(0, 120) };
}
export function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
export const bounded = boundedBody;
export function failure(error: unknown) { return error instanceof BridgeError ? json({ error: { code: error.code, message: error.code } }, error.status) : json({ error: { code: "INTERNAL_ERROR", message: "请求未完成" } }, 500); }
