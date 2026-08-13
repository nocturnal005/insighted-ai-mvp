import { z } from "zod";
import type { BrailleOcrResult } from "./ai/types";
import type {
  BrailleCellEvidence,
  BraillePageEvidence,
  TranscriptionProvenance,
} from "./types";

const EXTERNAL_PROVIDER = "external_braille_ocr";
const EXTERNAL_CONTRACT = "external_braille_ocr_contract_v1";

const rawCellSchema = z
  .object({
    line: z.number().int().min(1),
    cellIndex: z.number().int().min(1),
    dots: z.array(z.number().int().min(1).max(6)).min(1).max(6),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    confidence: z.number().min(0).max(1),
  })
  .strict()
  .refine((cell) => new Set(cell.dots).size === cell.dots.length, "dot positions must be unique")
  .refine(
    (cell) =>
      cell.bbox.every(Number.isFinite) &&
      cell.bbox[0] >= 0 &&
      cell.bbox[1] >= 0 &&
      cell.bbox[2] > cell.bbox[0] &&
      cell.bbox[3] > cell.bbox[1],
    "bounding box must contain finite provider working-image coordinates",
  );

function normalizedSymbol(dots: number[]): string {
  let mask = 0;
  for (const dot of dots) mask |= 1 << (dot - 1);
  return String.fromCodePoint(0x2800 + mask);
}

function externalCells(result: BrailleOcrResult, pageNumber: number | null): {
  cells: BrailleCellEvidence[];
  rejectedCount: number;
} {
  if (result.meta.provider !== EXTERNAL_PROVIDER || !Array.isArray(result.rawCells)) {
    return { cells: [], rejectedCount: 0 };
  }

  const cells: BrailleCellEvidence[] = [];
  let rejectedCount = 0;
  for (const candidate of result.rawCells) {
    const parsed = rawCellSchema.safeParse(candidate);
    if (!parsed.success) {
      rejectedCount += 1;
      continue;
    }
    const cell = parsed.data;
    cells.push({
      braivantaCellId: `braivanta-cell-p${pageNumber ?? "unknown"}-l${cell.line}-c${cell.cellIndex}`,
      providerCellId: null,
      pageNumber,
      lineNumber: cell.line,
      cellIndex: cell.cellIndex,
      dotPattern: [...cell.dots].sort((a, b) => a - b),
      normalizedSymbol: normalizedSymbol(cell.dots),
      confidence: cell.confidence,
      boundingBox: {
        left: cell.bbox[0],
        top: cell.bbox[1],
        right: cell.bbox[2],
        bottom: cell.bbox[3],
        unit: "pixel",
        coordinateSpace: "provider_working_image",
        sourceImageAligned: false,
      },
      evidenceSource: "external_braille_ocr_contract_v1",
    });
  }
  cells.sort((a, b) => a.lineNumber - b.lineNumber || a.cellIndex - b.cellIndex);
  return { cells, rejectedCount };
}

function evidencePage(result: BrailleOcrResult): BraillePageEvidence | null {
  const rawBraille = result.rawBraille?.trim() ? result.rawBraille : null;
  const pageNumber = result.pageResults?.length === 1
    ? result.pageResults[0].pageNumber
    : null;
  const parsed = externalCells(result, pageNumber);
  if (!rawBraille && parsed.cells.length === 0) return null;

  const limitations = [
    "No provider cell IDs are supplied.",
    "No page dimensions are supplied.",
    "No cell-to-English mapping or English offsets are supplied.",
    "Provider working-image boxes are not aligned to the displayed source image, so no source highlight is generated.",
  ];
  if (parsed.rejectedCount > 0) {
    limitations.push(`${parsed.rejectedCount} unrecognised cell record(s) were excluded rather than guessed.`);
  }

  return {
    pageId: `braivanta-page-${pageNumber ?? "unknown"}`,
    pageNumber,
    dimensions: null,
    rawBraille,
    cells: parsed.cells,
    mappings: [],
    mappingAvailability: "unavailable",
    sourceHighlightAvailability: "unavailable",
    limitations,
  };
}

/** Build only provenance justified by the current provider contract. */
export function buildTranscriptionProvenance(result: BrailleOcrResult): TranscriptionProvenance {
  const page = evidencePage(result);
  const isExternal = result.meta.provider === EXTERNAL_PROVIDER;
  return {
    version: "1",
    availability: page ? "partial" : "unavailable",
    provider: result.meta.provider,
    model: result.meta.model,
    engineVersion: result.meta.engineVersion,
    evidenceContract: isExternal ? EXTERNAL_CONTRACT : null,
    pages: page ? [page] : [],
    limitations: page
      ? [
          "Evidence is page-level because no current provider maps Braille cells to English passages.",
          "This provenance supports specialist review; it is not an accuracy or compliance claim.",
        ]
      : ["Source-level provenance is unavailable for this OCR path."],
  };
}

export interface SourceEvidenceView {
  availability: "partial" | "unavailable";
  rawBraille: string | null;
  cells: BrailleCellEvidence[];
  mappings: [];
  sourceHighlight: null;
  limitation: string;
}

/** Review-safe view. It deliberately cannot manufacture mappings or image highlights. */
export function sourceEvidenceForReview(
  provenance?: TranscriptionProvenance | null,
): SourceEvidenceView {
  const page = provenance?.pages[0];
  if (!provenance || provenance.availability === "unavailable" || !page) {
    return {
      availability: "unavailable",
      rawBraille: null,
      cells: [],
      mappings: [],
      sourceHighlight: null,
      limitation: "Source-level provenance is unavailable for this OCR path.",
    };
  }
  return {
    availability: "partial",
    rawBraille: page.rawBraille,
    cells: page.cells,
    mappings: [],
    sourceHighlight: null,
    limitation:
      "Raw Braille and detected cells are page-level evidence only; no exact mapping to this English passage is available.",
  };
}
