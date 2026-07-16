import { getCurrentUser } from "@/lib/session";
import { getTaskUpload } from "@/lib/data";
import { hydrateBrailleUpload } from "@/lib/durable-braille";
import { uploadBytes } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { taskId: string } }) {
  const user = getCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  let upload = getTaskUpload(params.taskId);
  let bytes = upload ? uploadBytes(upload) : null;

  // Durable Braille detail hydration intentionally keeps binary data out of the
  // document response. Fetch it only when the browser actually requests the image.
  if (!bytes) {
    upload = await hydrateBrailleUpload(params.taskId);
    bytes = upload ? uploadBytes(upload) : null;
  }

  if (!upload || upload.organisationId !== user.organisationId || !bytes) {
    return new Response(null, { status: 404 });
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
