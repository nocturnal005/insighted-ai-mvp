/**
 * Confidence scoring helpers.
 *
 * Providers report a raw confidence in [0,1]; this module keeps it well-formed and lets
 * high-severity uncertainty flags pull the effective confidence down, so the number the
 * UI shows can never disagree with a "provider unavailable / processing failed" state.
 */
import type { UncertaintyFlag } from "./types";

/** Clamp any number into [0,1]; non-finite input becomes 0. */
export function clampConfidence(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Derive an effective confidence from a base score and the flags raised. Any high-
 * severity flag caps confidence low; mediums apply a mild penalty. This guarantees a
 * failed/unavailable run reads as low-confidence regardless of what the provider claimed.
 */
export function effectiveConfidence(base: number, flags: UncertaintyFlag[]): number {
  let c = clampConfidence(base);
  const highs = flags.filter((f) => f.severity === "high").length;
  const mediums = flags.filter((f) => f.severity === "medium").length;
  if (highs > 0) c = Math.min(c, 0.35);
  c -= mediums * 0.05;
  return clampConfidence(c);
}

/** Round to a percentage integer for display. */
export function toPercent(confidence: number): number {
  return Math.round(clampConfidence(confidence) * 100);
}
