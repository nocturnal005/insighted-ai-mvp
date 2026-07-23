import { getCurrentUser } from "@/lib/session";
import { getTaskUpload } from "@/lib/data";
import { hydrateBrailleUpload } from "@/lib/durable-braille";
import { hydrateDemoUpload } from "@/lib/durable-demo";
import { uploadBytes } from "@/lib/store";
import sharp from "sharp";

export const dynamic = "force-dynamic";

export async function GET(request: Request, props: { params: Promise<{ taskId: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  let upload = getTaskUpload(params.taskId);
  let bytes = upload ? uploadBytes(upload) : null;

  // Durable Braille detail hydration intentionally keeps binary data out of the
  // document response. Fetch it only when the browser actually requests the image.
  if (!bytes) {
    upload =
      (await hydrateDemoUpload(params.taskId)) ??
      (await hydrateBrailleUpload(params.taskId));
    bytes = upload ? uploadBytes(upload) : null;
  }

  if (!upload || upload.organisationId !== user.organisationId || !bytes) {
    return new Response(null, { status: 404 });
  }

  const wantsPreview = new URL(request.url).searchParams.get("preview") === "1";
  if (wantsPreview && upload.fileType.startsWith("image/")) {
    try {
      const preview = await sharp(bytes)
        .rotate()
        .resize({ width: 1440, height: 1080, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      return new Response(new Uint8Array(preview), {
        headers: {
          "Content-Type": "image/webp",
          "Content-Length": String(preview.byteLength),
          "Content-Disposition": "inline",
          "Cache-Control": "private, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      // If an unusual image cannot be transformed, return the validated original below.
    }
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": upload.fileType || "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
