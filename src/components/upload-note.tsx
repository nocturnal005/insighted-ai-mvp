import { FileWarning } from "lucide-react";

/**
 * Consistent helper shown near every upload control. PDFs are accepted and stored, but
 * PDF rasterisation for OCR is not implemented yet, so a page image is recommended.
 */
export function UploadPdfNote() {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-caution-700">
      <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      PNG/JPG recommended for OCR demo. PDF upload is stored, but PDF OCR is not yet available.
    </p>
  );
}
