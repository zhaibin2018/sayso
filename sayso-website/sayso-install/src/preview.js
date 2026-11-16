// Only imported in --mode preview. No serial or firmware access.
export const PREVIEW_MARKER = "SIMULATED_INSTALL_ONLY";
export const previewRelease = {
  schema: 1,
  version: "1.0.3-preview",
  profile: "atoms3-lite-diy",
  compatibility: [{ model: "iPhone 16 Pro", minIOS: 17, maxIOS: 26 }],
  artifact: { size: 1048576, sha256: "a1b2c3d4".repeat(8) },
  installMode: "clean",
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function simulateInstall(onProgress, failure) {
  for (const stage of ["download", "erase", "write", "verify", "restart"]) {
    if (["erase", "restart"].includes(stage)) {
      onProgress(stage, null);
      await wait(700);
    } else
      for (let progress = 0; progress <= 100; progress += 10) {
        onProgress(stage, progress);
        await wait(170);
        if (failure && stage === "write" && progress === 50)
          throw new Error("preview-disconnect");
      }
  }
  return {
    written: true,
    readback: true,
    restarted: true,
    startupVerified: false,
  };
}
