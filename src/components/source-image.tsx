import { Image as ImageIcon } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/utils";

/** Metadata about a tracked Upload record, passed from the server. */
export interface SourceUpload {
  dataUrl: string;
  fileName: string;
  uploaderName: string;
  createdAt: string;
}

/**
 * Renders an uploaded file from its tracked Upload record, with provenance
 * (who uploaded it and when) — not an anonymous inline image.
 */
export function SourceImage({ upload, label = "Source image" }: { upload: SourceUpload | null; label?: string }) {
  if (!upload) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
          <ImageIcon className="h-3.5 w-3.5" /> Uploaded by {upload.uploaderName} · {formatRelative(upload.createdAt)}
        </span>
      </CardHeader>
      <CardBody>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={upload.dataUrl} alt={`Uploaded file: ${upload.fileName}`} className="max-h-72 rounded-lg border border-zinc-200" />
      </CardBody>
    </Card>
  );
}
