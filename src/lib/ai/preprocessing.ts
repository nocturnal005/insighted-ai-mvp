/**
 * Image preprocessing for AI/OCR.
 *
 * Uses `sharp` to normalise photographed pupil work before it reaches a provider:
 * auto-rotate (EXIF) and cap very large images. Images that already fit are reused;
 * transformed JPEGs remain JPEGs so photographs do not balloon into lossless PNGs.
 * is defensive — any failure returns the ORIGINAL data URL plus a high-severity warning
 * rather than throwing, so a bad image can never crash a server action. PDFs are stored
 * and flagged as pending because raster OCR of PDFs is not wired in this build.
 *
 * Sharp is optional: if the native binary is unavailable (e.g. Vercel build environment),
 * image normalisation is skipped and the original data URL is returned with a warning.
 */
type SharpFactory = typeof import("sharp")["default"];
let sharpModulePromise: Promise<SharpFactory | null> | null = null;

function loadSharp(): Promise<SharpFactory | null> {
  sharpModulePromise ??= import("sharp").then((module) => module.default).catch(() => null);
  return sharpModulePromise;
}
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
  const sharpModule = await loadSharp();
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

  // If sharp is not available (e.g., missing native deps in serverless), skip normalisation.
  if (!sharpModule) {
    warnings.push(
      makeFlag({
        text: "Image normalisation skipped",
        reason: "The image processing library is not available in this environment; the original image is passed through unchanged.",
        category: "low_image_quality",
        severity: "medium",
      }),
    );
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
    const image = sharpModule(parsed.buffer, { failOn: "none" });
    const meta = await image.metadata();
    const shouldResize = Boolean(meta.width && meta.width > MAX_WIDTH);
    const shouldRotate = typeof meta.orientation === "number" && meta.orientation !== 1;

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

    // Avoid a full decode/encode when there is nothing to normalise. This is the
    // common case for screenshots and already-resized camera images.
    if (!shouldResize && !shouldRotate && ["image/jpeg", "image/jpg", "image/png"].includes(parsed.mime)) {
      return {
        processedDataUrl: input.dataUrl,
        width: meta.width,
        height: meta.height,
        warnings,
      };
    }

    let pipeline = image.rotate(); // EXIF auto-rotate
    if (shouldResize) pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });

    // Photographs become much larger when converted to PNG. Keep JPEG input as a
    // high-quality JPEG; retain lossless PNG for diagrams and screenshots.
    const outputIsPng = parsed.mime === "image/png";
    const out = outputIsPng
      ? await pipeline.png({ compressionLevel: 6 }).toBuffer()
      : await pipeline.jpeg({ quality: 92, mozjpeg: false }).toBuffer();
    const outputMime = outputIsPng ? "image/png" : "image/jpeg";

    return {
      processedDataUrl: `data:${outputMime};base64,${out.toString("base64")}`,
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
