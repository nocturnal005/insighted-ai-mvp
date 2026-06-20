import { getBrailleTask, getStemTask, getVisualTask } from "@/lib/data";
import { pupilLabel, userName } from "@/lib/store";
import { VISUAL_TYPE_LABELS } from "@/lib/braille-engine";

export type ExportKind = "transcription" | "feedback" | "visual" | "stem";

export interface ExportBlock {
  heading: string;
  body: string;
}

export interface ExportDoc {
  title: string;
  subtitle: string;
  filename: string;
  status: string;
  blocks: ExportBlock[];
}

/**
 * Builds an export document for a given record, enforcing the approval gate:
 * nothing exports until it is verified/approved. Returns `{ error }` otherwise.
 */
export function buildExport(kind: ExportKind, id: string): { doc?: ExportDoc; error?: string } {
  if (kind === "transcription" || kind === "feedback") {
    const t = getBrailleTask(id);
    if (!t) return { error: "Task not found" };

    if (kind === "transcription") {
      if (t.transcription?.status !== "verified" || !t.transcription.finalText) {
        return { error: "Transcription must be verified before export" };
      }
      return {
        doc: {
          title: t.title,
          subtitle: `Braille transcription · ${t.subject ?? "No subject"}${pupilLabel(t.pupilId) ? ` · ${pupilLabel(t.pupilId)}` : ""}`,
          filename: slug(t.title) + "-transcription",
          status: "Verified (staff-approved final)",
          blocks: [
            { heading: "Verified English transcription", body: t.transcription.finalText },
            { heading: "Verified by", body: `${userName(t.transcription.verifiedBy)} · confidence ${Math.round(t.transcription.confidence * 100)}%` },
          ],
        },
      };
    }

    // feedback
    if (!t.feedback || t.feedback.status !== "approved") {
      return { error: "Feedback report must be approved before export" };
    }
    const f = t.feedback;
    return {
      doc: {
        title: t.title,
        subtitle: `Teacher feedback report · ${t.subject ?? "No subject"}${pupilLabel(t.pupilId) ? ` · ${pupilLabel(t.pupilId)}` : ""}`,
        filename: slug(t.title) + "-feedback",
        status: "Staff-approved final feedback",
        blocks: [
          { heading: "Original AI transcription", body: t.transcription?.draftText ?? "—" },
          { heading: "Corrected / verified transcription", body: t.transcription?.finalText ?? "—" },
          { heading: "Spelling issues (AI-suggested)", body: list(f.findings.spelling) },
          { heading: "Contraction / formatting issues (AI-suggested)", body: list([...f.findings.contractions, ...f.findings.formatting]) },
          { heading: "Unclear sections needing review", body: list(f.findings.unclear) },
          { heading: "Teacher comments (staff-approved)", body: f.teacherComments },
          { heading: "Learner-friendly summary", body: f.learnerSummary },
          { heading: "Approved by", body: userName(f.approvedBy) },
        ],
      },
    };
  }

  if (kind === "visual") {
    const v = getVisualTask(id);
    if (!v) return { error: "Task not found" };
    if (v.status !== "approved") return { error: "Description must be approved before export" };
    return {
      doc: {
        title: v.title,
        subtitle: `Assessment-safe visual description · ${v.context === "assessment" ? "Assessment use" : "Lesson use"} · ${v.subject ?? "No subject"}`,
        filename: slug(v.title) + "-description",
        status: `Approved · ${tierLabel(v.hintTier)}`,
        blocks: [
          { heading: "Neutral description (staff-approved)", body: v.editedDescription },
          { heading: "Answer-sensitive flags reviewed", body: list(v.answerSensitiveFlags.map((f) => `${f.text} — ${f.reason}`)) },
          { heading: "Approved by", body: userName(v.approvedBy) },
        ],
      },
    };
  }

  // stem
  const s = getStemTask(id);
  if (!s) return { error: "Task not found" };
  if (s.status !== "approved") return { error: "Description must be approved before export" };
  return {
    doc: {
      title: s.title,
      subtitle: `STEM description · ${VISUAL_TYPE_LABELS[s.visualType]} · ${s.subject ?? "No subject"}`,
      filename: slug(s.title) + "-stem",
      status: `Approved · ${styleLabel(s.style)}`,
      blocks: [
        { heading: "Structured description (staff-approved)", body: s.editedDescription },
        { heading: "Answer-sensitive flags reviewed", body: list(s.answerSensitiveFlags.map((f) => `${f.text} — ${f.reason}`)) },
        { heading: "Approved by", body: userName(s.approvedBy) },
      ],
    },
  };
}

export function docToPlainText(doc: ExportDoc): string {
  const lines = [
    "INSIGHTED AI",
    doc.title,
    doc.subtitle,
    `Status: ${doc.status}`,
    "=".repeat(60),
    "",
  ];
  for (const b of doc.blocks) {
    lines.push(b.heading.toUpperCase(), b.body, "");
  }
  lines.push("-".repeat(60), `Exported ${new Date().toLocaleString("en-GB")} · InsightEd AI`);
  return lines.join("\n");
}

function list(items: string[]): string {
  return items.length ? items.map((i) => `• ${i}`).join("\n") : "None.";
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);
}
function tierLabel(t: string): string {
  return { tier_0: "Tier 0 (neutral)", tier_1: "Tier 1 (orientation)", tier_2: "Tier 2 (supported)" }[t] ?? t;
}
function styleLabel(s: string): string {
  return { descriptive: "Descriptive", instructional: "Instructional", assessment_safe: "Assessment-safe" }[s] ?? s;
}
