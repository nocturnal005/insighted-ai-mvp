import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileCheck2, ShieldCheck } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { getBrailleTasks, getPupil } from "@/lib/data";
import { hydrateBrailleTasks } from "@/lib/durable-braille";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import {
  buildLongitudinalEvidenceHistory,
  type CorrectionCategoryCount,
  type EvidenceCount,
  type EvidenceRecordState,
} from "@/lib/stage5-evidence";

function stateLabel(state: EvidenceRecordState | "partial"): string {
  return state.replace("_", " ");
}

function countLabel(entry: EvidenceCount): string {
  return entry.value === null ? stateLabel(entry.state) : String(entry.value);
}

function categoryLabel(categories: CorrectionCategoryCount[]): string {
  return categories.length
    ? categories.map(({ category, count }) => `${count} ${category.replaceAll("_", " ")}`).join(" · ")
    : "not recorded";
}

export default async function LearnerEvidencePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireUser();
  if (!can(user.role, "pupil.evidence.read")) redirect("/pupils");

  await hydrateBrailleTasks();
  const pupil = getPupil(id);
  if (!pupil) notFound();
  const history = buildLongitudinalEvidenceHistory(getBrailleTasks(), pupil.id);

  return (
    <div className="max-w-3xl">
      <Link href={`/pupils/${pupil.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Back to learner record
      </Link>
      <div className="mb-7">
        <h1 className="text-[24px] font-semibold tracking-tight text-zinc-900">Verified evidence history</h1>
        <p className="mt-1 text-sm text-zinc-500">{pupil.referenceCode} · chronological, verified evidence only</p>
      </div>

      <Card className="mb-5 border-accent-100 bg-accent-50/40">
        <CardBody className="flex gap-3 text-sm text-zinc-700">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-700" />
          <p>This is a record of persisted workflow and human-authored evidence. It does not calculate learner proficiency, progress, a predicted grade, or reviewer time savings.</p>
        </CardBody>
      </Card>

      {history.length === 0 ? (
        <Card><CardBody className="py-10 text-center text-sm text-zinc-500">No specialist-verified Braille submissions are recorded for this learner.</CardBody></Card>
      ) : (
        <div className="space-y-4">
          {history.map((entry) => (
            <Card key={entry.taskId}>
              <CardHeader>
                <div className="flex min-w-0 items-center gap-2"><FileCheck2 className="h-4 w-4 text-accent-700" /><CardTitle>{entry.title}</CardTitle></div>
                <span className="text-xs text-zinc-400">{entry.subject ?? "Subject not recorded"} · {entry.verifiedAt ? `verified ${new Date(entry.verifiedAt).toLocaleDateString("en-GB")}` : "verification time not recorded"}</span>
              </CardHeader>
              <CardBody className="space-y-4 text-sm text-zinc-700">
                <EvidenceRows rows={[
                  ["Transcription run", entry.transcriptionRun.id ?? stateLabel(entry.transcriptionRun.state)],
                  ["Specialist verification", entry.specialistVerification.verifiedAt ? `identity recorded · ${new Date(entry.specialistVerification.verifiedAt).toLocaleDateString("en-GB")}` : stateLabel(entry.specialistVerification.state)],
                  ["Flagged passages", countLabel(entry.reviewBurden.flagged)],
                  ["Reviewed / corrected / confirmed / re-scan", `${countLabel(entry.reviewBurden.reviewed)} / ${countLabel(entry.reviewBurden.corrected)} / ${countLabel(entry.reviewBurden.confirmed)} / ${countLabel(entry.reviewBurden.needsRescan)}`],
                  ["Unresolved review items", countLabel(entry.reviewBurden.unresolved)],
                  ["Observed transcription runs", countLabel(entry.reviewBurden.observedTranscriptionRuns)],
                  ["Current-run correction evidence", countLabel(entry.corrections.currentRun)],
                  ["Previous-run correction evidence", countLabel(entry.corrections.previousRuns)],
                  ["Legacy unscoped correction evidence", countLabel(entry.corrections.legacyUnscoped)],
                  ["Current-run correction categories", categoryLabel(entry.corrections.currentRunCategories)],
                  ["Previous-run correction categories", categoryLabel(entry.corrections.previousRunCategories)],
                  ["Standards decision-support records", countLabel(entry.standardsDecisionSupport)],
                  ["Provenance availability", stateLabel(entry.provenance)],
                ]} />
                <div className="border-t border-zinc-100 pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Teacher-authored assessment</p>
                  {entry.teacherAssessment.value ? (
                    <div className="mt-2 space-y-2 text-sm">
                      <p><span className="font-medium">Strengths:</span> {entry.teacherAssessment.value.strengths || "not recorded"}</p>
                      <p><span className="font-medium">Misconceptions:</span> {entry.teacherAssessment.value.misconceptions || "not recorded"}</p>
                      <p><span className="font-medium">Completeness:</span> {entry.teacherAssessment.value.completeness.replaceAll("_", " ")}</p>
                      <p><span className="font-medium">Reasoning:</span> {entry.teacherAssessment.value.reasoning || "not recorded"}</p>
                    </div>
                  ) : <p className="mt-2 text-zinc-500">Not recorded.</p>}
                </div>
                <p className="text-xs text-zinc-500">Correction categories are recorded specialist evidence, not conclusions about the learner. Source evidence may be unavailable or page-level only; this record does not claim correction-specific source mapping.</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceRows({ rows }: { rows: Array<[string, string]> }) {
  return <dl className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-0.5 break-words font-medium text-zinc-800">{value}</dd></div>)}</dl>;
}
