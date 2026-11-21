import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";
import jpeg from "jpeg-js";

const maximumSourceBytes = 1024 * 1024;
const maximumSourcePixels = 4_200_000;
const maximumPreviewSide = 480;
export const maximumPreviewBytes = 48 * 1024;

type PreviewEncoding = "jpeg" | "png";
type LiveImagePreview = {
  data: string;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
};

function resizedRGBA(source: Uint8Array, sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const result = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, (y + 0.5) * sourceHeight / height - 0.5);
    const y0 = Math.floor(top), y1 = Math.min(y0 + 1, sourceHeight - 1), fy = top - y0;
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, (x + 0.5) * sourceWidth / width - 0.5);
      const x0 = Math.floor(left), x1 = Math.min(x0 + 1, sourceWidth - 1), fx = left - x0;
      const upper = (y0 * sourceWidth + x0) * 3, lower = (y1 * sourceWidth + x0) * 3;
      const next = (x1 - x0) * 3, offset = (y * width + x) * 4;
      for (let color = 0; color < 3; color++) {
        const a = source[upper + color] * (1 - fx) + source[upper + next + color] * fx;
        const b = source[lower + color] * (1 - fx) + source[lower + next + color] * fx;
        result[offset + color] = Math.round(a * (1 - fy) + b * fy);
      }
      result[offset + 3] = 255;
    }
  }
  return result;
}

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) {
    crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
  }
  return crc;
});

function pngChunk(type: string, data: Uint8Array) {
  const chunk = Buffer.allocUnsafe(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  chunk.set(data, 8);
  let crc = 0xffffffff;
  for (let offset = 4; offset < chunk.length - 4; offset++) {
    crc = crcTable[(crc ^ chunk[offset]) & 255] ^ (crc >>> 8);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return chunk;
}

// Small fixed color cube plus a denser neutral ramp for common text and UI.
const pngPalette = Buffer.alloc(256 * 3);
for (let index = 0; index < 216; index++) {
  pngPalette[index * 3] = Math.floor(index / 36) * 51;
  pngPalette[index * 3 + 1] = Math.floor(index / 6) % 6 * 51;
  pngPalette[index * 3 + 2] = index % 6 * 51;
}
for (let level = 0; level < 40; level++) {
  const color = Math.round(level * 255 / 39);
  const index = (216 + level) * 3;
  pngPalette.fill(color, index, index + 3);
}

const pngPaletteChunk = pngChunk("PLTE", pngPalette);
const pngEndChunk = pngChunk("IEND", new Uint8Array(0));

function encodePNG(rgba: Uint8Array, width: number, height: number) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 3;

  const stride = width + 1;
  const scanlines = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2];
      const neutral = Math.max(r, g, b) - Math.min(r, g, b) <= 12;
      scanlines[y * stride + x + 1] = neutral
        ? 216 + Math.round((r + g + b) * 39 / 765)
        : Math.round(r / 51) * 36 + Math.round(g / 51) * 6 + Math.round(b / 51);
    }
  }
  const compressed = deflateSync(scanlines, { level: 3 });
  return Buffer.concat([pngSignature, pngChunk("IHDR", header), pngPaletteChunk,
    pngChunk("IDAT", compressed), pngEndChunk]);
}

/** A bounded display rendition of an already verified live JPEG. Its bytes are
 * unrelated to the original action evidence hash and carry no input authority. */
export function makeLiveImagePreview(fullJPEGBase64: string, encoding: PreviewEncoding): LiveImagePreview | null {
  if ((encoding !== "jpeg" && encoding !== "png") || !fullJPEGBase64 ||
      fullJPEGBase64.length > Math.ceil(maximumSourceBytes / 3) * 4 || fullJPEGBase64.length % 4 !== 0) return null;
  try {
    const source = Buffer.from(fullJPEGBase64, "base64");
    if (source.length > maximumSourceBytes || source[0] !== 0xff || source[1] !== 0xd8 ||
        source.toString("base64") !== fullJPEGBase64) return null;

    const image = jpeg.decode(source, { useTArray: true, formatAsRGBA: false, tolerantDecoding: false,
      maxResolutionInMP: maximumSourcePixels / 1_000_000, maxMemoryUsageInMB: 48 });
    const pixels = image.width * image.height;
    if (!Number.isSafeInteger(pixels) || image.width < 1 || image.height < 1 || pixels > maximumSourcePixels ||
        image.data.length !== pixels * 3) return null;

    const scale = Math.min(1, maximumPreviewSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const data = resizedRGBA(image.data, image.width, image.height, width, height);
    const encoded = encoding === "png" ? encodePNG(data, width, height) : jpeg.encode({ data, width, height }, 68).data;
    if (encoded.length > maximumPreviewBytes) return null;

    return { data: Buffer.from(encoded).toString("base64"), mimeType: encoding === "png" ? "image/png" : "image/jpeg",
      width, height };
  } catch {
    return null;
  }
}
