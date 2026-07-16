/**
 * ABC Braille image-to-text adapter.
 *
 * ABC Braille currently exposes its image translator as a three-step web workflow rather
 * than a documented JSON API: upload an image, start the scan, then open the generated
 * results page. This adapter performs one workflow per explicit staff click and extracts
 * the ordered "Text translation" list without rewriting the provider's words.
 *
 * The integration deliberately remains draft-only. ABC Braille does not return a numeric
 * confidence score, and every result must still be checked by a Braille-literate specialist.
 */
import type { BrailleOcrInput, BrailleOcrResult, UncertaintyFlag } from "../types";
import { getAbcBrailleConfig } from "../config";
import { startRun, finishMeta, type RunTimer } from "../meta";
import { processingFailedFlag, requiresSpecialistReviewFlag } from "../uncertainty";
import { safeErrorLabel } from "../safety";

const PROVIDER = "abc_braille_web";
const MODEL = "image-to-text";
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const radix = code[1]?.toLowerCase() === "x" ? 16 : 10;
      const digits = radix === 16 ? code.slice(2) : code.slice(1);
      const point = Number.parseInt(digits, radix);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function textFromHtml(fragment: string): string {
  return decodeHtml(
    fragment
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  ).trim();
}

function absoluteUrl(baseUrl: string, path: string): string {
  const url = new URL(path, `${baseUrl}/`);
  const expected = new URL(baseUrl);
  if (url.origin !== expected.origin) throw new Error("ABC Braille returned an unexpected origin");
  return url.toString();
}

function extractAction(html: string, pattern: RegExp, label: string): string {
  const match = html.match(pattern);
  if (!match?.[1]) throw new Error(`ABC Braille ${label} was not present`);
  return decodeHtml(match[1]);
}

function extractList(html: string, heading: string): string[] {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const section = html.match(
    new RegExp(`<h4[^>]*>\\s*${escapedHeading}\\s*</h4>\\s*<ol[^>]*>([\\s\\S]*?)</ol>`, "i"),
  )?.[1];
  if (!section) return [];

  return Array.from(section.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
    .map((match) => textFromHtml(match[1]))
    .filter(Boolean);
}

async function readHtml(response: Response): Promise<string> {
  if (!response.ok) throw new Error(`ABC Braille returned status ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("ABC Braille response was too large");
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("ABC Braille response was too large");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

function decodeDataUrl(dataUrl: string): { bytes: Buffer; mimeType: string } {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) throw new Error("Uploaded image data was unavailable");
  const mimeType = match[1] || "application/octet-stream";
  const bytes = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");
  if (!bytes.length) throw new Error("Uploaded image was empty");
  return { bytes, mimeType };
}

function cookieHeader(response: Response): string | undefined {
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const values = getSetCookie?.call(response.headers) ?? [response.headers.get("set-cookie")].filter(Boolean) as string[];
  const cookies = values.map((value) => value.split(";", 1)[0]).filter(Boolean);
  return cookies.length ? cookies.join("; ") : undefined;
}

export async function transcribeBrailleWithAbc(input: BrailleOcrInput): Promise<BrailleOcrResult> {
  const timer = startRun();
  const specialistFlag = requiresSpecialistReviewFlag();
  const { baseUrl, languageTable, timeoutMs } = getAbcBrailleConfig();

  try {
    if (!input.dataUrl) throw new Error("No uploaded image was available");
    const { bytes, mimeType } = decodeDataUrl(input.dataUrl);
    if (!mimeType.startsWith("image/")) throw new Error("ABC Braille requires a PNG or JPEG image");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const uploadForm = new FormData();
      uploadForm.set(
        "file",
        new Blob([Uint8Array.from(bytes)], { type: mimeType }),
        // Do not forward the staff-supplied filename: it may itself contain pupil data.
        `braille-upload.${mimeType === "image/png" ? "png" : "jpg"}`,
      );

      const uploadResponse = await fetch(`${baseUrl}/`, {
        method: "POST",
        body: uploadForm,
        redirect: "follow",
        signal: controller.signal,
      });
      const uploadHtml = await readHtml(uploadResponse);
      const cookie = cookieHeader(uploadResponse);
      const scanPath = extractAction(
        uploadHtml,
        /<form[^>]+id=["']rotate_form["'][^>]+action=["']([^"']+)["']/i,
        "scan action",
      );

      const scanBody = new URLSearchParams({
        translatetable: languageTable,
        btnTranslate: "Translate Braille",
      });
      const scanResponse = await fetch(absoluteUrl(baseUrl, scanPath), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: scanBody,
        redirect: "follow",
        signal: controller.signal,
      });
      const scanHtml = await readHtml(scanResponse);
      const resultPath = extractAction(
        scanHtml,
        /window\.location\.replace\(\s*["']([^"']+)["']\s*\)/i,
        "result location",
      );

      const resultResponse = await fetch(absoluteUrl(baseUrl, resultPath), {
        headers: cookie ? { Cookie: cookie } : undefined,
        redirect: "follow",
        signal: controller.signal,
      });
      const resultHtml = await readHtml(resultResponse);
      const translatedLines = extractList(resultHtml, "Text translation");
      if (!translatedLines.length) throw new Error("ABC Braille returned no text translation");
      const brailleLines = extractList(resultHtml, "Braille Scanned");

      return {
        // Preserve ABC Braille's ordered line text word-for-word. Only HTML list markup is
        // converted to newline separators so the transcription pane matches its result.
        draftText: translatedLines.join("\n"),
        confidence: 0,
        flags: [specialistFlag],
        rawBraille: brailleLines.length ? brailleLines.join("\n") : null,
        rawCells: null,
        providerRequestId: null,
        meta: finishMeta(timer, {
          provider: PROVIDER,
          model: MODEL,
          engineVersion: "public-web-workflow",
          promptVersion: `abc-braille-${languageTable}`,
          mode: "real",
        }),
        requiresSpecialistReview: true,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return fallback(timer, [specialistFlag, processingFailedFlag(safeErrorLabel(error))]);
  }
}

function fallback(timer: RunTimer, flags: UncertaintyFlag[]): BrailleOcrResult {
  return {
    draftText: "",
    confidence: 0,
    flags,
    rawBraille: null,
    rawCells: null,
    providerRequestId: null,
    meta: finishMeta(timer, {
      provider: PROVIDER,
      model: MODEL,
      engineVersion: "public-web-workflow",
      promptVersion: "abc-braille-en-ueb-g2.ctb",
      mode: "real",
    }),
    requiresSpecialistReview: true,
  };
}
