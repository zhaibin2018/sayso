import { ESPLoader, Transport } from "esptool-js";
import SparkMD5 from "spark-md5";
import { assertSecurity } from "./policy.js";
import { assertVerified, sha256 } from "./release.js";

export async function openDevice(port) {
  const transport = new Transport(port, false);
  const loader = new ESPLoader({
    transport,
    baudrate: 115200,
    romBaudrate: 115200,
    terminal: { clean() {}, write() {}, writeLine() {} },
    debugLogging: false,
    enableTracing: false,
  });
  try {
    await loader.detectChip("no_reset", 2);
    if (loader.chip?.CHIP_NAME !== "ESP32-S3" || loader.secureDownloadMode)
      throw new Error("device-chip");
    const security = await loader.getSecurityInfo(false);
    assertSecurity(security);
    if (typeof loader.chip.postConnect === "function")
      await loader.chip.postConnect(loader);
    const flashSize = await loader.detectFlashSize();
    if (flashSize !== "8MB") throw new Error("device-size");
    const identity = await loader.chip.readMac(loader);
    return {
      loader,
      transport,
      identity,
      security,
      flashSize,
      close: () => transport.disconnect(),
    };
  } catch (e) {
    await transport.disconnect().catch(() => {});
    throw e;
  }
}
export async function flashDevice(device, release, data, onProgress) {
  assertVerified(release);
  if (
    data.length !== release.artifact.size ||
    (await sha256(data)) !== release.artifact.sha256
  )
    throw new Error("hash-mismatch");
  assertSecurity(await device.loader.getSecurityInfo(false));
  if (
    (await device.loader.chip.readMac(device.loader)) !== device.identity ||
    (await device.loader.detectFlashSize()) !== "8MB"
  )
    throw new Error("device-changed");
  // No security provisioning calls. The signed firmware still needs independent lifecycle auditing.
  await device.loader.runStub();
  onProgress("erase", null);
  await device.loader.eraseFlash();
  onProgress("write", 0);
  await device.loader.writeFlash({
    fileArray: [{ data, address: 0 }],
    flashSize: "keep",
    flashMode: "keep",
    flashFreq: "keep",
    eraseAll: false,
    compress: true,
    reportProgress: (_i, n, total) =>
      onProgress("write", Math.min(100, (n / total) * 100)),
    calculateMD5Hash: (image) =>
      SparkMD5.ArrayBuffer.hash(
        image.buffer.slice(
          image.byteOffset,
          image.byteOffset + image.byteLength,
        ),
      ),
  });
  // Independent SHA-256 read-back as well as esptool's on-device MD5 comparison.
  onProgress("verify", 0);
  const readback = await device.loader.readFlash(
    0,
    data.length,
    (_chunk, n, total) =>
      onProgress("verify", Math.min(100, (n / total) * 100)),
  );
  if (
    readback.length !== data.length ||
    (await sha256(readback)) !== release.artifact.sha256
  )
    throw new Error("readback-mismatch");
  onProgress("restart", null);
  let restarted = true;
  try {
    await device.loader.after("hard_reset");
  } catch {
    restarted = false;
  }
  await device.close().catch(() => {});
  return { written: true, readback: true, restarted, startupVerified: false };
}
