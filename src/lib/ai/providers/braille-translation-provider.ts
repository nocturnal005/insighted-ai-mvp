/**
 * Liblouis-ready Braille back-translation adapter.
 *
 * Back-translation converts detected Braille (Unicode dot patterns or cell arrays) INTO
 * print text. It is the step that runs AFTER a dot/cell-detection OCR stage — it is NOT an
 * image OCR engine and cannot read a photograph on its own.
 *
 * Liblouis is intentionally OPTIONAL. By default (`LIBLOUIS_ENABLED=false`) this ships a
 * stub that reports `provider_unavailable`, so the app never hard-depends on a native
 * Liblouis binding or on Duxbury and the build never breaks when they are absent. When
 * `LIBLOUIS_ENABLED=true` and `LIBLOUIS_COMMAND` points at a `lou_translate`-style CLI, it
 * shells out (with a timeout) to back-translate. Any failure degrades gracefully — it never
 * crashes the app.
 */
import type { UncertaintyFlag } from "../types";
import { getLiblouisConfig } from "../config";
import { makeFlag, processingFailedFlag, providerUnavailableFlag } from "../uncertainty";

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
  /** Whether a real Liblouis CLI actually ran (vs. the unavailable stub path). */
  available: boolean;
  engine: string;
}

export interface BrailleTranslationProvider {
  backTranslate(input: BrailleBackTranslationInput): Promise<BrailleBackTranslationResult>;
}

/**
 * Run the configured Liblouis CLI (e.g. `lou_translate --backward <table>`), feeding the
 * Braille on stdin. Resolves to null on any failure so the caller degrades gracefully.
 */
async function runLiblouisCli(command: string, table: string, braille: string, timeoutMs: number): Promise<string | null> {
  let spawn: typeof import("node:child_process").spawn;
  try {
    ({ spawn } = await import("node:child_process"));
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let child: import("node:child_process").ChildProcessWithoutNullStreams;
    try {
      child = spawn(command, ["--backward", table], { stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      done(null);
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      done(null);
    }, timeoutMs);

    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
      if (out.length > 1_000_000) child.kill("SIGKILL"); // response-size guard
    });
    child.on("error", () => {
      clearTimeout(timer);
      done(null);
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      done(code === 0 ? out : null);
    });

    try {
      child.stdin.write(braille);
      child.stdin.end();
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}

/**
 * Config-driven provider. Uses the Liblouis CLI when enabled and configured; otherwise
 * reports `provider_unavailable`. Swapping in a native `liblouis` npm binding is a
 * like-for-like change behind this same interface.
 */
export class LiblouisBackTranslationProvider implements BrailleTranslationProvider {
  readonly engine = "liblouis";

  async backTranslate(input: BrailleBackTranslationInput): Promise<BrailleBackTranslationResult> {
    const config = getLiblouisConfig();
    const hasInput = Boolean(input.rawBraille || input.rawCells);

    if (!config.enabled || !config.command) {
      const flags: UncertaintyFlag[] = [providerUnavailableFlag("Liblouis back-translation")];
      if (!hasInput) flags.push(noCellDataFlag());
      return { text: "", confidence: 0, flags, available: false, engine: "liblouis-stub" };
    }

    if (!input.rawBraille) {
      return { text: "", confidence: 0, flags: [noCellDataFlag()], available: true, engine: this.engine };
    }

    const table = config.table;
    const out = await runLiblouisCli(config.command, table, input.rawBraille, config.timeoutMs);
    if (out === null) {
      return {
        text: "",
        confidence: 0,
        flags: [processingFailedFlag("Liblouis CLI unavailable or timed out")],
        available: true,
        engine: this.engine,
      };
    }
    return { text: out.trim(), confidence: 0.5, flags: [], available: true, engine: this.engine };
  }
}

function noCellDataFlag(): UncertaintyFlag {
  return makeFlag({
    text: "No Braille cell data",
    reason:
      "Back-translation needs detected Braille (Unicode dots or cell array) from an OCR stage; " +
      "it cannot read an image directly.",
    category: "processing_failed",
    severity: "medium",
  });
}

/** Factory so callers depend on the interface, not the concrete implementation. */
export function getBrailleTranslationProvider(): BrailleTranslationProvider {
  return new LiblouisBackTranslationProvider();
}
