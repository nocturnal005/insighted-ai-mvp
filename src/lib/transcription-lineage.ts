import { randomUUID } from "node:crypto";

/** Braivanta-owned identity for one OCR/transcription execution. Never a provider request id. */
export function createTranscriptionRunId(): string {
  return `trun_${randomUUID()}`;
}
