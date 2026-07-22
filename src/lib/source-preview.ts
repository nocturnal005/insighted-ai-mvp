import "server-only";

import type { Upload } from "@/lib/types";
import { uploadBytes, uploadDataUrl } from "@/lib/store";

type SharpFactory = typeof import("sharp")["default"];

let sharpModulePromise: Promise<SharpFactory | null> | null = null;
const previewCache = new WeakMap<Upload, Promise<string>>();

function loadSharp(): Promise<SharpFactory | null> {
  sharpModulePromise ??= import("sharp").then((module) => module.default).catch(() => null);
  return sharpModulePromise;
}

async function buildSourcePreview(upload: Upload): Promise<string> {
  const original = uploadDataUrl(upload);
  if (!original || !upload.fileType.startsWith("image/")) return original;

  const bytes = uploadBytes(upload);
  const sharp = await loadSharp();
  if (!bytes || !sharp) return original;

  try {
    const preview = await sharp(bytes, { failOn: "none" })
      .rotate()
      .resize({ width: 1440, height: 1080, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    return `data:image/webp;base64,${preview.toString("base64")}`;
  } catch {
    return original;
  }
}

/**
 * Builds a bounded inline preview while the upload is still available in the same
 * server function as the task page. Assessment and STEM demo uploads fall back to
 * process memory on Vercel, so a separate API route cannot reliably retrieve them.
 */
export function sourcePreviewDataUrl(upload: Upload): Promise<string> {
  const cached = previewCache.get(upload);
  if (cached) return cached;

  const preview = buildSourcePreview(upload);
  previewCache.set(upload, preview);
  return preview;
}
