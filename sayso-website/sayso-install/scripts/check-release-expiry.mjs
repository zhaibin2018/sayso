import { readFile } from "node:fs/promises";
import { verifyEnvelope, loadRelease } from "../src/lib/release.js";
import { expiryStatus } from "../src/lib/expiry.js";
import { TRUSTED_RELEASE_KEYS } from "../src/release-policy.js";

// Read-only maintenance check. It never signs, extends, downloads or flashes firmware.
let report;
try {
  const args = process.argv.slice(2);
  let release;
  if (args[0] === "--base-url") {
    const base = new URL(args[1]);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      !base.pathname.endsWith("/")
    )
      throw new Error("Use an HTTPS installer base URL ending in /.");
    release = await loadRelease(base, TRUSTED_RELEASE_KEYS);
  } else {
    if (args.length)
      throw new Error(
        "Usage: npm run check:expiry [-- --base-url https://host/project/install/]",
      );
    const data = await readFile(
      new URL("../public/releases/channel.json", import.meta.url),
    );
    if (data.length > 65536) throw new Error("manifest-invalid");
    const envelope = JSON.parse(data);
    release =
      envelope.status === "unavailable"
        ? null
        : await verifyEnvelope(envelope, TRUSTED_RELEASE_KEYS);
  }
  report = {
    ...expiryStatus(release),
    ...(release ? { version: release.version } : {}),
  };
} catch (error) {
  report = {
    kind: error.message === "release-expired" ? "expired" : "invalid",
    error: error.message,
    ...(error.expiresAt ? { expiresAt: error.expiresAt } : {}),
  };
}
console.log(JSON.stringify(report, null, 2));
if (["expired", "expiring", "invalid"].includes(report.kind))
  process.exitCode = 1;
