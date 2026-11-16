// Offline publication helper. It never opens a serial port or generates a key.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPrivateKey,
  createPublicKey,
  sign,
  createHash,
} from "node:crypto";
import { assertManifest } from "../src/lib/release.js";
const [manifestPath, imagePath, keyPath, keyId, outputPath] =
  process.argv.slice(2);
if (!outputPath || !/^[a-zA-Z0-9_-]{1,64}$/.test(keyId || ""))
  throw new Error(
    "Usage: node scripts/sign-release.mjs manifest.json merged.bin /outside/private.pem key-id /outside/channel.json",
  );
const root = process.cwd(),
  resolvedKey = path.resolve(keyPath),
  relative = path.relative(root, resolvedKey);
if (!relative.startsWith("..") && !path.isAbsolute(relative))
  throw new Error("Keep the private key outside this project.");
const payload = await readFile(manifestPath),
  manifest = assertManifest(JSON.parse(payload)),
  image = await readFile(imagePath);
if (
  image.length !== manifest.artifact.size ||
  createHash("sha256").update(image).digest("hex") !==
    manifest.artifact.sha256 ||
  image[0] !== 0xe9 ||
  image[12] !== 9 ||
  image[13] !== 0
)
  throw new Error("Image does not match manifest");
const key = createPrivateKey(await readFile(resolvedKey));
if (
  key.asymmetricKeyType !== "ec" ||
  key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
)
  throw new Error("An ECDSA P-256 key is required");
const signature = sign("sha256", payload, { key, dsaEncoding: "ieee-p1363" });
const envelope = {
  algorithm: "ECDSA-P256-SHA256",
  keyId,
  payload: payload.toString("base64"),
  signature: signature.toString("base64"),
};
await writeFile(outputPath, JSON.stringify(envelope, null, 2) + "\n", {
  flag: "wx",
});
const spki = createPublicKey(key)
  .export({ type: "spki", format: "der" })
  .toString("base64");
console.log(
  JSON.stringify(
    {
      output: path.resolve(outputPath),
      publicVerificationKey: { [keyId]: spki },
      note: "Only the public verification key is printed. Hardware attestations are not verified by this signing helper.",
    },
    null,
    2,
  ),
);
