import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

const maximumInputBytes = 5 * 1024 * 1024;
const maximumOutputBytes = 1024 * 1024;
const maximumPixels = 25_000_000;

const allowedTypes = new Map([
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function matchesFileSignature(bytes: Uint8Array, format: string) {
  switch (format) {
    case "jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "png":
      return bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a;
    case "webp":
      return bytes.length >= 12 &&
        String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    default:
      return false;
  }
}

export async function normalizeUploadedImage(bytes: Uint8Array, contentType: string) {
  const expectedFormat = allowedTypes.get(contentType.toLowerCase().split(";", 1)[0].trim());
  if (
    bytes.byteLength > maximumInputBytes ||
    !expectedFormat ||
    !matchesFileSignature(bytes, expectedFormat)
  ) {
    return null;
  }

  const input = Buffer.from(bytes);
  const options = { failOn: "error" as const, limitInputPixels: maximumPixels };
  try {
    const metadata = await sharp(input, options).metadata();
    if (
      metadata.format !== expectedFormat ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > maximumPixels ||
      (metadata.pages ?? 1) !== 1
    ) {
      return null;
    }
    const normalized = await sharp(input, options)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    if (normalized.byteLength === 0 || normalized.byteLength > maximumOutputBytes) {
      return null;
    }
    return {
      data: normalized,
      contentType: "image/webp",
      byteSize: normalized.byteLength,
      sha256: createHash("sha256").update(normalized).digest("hex"),
    };
  } catch {
    return null;
  }
}

export const imageUploadLimits = {
  maximumInputBytes,
  maximumOutputBytes,
};
