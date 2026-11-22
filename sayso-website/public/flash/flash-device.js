import {
  verifyBundle,
  canInstall,
  INSTALLER_URL,
  MD5_URL,
} from "./flash-policy.js";

export async function loadTool() {
  const [tool, md5] = await Promise.all([
    import(INSTALLER_URL),
    import(MD5_URL),
  ]);
  if (!tool.ESPLoader || !tool.Transport || !md5.default?.ArrayBuffer?.hash)
    throw Error("toolFailed");
  // Check the lazily loaded ESP32-S3 stub before the user can select a device.
  const stub = await tool.getStubJsonByChipName("ESP32-S3");
  if (!stub?.decodedText?.length || !stub?.decodedData?.length)
    throw Error("toolFailed");
  return { ...tool, md5: md5.default };
}
function assertSecurity(info) {
  // Same fail-closed predicates as the independent signed installer's serial adapter.
  if (
    !info ||
    info.chipId !== 9 ||
    info.flags !== 0 ||
    info.flashCryptCnt !== 0 ||
    !Array.isArray(info.keyPurposes) ||
    info.keyPurposes.length < 6 ||
    info.keyPurposes.some((v) => v !== 0)
  )
    throw Error("safetyFailed");
}

// No chooser, console, automatic retry, identity provisioning or eFuse writes here.
// The exact verified in-memory bytes are written; the library never re-fetches them.
export async function flashDevice(port, bundle, tool, onState) {
  const { manifest, release, bytes } = bundle;
  await verifyBundle(manifest, release, bytes);
  if (
    !canInstall(release, {
      secure: true,
      serial: true,
      verified: true,
      installerLoaded: true,
    })
  )
    throw Error("checkFailed");
  const data = new Uint8Array(bytes);
  const transport = new tool.Transport(port, false);
  const loader = new tool.ESPLoader({
    transport,
    baudrate: 115200,
    romBaudrate: 115200,
    terminal: { clean() {}, write() {}, writeLine() {} },
    debugLogging: false,
    enableTracing: false,
  });
  let failure,
    verified = false;
  try {
    onState({ phase: "preparing" });
    await loader.detectChip("no_reset", 2);
    if (loader.chip?.CHIP_NAME !== "ESP32-S3" || loader.secureDownloadMode)
      throw Error("wrongDevice");
    assertSecurity(await loader.getSecurityInfo(false));
    if (typeof loader.chip.postConnect === "function")
      await loader.chip.postConnect(loader);
    if ((await loader.detectFlashSize()) !== "8MB") throw Error("wrongDevice");
    const identity = await loader.chip.readMac(loader);
    // Recheck immediately before entering the destructive part of installation.
    assertSecurity(await loader.getSecurityInfo(false));
    if (
      !identity ||
      (await loader.chip.readMac(loader)) !== identity ||
      (await loader.detectFlashSize()) !== "8MB"
    )
      throw Error("safetyFailed");
    await loader.runStub();
    onState({ phase: "erasing" });
    await loader.eraseFlash();
    onState({ phase: "writing", percent: 0 });
    await loader.writeFlash({
      fileArray: [{ data, address: 0 }],
      flashSize: "keep",
      flashMode: "keep",
      flashFreq: "keep",
      eraseAll: false,
      compress: true,
      calculateMD5Hash: (image) =>
        tool.md5.ArrayBuffer.hash(
          image.buffer.slice(
            image.byteOffset,
            image.byteOffset + image.byteLength,
          ),
        ),
      reportProgress: (_index, written, total) =>
        onState({
          phase: "writing",
          percent: Math.min(100, Math.floor((written / total) * 100)),
        }),
    });
    onState({ phase: "verifying", percent: 0 });
    const readback = await loader.readFlash(
      0,
      data.length,
      (_chunk, n, total) =>
        onState({
          phase: "verifying",
          percent: Math.min(100, Math.floor((n / total) * 100)),
        }),
    );
    try {
      await verifyBundle(manifest, release, readback);
    } catch {
      throw Error("verifyFailed");
    }
    verified = true;
    onState({ phase: "restarting" });
    // Unplugging after success also restarts the accessory if the USB reset is unavailable.
    await loader.after("hard_reset").catch(() => {});
  } catch (error) {
    failure = error;
  } finally {
    try {
      await transport.disconnect();
    } catch {
      // A verified USB device may disappear while hard-resetting. Its readback
      // has already passed; unplugging is the instructed next step either way.
      if (!verified) failure ??= Error("connectionFailed");
    }
  }
  if (failure) throw failure;
}
