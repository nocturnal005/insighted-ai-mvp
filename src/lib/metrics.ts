/**
 * Accuracy metrics for transcription quality.
 *
 * CER (Character Error Rate) and WER (Word Error Rate) are the standard OCR/ASR
 * accuracy measures — edit distance between a prediction and a reference, normalised
 * by reference length. 0 = perfect, 1 = completely wrong.
 *
 * Used two ways:
 *  - Correction burden: distance between the AI draft and the staff-verified final
 *    (captured automatically from the verify workflow).
 *  - True accuracy: distance between an engine's prediction and a known-correct
 *    ground-truth transcription (the evaluation harness).
 */

/** Levenshtein edit distance between two token sequences. */
function levenshtein(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Character Error Rate (0..1). */
export function cer(prediction: string, reference: string): number {
  const ref = [...reference];
  if (ref.length === 0) return prediction.length ? 1 : 0;
  return Math.min(1, levenshtein([...prediction], ref) / ref.length);
}

/** Word Error Rate (0..1). */
export function wer(prediction: string, reference: string): number {
  const refWords = reference.trim().split(/\s+/).filter(Boolean);
  const predWords = prediction.trim().split(/\s+/).filter(Boolean);
  if (refWords.length === 0) return predWords.length ? 1 : 0;
  return Math.min(1, levenshtein(predWords, refWords) / refWords.length);
}

export interface PairScore {
  cer: number;
  wer: number;
  /** Character-level accuracy as a 0–100 percentage. */
  accuracy: number;
}

export function scorePair(prediction: string, reference: string): PairScore {
  const c = cer(prediction, reference);
  return { cer: c, wer: wer(prediction, reference), accuracy: Math.round((1 - c) * 100) };
}

/** Format a 0..1 rate as a percentage string. */
export function pct(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "—";
  return `${Math.round(rate * 1000) / 10}%`;
}
