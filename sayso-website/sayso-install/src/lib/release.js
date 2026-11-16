const MAX_MANIFEST = 65536;
const FLASH_SIZE = 8 * 1024 * 1024;
const verified = new WeakSet();
const hex = (data) =>
  Array.from(new Uint8Array(data), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
export const sha256 = async (data) =>
  hex(await crypto.subtle.digest("SHA-256", data));
function bytes64(s) {
  if (typeof s !== "string" || s.length > MAX_MANIFEST)
    throw new Error("manifest-invalid");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export function assertManifest(m, now = Date.now()) {
  if (
    !m ||
    m.schema !== 1 ||
    m.status !== "published" ||
    m.profile !== "atoms3-lite-diy" ||
    m.hardware?.chip !== "ESP32-S3" ||
    m.hardware?.flashBytes !== FLASH_SIZE ||
    typeof m.version !== "string" ||
    !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(m.version) ||
    !Number.isFinite(Date.parse(m.expiresAt)) ||
    Date.parse(m.expiresAt) <= now ||
    !Number.isFinite(Date.parse(m.issuedAt)) ||
    Date.parse(m.issuedAt) > now + 300000 ||
    m.security?.efuseWrites !== false ||
    m.security?.secureBoot !== false ||
    m.security?.flashEncryption !== false ||
    m.security?.nvsEncryption !== false ||
    m.approvals?.efuseLifecycle !== true ||
    m.approvals?.downloadMode !== true ||
    m.approvals?.usbMatrix !== true ||
    !/^[a-f0-9]{64}$/.test(m.approvals?.evidenceSha256 || "") ||
    m.installMode !== "clean" ||
    !Array.isArray(m.compatibility) ||
    !m.compatibility.length ||
    m.compatibility.length > 100
  )
    throw new Error("manifest-invalid");
  const ids = new Set();
  for (const c of m.compatibility) {
    if (
      typeof c.model !== "string" ||
      ids.has(c.model) ||
      !Number.isInteger(c.minIOS) ||
      !Number.isInteger(c.maxIOS) ||
      c.minIOS < 17 ||
      c.maxIOS < c.minIOS ||
      c.maxIOS > 99
    )
      throw new Error("manifest-invalid");
    ids.add(c.model);
  }
  const a = m.artifact;
  if (
    !a ||
    a.offset !== 0 ||
    !Number.isInteger(a.size) ||
    a.size < 65536 ||
    a.size > FLASH_SIZE ||
    a.size % 4 !== 0 ||
    !/^[a-f0-9]{64}$/.test(a.sha256 || "") ||
    typeof a.path !== "string" ||
    !/^firmware\/[a-zA-Z0-9_.-]+\.bin$/.test(a.path)
  )
    throw new Error("manifest-invalid");
  return m;
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export async function verifyEnvelope(envelope, keys, now) {
  if (
    !envelope ||
    envelope.algorithm !== "ECDSA-P256-SHA256" ||
    !Object.hasOwn(keys, envelope.keyId)
  )
    throw new Error("signature-invalid");
  const payload = bytes64(envelope.payload),
    signature = bytes64(envelope.signature);
  const key = await crypto.subtle.importKey(
    "spki",
    bytes64(keys[envelope.keyId]),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  if (
    signature.length !== 64 ||
    !(await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signature,
      payload,
    ))
  )
    throw new Error("signature-invalid");
  const m = freeze(
    assertManifest(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload)),
      now,
    ),
  );
  verified.add(m);
  return m;
}
export function assertVerified(m) {
  if (!verified.has(m)) throw new Error("unverified-release");
  assertManifest(m);
}
export async function boundedRead(response, limit, progress = () => {}) {
  if (!response.ok || response.redirected || !response.body)
    throw new Error("download-failed");
  const declared = Number(response.headers.get("content-length"));
  if (declared > limit) throw new Error("download-size");
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("download-size");
      chunks.push(value);
      progress(size);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
export async function loadRelease(base, keys, signal) {
  const timeout = deadline(signal, 15000);
  try {
    const response = await fetch(new URL("releases/channel.json", base), {
      cache: "no-store",
      redirect: "error",
      credentials: "omit",
      signal: timeout.signal,
    });
    const envelope = JSON.parse(
      new TextDecoder().decode(await boundedRead(response, MAX_MANIFEST)),
    );
    if (envelope.status === "unavailable") return null;
    return await verifyEnvelope(envelope, keys);
  } finally {
    timeout.clear();
  }
}
export async function downloadFirmware(m, base, signal, progress) {
  assertVerified(m);
  const timeout = deadline(signal, 60000);
  try {
    const response = await fetch(new URL(m.artifact.path, base), {
      cache: "no-store",
      redirect: "error",
      credentials: "omit",
      signal: timeout.signal,
    });
    const data = await boundedRead(response, m.artifact.size, (n) =>
      progress(Math.min(100, (n / m.artifact.size) * 100)),
    );
    if (
      data.length !== m.artifact.size ||
      (await sha256(data)) !== m.artifact.sha256
    )
      throw new Error("hash-mismatch");
    // Merged ESP32-S3 image starts with its bootloader at address zero.
    if (data[0] !== 0xe9 || data[12] !== 9 || data[13] !== 0)
      throw new Error("image-chip");
    return data;
  } catch (e) {
    if (["hash-mismatch", "image-chip", "download-size"].includes(e.message))
      throw e;
    throw new Error("download-failed");
  } finally {
    timeout.clear();
  }
}
function deadline(parent, ms) {
  const controller = new AbortController(),
    abort = () => controller.abort();
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, ms);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
}
