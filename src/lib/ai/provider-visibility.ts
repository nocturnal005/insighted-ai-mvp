import type { BrailleTask } from "@/lib/types";

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
export function redactPrivateBrailleProvenance(task: BrailleTask): BrailleTask {
  const transcription = task.transcription;
  if (!transcription || !isPrivateProviderIdentity(transcription.aiProvider)) return task;

  return {
    ...task,
    transcription: {
      ...transcription,
      aiProvider: null,
      aiModel: null,
      promptVersion: null,
      aiRequestId: null,
      review: transcription.review ? { ...transcription.review, model: null } : transcription.review,
    },
  };
}
