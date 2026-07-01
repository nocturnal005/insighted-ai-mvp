/**
 * Image preprocessing for AI/OCR.
 *
 * Uses `sharp` to normalise photographed pupil work before it reaches a provider:
 * auto-rotate (EXIF), cap very large images, and re-encode to a compact PNG. Everything
 * is defensive — any failure returns the ORIGINAL data URL plus a high-severity warning
 * rather than throwing, so a bad image can never crash a server action. PDFs are stored
 * and flagged as pending because raster OCR of PDFs is not wired in this build.
 */
import sharp from "sharp";
import type { UncertaintyFlag } from "./types";
import { validateUpload } from "./config";
import { makeFlag, pdfPendingFlag } from "./uncertainty";

const MAX_WIDTH = 2200; // within the recommended 2000–2500 range

export interface PreprocessInput {
  dataUrl?: string;
  imageUrl?: string;
  mimeType?: string;
  byteSize?: number;
  fileName?: string;
}

export interface PreprocessResult {
  processedDataUrl: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  warnings: UncertaintyFlag[];
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const mime = (match[1] || "application/octet-stream").toLowerCase();
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  try {
    const buffer = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
    return { mime, buffer };
  } catch {
    return null;
  }
}

/**
 * Preprocess an uploaded image. Returns a data URL suitable for a vision provider.
 * Never throws — failures degrade to the original data URL with a warning flag.
 */
export async function preprocessImage(input: PreprocessInput): Promise<PreprocessResult> {
  const warnings: UncertaintyFlag[] = [];

  // Type/size gate (best-effort; provider still receives something usable).
  const check = validateUpload({ mimeType: input.mimeType, byteSize: input.byteSize });
  if (!check.ok) {
    warnings.push(
      makeFlag({
        text: "Upload validation warning",
        reason: check.reason ?? "Upload failed validation.",
        category: "low_image_quality",
        severity: "high",
      }),
    );
  }

  const mime = (input.mimeType ?? "").toLowerCase();

  // If we only have a remote URL (no inline bytes), pass it through untouched.
  if (!input.dataUrl && input.imageUrl) {
    return { processedDataUrl: "", imageUrl: input.imageUrl, warnings };
  }

  if (!input.dataUrl) {
    warnings.push(
      makeFlag({
        text: "No image data",
        reason: "No uploaded image was available to preprocess.",
        category: "low_image_quality",
        severity: "high",
      }),
    );
    return { processedDataUrl: "", warnings };
  }

  // PDFs: store + flag as pending. We do not rasterise PDFs in this build.
  if (mime === "application/pdf" || input.dataUrl.startsWith("data:application/pdf")) {
    warnings.push(pdfPendingFlag());
    return { processedDataUrl: input.dataUrl, warnings };
  }

  const parsed = parseDataUrl(input.dataUrl);
  if (!parsed) {
    warnings.push(
      makeFlag({
        text: "Unreadable image",
        reason: "The uploaded data could not be decoded; using it as-is.",
        category: "low_image_quality",
        severity: "high",
      }),
    );
    return { processedDataUrl: input.dataUrl, warnings };
  }

  try {
    const pipeline = sharp(parsed.buffer, { failOn: "none" }).rotate(); // EXIF auto-rotate
    const meta = await pipeline.metadata();

    if (meta.width && meta.width > MAX_WIDTH) {
      pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    }

    const out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    const processedDataUrl = `data:image/png;base64,${out.toString("base64")}`;

    // Cheap low-quality heuristic: tiny source images are hard to OCR.
    if (meta.width && meta.height && meta.width * meta.height < 300 * 300) {
      warnings.push(
        makeFlag({
          text: "Low-resolution image",
          reason: "The source image is small, which reduces OCR reliability.",
          category: "low_image_quality",
          severity: "medium",
        }),
      );
    }

    return {
      processedDataUrl,
      width: meta.width,
      height: meta.height,
      warnings,
    };
  } catch {
    warnings.push(
      makeFlag({
        text: "Preprocessing failed",
        reason: "Image normalisation failed; the original image was passed through unchanged.",
        category: "low_image_quality",
        severity: "high",
      }),
    );
    return { processedDataUrl: input.dataUrl, warnings };
  }
}
