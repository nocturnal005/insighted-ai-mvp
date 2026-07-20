/**
 * Braille-specific image preparation.
 *
 * The primary OCR provider still receives one image. A secondary vision reviewer gets a
 * whole-page view plus up to four overlapping, lossless, contrast-normalised horizontal
 * bands. This preserves small dot detail without asking a language model to replace the
 * dot/cell-aware OCR engine.
 */
import type { UncertaintyFlag } from "./types";
import { validateUpload } from "./config";
import { makeFlag, pdfPendingFlag } from "./uncertainty";

let sharpModule: any = null;
try {
  sharpModule = require("sharp");
} catch {
  // Optional native dependency. The original image remains usable when unavailable.
}

const REVIEW_WIDTH = 1800;
const MAX_REVIEW_BANDS = 4;
const TILE_PATCH_THRESHOLD = 1200;

export interface BraillePreprocessInput {
  dataUrl?: string;
  imageUrl?: string;
  mimeType?: string;
  byteSize?: number;
}

export interface BraillePreprocessResult {
  dataUrl?: string;
  imageUrl?: string;
  reviewImageUrls: string[];
  width?: number;
  height?: number;
  warnings: UncertaintyFlag[];
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  try {
    return {
      mime: (match[1] || "application/octet-stream").toLowerCase(),
      buffer: match[2]
        ? Buffer.from(match[3] ?? "", "base64")
        : Buffer.from(decodeURIComponent(match[3] ?? ""), "utf8"),
    };
  } catch {
    return null;
  }
}

function dataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function qualityFlag(text: string, reason: string, severity: "low" | "medium" | "high"): UncertaintyFlag {
  return makeFlag({ text, reason, category: "low_image_quality", severity });
}

/** Prepare one primary image and high-detail crops for secondary review. Never throws. */
export async function preprocessBrailleImage(input: BraillePreprocessInput): Promise<BraillePreprocessResult> {
  const warnings: UncertaintyFlag[] = [];
  const check = validateUpload({ mimeType: input.mimeType, byteSize: input.byteSize });
  if (!check.ok) warnings.push(qualityFlag("Upload validation warning", check.reason ?? "Upload failed validation.", "high"));

  if (!input.dataUrl && input.imageUrl) {
    return { imageUrl: input.imageUrl, reviewImageUrls: [input.imageUrl], warnings };
  }
  if (!input.dataUrl) {
    warnings.push(qualityFlag("No image data", "No uploaded image was available to preprocess.", "high"));
    return { reviewImageUrls: [], warnings };
  }

  const mime = (input.mimeType ?? "").toLowerCase();
  if (mime === "application/pdf" || input.dataUrl.startsWith("data:application/pdf")) {
    warnings.push(pdfPendingFlag());
    return { dataUrl: input.dataUrl, reviewImageUrls: [], warnings };
  }

  const parsed = parseDataUrl(input.dataUrl);
  if (!parsed) {
    warnings.push(qualityFlag("Unreadable image", "The uploaded image could not be decoded; the original data is retained.", "high"));
    return { dataUrl: input.dataUrl, reviewImageUrls: [input.dataUrl], warnings };
  }

  if (!sharpModule) {
    warnings.push(
      qualityFlag(
        "Braille enhancement skipped",
        "The image processing library is unavailable; the reviewer receives the original image without lossless crops.",
        "medium",
      ),
    );
    return { dataUrl: input.dataUrl, reviewImageUrls: [input.dataUrl], warnings };
  }

  try {
    const metadata = await sharpModule(parsed.buffer, { failOn: "none" }).metadata();
    if (metadata.width && metadata.height && metadata.width * metadata.height < 500 * 500) {
      warnings.push(
        qualityFlag(
          "Low-resolution Braille image",
          "The capture is small for reliable dot and cell inspection. Retake it closer and in even light.",
          "medium",
        ),
      );
    }

    const needsRotation = typeof metadata.orientation === "number" && metadata.orientation !== 1;
    let primaryDataUrl = input.dataUrl;
    if (needsRotation) {
      const rotated = parsed.mime === "image/png"
        ? await sharpModule(parsed.buffer, { failOn: "none" }).rotate().png({ compressionLevel: 6 }).toBuffer()
        : await sharpModule(parsed.buffer, { failOn: "none" }).rotate().jpeg({ quality: 95, mozjpeg: false }).toBuffer();
      primaryDataUrl = dataUrl(parsed.mime === "image/png" ? "image/png" : "image/jpeg", rotated);
    }

    // Lossless WebP keeps small embossed-dot edges while avoiding the size of a full-page PNG.
    const enhanced = await sharpModule(parsed.buffer, { failOn: "none" })
      .rotate()
      .resize({ width: REVIEW_WIDTH, withoutEnlargement: true })
      .greyscale()
      .normalise()
      .sharpen({ sigma: 0.8 })
      .webp({ lossless: true, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const reviewImageUrls = [dataUrl("image/webp", enhanced.data)];
    const width = enhanced.info.width;
    const height = enhanced.info.height;
    const patchCount = Math.ceil(width / 32) * Math.ceil(height / 32);

    if (patchCount > TILE_PATCH_THRESHOLD && height >= 500) {
      const targetBandHeight = Math.max(320, Math.floor(width * 0.45));
      const bandCount = Math.min(MAX_REVIEW_BANDS, Math.max(2, Math.ceil(height / targetBandHeight)));
      const baseBandHeight = Math.ceil(height / bandCount);
      const overlap = Math.min(72, Math.max(24, Math.floor(baseBandHeight * 0.12)));

      for (let index = 0; index < bandCount; index += 1) {
        const top = Math.max(0, index * baseBandHeight - (index === 0 ? 0 : overlap));
        const bottom = Math.min(height, (index + 1) * baseBandHeight + (index === bandCount - 1 ? 0 : overlap));
        const band = await sharpModule(enhanced.data, { failOn: "none" })
          .extract({ left: 0, top, width, height: Math.max(1, bottom - top) })
          .webp({ lossless: true, effort: 4 })
          .toBuffer();
        reviewImageUrls.push(dataUrl("image/webp", band));
      }
    }

    return {
      dataUrl: primaryDataUrl,
      reviewImageUrls,
      width: metadata.width,
      height: metadata.height,
      warnings,
    };
  } catch {
    warnings.push(
      qualityFlag(
        "Braille preprocessing failed",
        "Lossless enhancement and review crops could not be generated; the original image is retained.",
        "medium",
      ),
    );
    return { dataUrl: input.dataUrl, reviewImageUrls: [input.dataUrl], warnings };
  }
}
