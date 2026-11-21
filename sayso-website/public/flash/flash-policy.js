// D144: only the pinned USB 0.6.0 release is offered. Local candidate; publication is separate.
export const PREVIEW_ONLY = false;
export const RELEASE_VERSION = "0.6.0";
export const RELEASE_SHA256 = "32d29251e181b4ae1b951618bc8d172d5aab3acd0a78c0b570a97f53382432b6";
export const INSTALLER_URL =
  "https://cdn.jsdelivr.net/npm/esp-web-tools@10.1.0/dist/web/install-button.js";

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
