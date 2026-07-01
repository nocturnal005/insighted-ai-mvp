/**
 * Liblouis-ready Braille back-translation adapter.
 *
 * Back-translation converts detected Braille (Unicode dot patterns or cell arrays) INTO
 * print text. It is the step that runs AFTER a dot/cell-detection OCR stage — it is NOT an
 * image OCR engine and cannot read a photograph on its own. Liblouis is intentionally
 * optional: this build ships a stub that reports `provider_unavailable` so the app never
 * hard-depends on a native Liblouis binding or on Duxbury, and the build never breaks when
 * they are absent.
 */
import type { UncertaintyFlag } from "../types";
import { makeFlag, providerUnavailableFlag } from "../uncertainty";

export type BrailleLanguage = "en-ueb-g1" | "en-ueb-g2";

export interface BrailleBackTranslationInput {
  rawBraille?: string;
  rawCells?: unknown;
  language?: BrailleLanguage;
}

export interface BrailleBackTranslationResult {
  text: string;
  confidence: number;
  flags: UncertaintyFlag[];
  engine: string;
}

export interface BrailleTranslationProvider {
  backTranslate(input: BrailleBackTranslationInput): Promise<BrailleBackTranslationResult>;
}

/**
 * Stub provider. Returns `provider_unavailable` unless a real Liblouis binding is wired in
 * a future build. Swap this implementation (e.g. `liblouis` npm binding or a Liblouis CLI
 * child process) without changing any caller.
 */
export class LiblouisBackTranslationProvider implements BrailleTranslationProvider {
  readonly engine = "liblouis-stub";

  async backTranslate(input: BrailleBackTranslationInput): Promise<BrailleBackTranslationResult> {
    const hasInput = Boolean(input.rawBraille || input.rawCells);
    const flags: UncertaintyFlag[] = [providerUnavailableFlag("Liblouis back-translation")];
    if (!hasInput) {
      flags.push(
        makeFlag({
          text: "No Braille cell data",
          reason:
            "Back-translation needs detected Braille (Unicode dots or cell array) from an OCR stage; " +
            "it cannot read an image directly.",
          category: "processing_failed",
          severity: "medium",
        }),
      );
    }
    return { text: "", confidence: 0, flags, engine: this.engine };
  }
}

/** Factory so callers depend on the interface, not the concrete stub. */
export function getBrailleTranslationProvider(): BrailleTranslationProvider {
  return new LiblouisBackTranslationProvider();
}
