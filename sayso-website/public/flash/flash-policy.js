// D144: only the pinned USB 0.6.1 release is offered. Published USB channel; physical acceptance remains separate.
export const PREVIEW_ONLY = false;
export const RELEASE_VERSION = "0.6.1";
export const RELEASE_SHA256 =
  "2d7a03b460b5d6e16cfbc288cb18af1a6188b4d5190a2ba594318c7399e02026";
export const INSTALLER_URL =
  "https://cdn.jsdelivr.net/npm/esptool-js@0.7.1/+esm";
export const MD5_URL = "https://cdn.jsdelivr.net/npm/spark-md5@3.0.2/+esm";

export async function verifyBundle(manifest, release, bytes) {
  const build = manifest.builds?.[0];
  const part = build?.parts?.[0];
  if (
    manifest.version !== release.version ||
    release.version !== RELEASE_VERSION ||
    release.runtimeVersion !== RELEASE_VERSION ||
    release.sha256 !== RELEASE_SHA256 ||
    manifest.builds?.length !== 1 ||
    build?.chipFamily !== "ESP32-S3" ||
    build.parts?.length !== 1 ||
    part?.offset !== 0 ||
    !/^sayso-c124-[a-zA-Z0-9.-]+\.bin$/.test(release.file) ||
    part?.path !== release.file ||
    release.profile !== "c124-production" ||
    release.flashOffset !== 0 ||
    release.identityIncluded !== false ||
    release.nvsErasedPadding !== true ||
    !/^[a-f0-9]{64}$/.test(release.sha256) ||
    bytes.byteLength !== release.bytes
  ) {
    throw new Error("MANIFEST_MISMATCH");
  }
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== release.sha256) throw new Error("SHA256_MISMATCH");
  return hash;
}

export function canInstall(
  release,
  { secure, serial, verified, installerLoaded },
) {
  return (
    !PREVIEW_ONLY &&
    release.version === RELEASE_VERSION &&
    release.sha256 === RELEASE_SHA256 &&
    release.profile === "c124-production" &&
    release.channel === "release" &&
    release.releaseReady === true &&
    [
      "button_pairing",
      "long_text_renewal",
      "typed_count",
      "cancel_current_operation",
    ].every((feature) => release.features?.includes(feature)) &&
    secure &&
    serial &&
    verified &&
    installerLoaded
  );
}
