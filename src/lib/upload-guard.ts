/**
 * Central upload validation for server actions.
 *
 * Single source of truth so every module enforces the same accepted types and size cap,
 * driven by `.env` (`ALLOWED_UPLOAD_TYPES`, `MAX_UPLOAD_MB`) via `src/lib/ai/config.ts`.
 * Keeps oversized or unsupported files from ever reaching a provider call.
 */
import { getUploadLimits, validateUpload } from "@/lib/ai/config";

/** Throws a clear, user-facing error if the file is an unsupported type or too large. */
export function assertValidUpload(file: File): void {
  const check = validateUpload({ mimeType: file.type, byteSize: file.size });
  if (!check.ok) throw new Error(check.reason ?? "Upload failed validation");
}

/**
 * Stricter guard for the vision-based sections (Assessment-Safe, STEM). These send the upload
 * straight to an image model or image OCR provider, which cannot read a PDF in this build, so a
 * PDF here would silently produce an empty or garbage result. Reject it with a clear, actionable
 * message instead.
 */
export function assertVisionImageUpload(file: File): void {
  assertValidUpload(file);
  const isPdf = file.type.toLowerCase() === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    throw new Error(
      "PDF isn't supported for this section yet. Upload a PNG or JPEG image of the visual — a screenshot or clear photo of the page works.",
    );
  }
}

/** Comma-separated accept attribute for file inputs, derived from configured types. */
export function uploadAcceptAttr(): string {
  return getUploadLimits().allowedTypes.join(",");
}
