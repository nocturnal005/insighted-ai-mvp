import { Image as ImageIcon } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/utils";

/** Metadata about a tracked Upload record, passed from the server. */
export interface SourceUpload {
  src: string;
  fileName: string;
  fileType: string;
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
        {upload.fileType.startsWith("image/") ? (
          <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
            {/* The protected, same-origin response is already bounded by upload policy. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={upload.src}
              alt={`Uploaded file: ${upload.fileName}`}
              width={1200}
              height={900}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <a
            href={upload.src}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Open uploaded document
          </a>
        )}
      </CardBody>
    </Card>
  );
}
