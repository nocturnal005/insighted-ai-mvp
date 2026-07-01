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

/** Comma-separated accept attribute for file inputs, derived from configured types. */
export function uploadAcceptAttr(): string {
  return getUploadLimits().allowedTypes.join(",");
}
