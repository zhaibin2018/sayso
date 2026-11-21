import assert from "node:assert/strict";
import { test } from "node:test";
import { crc32, inflateSync } from "node:zlib";
import jpeg from "jpeg-js";
import { makeLiveImagePreview, maximumPreviewBytes } from "../lib/live-image-preview.ts";

function sourceJPEG(width: number, height: number, noisy = false) {
  const data = new Uint8Array(width * height * 4);
  let seed = 123456789;
  for (let i = 0; i < data.length; i += 4) {
    const gray = ((i / 4) % width) < width / 2 ? 64 : 224;
    for (let c = 0; c < 3; c++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i + c] = noisy ? seed >>> 24 : gray;
    }
    data[i + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ width, height, data }, 86).data).toString("base64");
}

function readIndexedPNG(data: Buffer) {
  assert.deepEqual(data.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const chunks = new Map<string, Buffer>();
  let offset = 8;
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const end = offset + 8 + length;
    assert.equal(crc32(data.subarray(offset + 4, end)), data.readUInt32BE(end));
    chunks.set(type, data.subarray(offset + 8, end));
    offset = end + 4;
  }
  assert.deepEqual([...chunks.keys()], ["IHDR", "PLTE", "IDAT", "IEND"]);
  const header = chunks.get("IHDR")!;
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4);
  assert.deepEqual([...header.subarray(8)], [8, 3, 0, 0, 0]);
  const palette = chunks.get("PLTE")!, scanlines = inflateSync(chunks.get("IDAT")!);
  assert.equal(palette.length, 256 * 3);
  assert.equal(scanlines.length, (width + 1) * height);
  assert.equal(chunks.get("IEND")!.length, 0);
  for (let y = 0; y < height; y++) assert.equal(scanlines[y * (width + 1)], 0);
  const red = (x: number, y: number) => palette[scanlines[y * (width + 1) + x + 1] * 3];
  return { width, height, red };
}

test("both modes display the same source geometry and actual bright/dark content", () => {
  for (const [sw, sh, width, height] of [[444, 960, 222, 480], [1216, 768, 480, 303], [32, 17, 32, 17]]) {
    const input = sourceJPEG(sw, sh);
    const jpg = makeLiveImagePreview(input, "jpeg"), png = makeLiveImagePreview(input, "png");
    assert.ok(jpg && png);
    assert.deepEqual([jpg.width, jpg.height, png.width, png.height], [width, height, width, height]);
    assert.equal(jpg.mimeType, "image/jpeg");
    assert.equal(png.mimeType, "image/png");
    assert.deepEqual(Object.keys(png).sort(), ["data", "height", "mimeType", "width"]);
    const j = jpeg.decode(Buffer.from(jpg.data, "base64"), { useTArray: true });
    const p = readIndexedPNG(Buffer.from(png.data, "base64"));
    assert.deepEqual([j.width, j.height, p.width, p.height], [width, height, width, height]);
    const y = Math.floor(height / 2), left = Math.floor(width / 4), right = Math.floor(width * 3 / 4);
    for (const sample of [j.data[(y * width + left) * 4], p.red(left, y)]) assert.ok(Math.abs(sample - 64) < 6);
    for (const sample of [j.data[(y * width + right) * 4], p.red(right, y)]) assert.ok(Math.abs(sample - 224) < 6);
  }
});

test("invalid or oversized source is rejected before preview release", () => {
  assert.equal(makeLiveImagePreview("/9j/", "jpeg"), null);
  const input = sourceJPEG(32, 17);
  assert.equal(makeLiveImagePreview(input + "====", "png"), null);
  assert.equal(makeLiveImagePreview(Buffer.alloc(1024 * 1024 + 1).toString("base64"), "png"), null);
  const excessiveDimensions = Buffer.from(input, "base64");
  const startOfFrame = excessiveDimensions.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(startOfFrame >= 0);
  excessiveDimensions.writeUInt16BE(12000, startOfFrame + 5);
  excessiveDimensions.writeUInt16BE(16000, startOfFrame + 7);
  assert.equal(makeLiveImagePreview(excessiveDimensions.toString("base64"), "png"), null);
});

test("high-entropy preview does not exceed the binary delivery budget", () => {
  const input = sourceJPEG(480, 480, true);
  assert.equal(maximumPreviewBytes, 49152);
  assert.equal(makeLiveImagePreview(input, "png"), null);
  assert.equal(makeLiveImagePreview(input, "jpeg"), null);
});
