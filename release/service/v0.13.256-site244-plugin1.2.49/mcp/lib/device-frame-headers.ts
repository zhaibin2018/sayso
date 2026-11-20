import { BridgeError, record } from "./bridge-engine.ts";
export const frameHeaders: Record<string, string> = {
  bridge_session_id: "X-Bridge-Session-ID",
  broadcast_id: "X-Broadcast-ID",
  worker_id: "X-Worker-ID",
  lease_epoch: "X-Lease-Epoch",
  frame_id: "X-Frame-ID",
  frame_seq: "X-Frame-Seq",
  captured_at: "X-Captured-At",
  capture_age_ms: "X-Capture-Age-Ms",
  capture_mono_ms: "X-Capture-Mono-Ms",
  width: "X-Width",
  height: "X-Height",
  native_width_px: "X-Native-Width",
  native_height_px: "X-Native-Height",
  orientation: "X-Orientation",
  orientation_epoch: "X-Orientation-Epoch",
  content_sha256: "X-Content-SHA256",
  after_command_id: "X-After-Command-ID",
  clock_probe_id: "X-Clock-Probe-ID",
  capture_offset_ms: "X-Capture-Offset-Ms",
  clock_rtt_ms: "X-Clock-Rtt-Ms",
  provenance: "X-Frame-Provenance",
};
const numeric = new Set(
  "lease_epoch frame_seq capture_age_ms capture_mono_ms width height native_width_px native_height_px orientation_epoch capture_offset_ms clock_rtt_ms".split(
    " ",
  ),
);
export function readFrameHeaders(request: Request) {
  const metadata: Record<string, unknown> = {};
  for (const [key, header] of Object.entries(frameHeaders)) {
    const value = request.headers.get(header);
    if (value !== null) metadata[key] = numeric.has(key) ? Number(value) : value;
  }
  const geometry = request.headers.get("X-Frame-Geometry");
  if (geometry) Object.assign(metadata, record(JSON.parse(geometry)));
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("image/jpeg"))
    throw new BridgeError("JPEG_REQUIRED", 415);
  return metadata;
}
