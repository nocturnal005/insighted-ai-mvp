import type { TranscriptionProvenance } from "../types";

export interface RegisteredStandardRule {
  standardFamily: "UEB";
  ruleId: string;
  title: string;
  description: string;
  version: "Third Edition 2024";
  sourceReference: string;
  applicableContext: string;
  implementationScope: string;
  limitations: string[];
}

const UEB_NUMERIC_INDICATOR: RegisteredStandardRule = {
  standardFamily: "UEB",
  ruleId: "UEB-6.1.1",
  title: "Numeric indicators",
  description: "Recognised numeric indicators set numeric mode for the remainder of the symbols-sequence.",
  version: "Third Edition 2024",
  sourceReference: "https://iceb.org/Rules%20of%20Unified%20English%20Braille%202024.pdf#page=92",
  applicableContext: "A raw 6-dot UEB sequence containing a numeric prefix followed by a digit or decimal-sign root.",
  implementationScope:
    "Detects only the twelve numeric-indicator sequences explicitly listed in UEB section 6.1.",
  limitations: [
    "Does not assess the full numeric-mode sequence, termination, layout, grade 1 mode, or print correspondence.",
    "Absence of a recognised sequence is not treated as a conflict because the required print context is unavailable.",
  ],
};

const REGISTERED_RULES = new Map([[UEB_NUMERIC_INDICATOR.ruleId, UEB_NUMERIC_INDICATOR]]);

export function registeredStandardsRules(): RegisteredStandardRule[] {
  return [...REGISTERED_RULES.values()];
}

export function requireRegisteredRule(ruleId: string): RegisteredStandardRule {
  const rule = REGISTERED_RULES.get(ruleId);
  if (!rule) throw new Error(`Unregistered standards rule: ${ruleId}`);
  return rule;
}

export function rawBrailleEvidence(provenance?: TranscriptionProvenance | null): string[] {
  return (provenance?.pages ?? [])
    .map((page) => page.rawBraille)
    .filter((value): value is string => Boolean(value));
}
