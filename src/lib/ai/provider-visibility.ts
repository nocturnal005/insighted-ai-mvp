import type { AuditEntry, BrailleTask } from "@/lib/types";

/**
 * Provider identifiers in this set are operational implementation details. They remain
 * stored server-side for provenance, debugging, and evaluation, but must not be sent to
 * or rendered for staff users.
 */
const PRIVATE_PROVIDER_IDENTITIES = new Set(["abc_braille_web", "abc_openai_review"]);

export function isPrivateProviderIdentity(provider?: string | null): boolean {
  return Boolean(provider && PRIVATE_PROVIDER_IDENTITIES.has(provider));
}

/**
 * Create the Braille task view model that may safely cross the Server Component ->
 * Client Component boundary. The durable task remains unchanged.
 */
export function redactPrivateBrailleProvenance(
  task: BrailleTask,
  options: { includeSourceEvidence?: boolean } = {},
): BrailleTask {
  const transcription = task.transcription;
  if (!transcription) return task;

  const includeSourceEvidence = options.includeSourceEvidence ?? true;
  const privateIdentity = isPrivateProviderIdentity(transcription.aiProvider);
  if (!privateIdentity && includeSourceEvidence) return task;

  return {
    ...task,
    transcription: {
      ...transcription,
      ...(privateIdentity
        ? {
            aiProvider: null,
            aiModel: null,
            promptVersion: null,
            aiRequestId: null,
            review: transcription.review ? { ...transcription.review, model: null } : transcription.review,
            provenance: transcription.provenance
              ? {
                  ...transcription.provenance,
                  provider: null,
                  model: null,
                  engineVersion: null,
                }
              : transcription.provenance,
          }
        : {}),
      ...(!includeSourceEvidence
        ? { provenance: null, standardsEvaluations: null }
        : {}),
    },
  };
}

/**
 * Audit entries are rendered inside a Client Component on the review page, so redact
 * private implementation identifiers before the entries cross that boundary too.
 */
export function redactPrivateAuditProvenance(entries: AuditEntry[]): AuditEntry[] {
  return entries.map((entry) =>
    isPrivateProviderIdentity(entry.provider)
      ? { ...entry, provider: null, model: null, promptVersion: null }
      : entry,
  );
}
