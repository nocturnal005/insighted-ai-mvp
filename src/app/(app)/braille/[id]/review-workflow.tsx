"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  Sparkles, Loader2, CheckCircle2, AlertTriangle, FileText, Lock,
  XCircle, Archive, Ban, ShieldCheck, RefreshCw, CircleAlert, Pencil,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { TranscriptionBadge } from "@/components/ui/badge";
import { ExportMenu } from "@/components/export-menu";
import { AiMeta } from "@/components/ai-meta";
import { ExportGateHint } from "@/components/gate-hint";
import { SourceImage, type SourceUpload } from "@/components/source-image";
import { SubmissionWorkflow, type SubmissionStage } from "@/components/submission-workflow";
import { TaskTimeline } from "@/components/task-timeline";
import type {
  AuditEntry,
  BrailleHybridReview,
  BrailleTask,
  StandardRuleEvaluation,
  StandardsOverrideDecision,
  TranscriptionConfidenceEvidence,
  TranscriptionProvenance,
  TranscriptionReviewItem,
  TranscriptionReviewStatus,
} from "@/lib/types";
import {
  runTranscription, rerunBrailleTranscription, saveTranscription, verifyTranscription,
  createFeedback, saveFeedback, approveFeedback, rejectBrailleTask, archiveBrailleTask,
  reviewTranscriptionItem, recordStandardsOverride,
} from "../actions";

interface Perms {
  canEdit: boolean; canVerify: boolean; canFeedback: boolean;
  canApproveFeedback: boolean; canReject: boolean; canArchive: boolean; canExport: boolean;
}

interface SubmissionSummary {
  learner: string;
  subject: string;
  assignment: string;
  document: string | null;
  uploadedBy: string | null;
  uploadedAt: string | null;
  updated: string;
}

export function ReviewWorkflow({
  task,
  upload,
  timeline,
  summary,
  permissions,
  privateProvenance,
}: {
  task: BrailleTask;
  upload: SourceUpload | null;
  timeline: AuditEntry[];
  summary: SubmissionSummary;
  permissions: Perms;
  privateProvenance: boolean;
}) {
  const t = task.transcription;
  const verified = t?.status === "specialist_verified";
  const confidenceEvidence = t?.confidenceEvidence ?? null;
  const hybridReview = t?.review;
  const reviewItems = t?.reviewItems ?? [];
  const additionalReviewIssues = t?.additionalReviewIssues ?? [];
  const mockDraft = t?.aiMode === "mock";
  const fb = task.feedback;
  const fbApproved = fb?.status === "approved";
  const ended = task.status === "rejected" || task.status === "archived";
  const needsSpecialistTranscription = Boolean(
    t &&
      !verified &&
      t.aiMode === "real" &&
      (t.draftText.trim().length === 0 ||
        (t.aiFlags ?? []).some(
          (flag) =>
            flag.category === "low_image_quality" ||
            flag.category === "processing_failed" ||
            flag.category === "provider_unavailable" ||
            flag.category === "pdf_processing_pending" ||
            flag.category === "real_pupil_data_blocked",
        )),
  );

  // `null` means "not locally edited" — the field then reflects the latest server value.
  // A non-null value (including "") is the user's own edit, so a field can be cleared.
  const [text, setText] = useState<string | null>(null);
  const [specialistNotes, setSpecialistNotes] = useState(t?.specialistNotes ?? "");
  const [comments, setComments] = useState<string | null>(null);
  const [learner, setLearner] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [reviewedPassage, setReviewedPassage] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");
  const [standardsReason, setStandardsReason] = useState("");
  const [pending, start] = useTransition();
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Effective values: local edit if present (?? preserves an intentionally-cleared ""),
  // otherwise the latest server value — so freshly generated drafts appear without a reload.
  const transcriptValue = text ?? t?.editedText ?? "";
  const commentsValue = comments ?? fb?.teacherComments ?? "";
  const learnerValue = learner ?? fb?.learnerSummary ?? "";
  const feedbackApprovalBlocked = !commentsValue.trim() || !learnerValue.trim();
  const currentStage: SubmissionStage = !t ? 1 : !verified ? 2 : 3;
  const selectedReviewItem = reviewItems.find((item) => item.id === selectedReviewId) ?? null;
  const unresolvedRequiredCount = reviewItems.filter(
    (item) =>
      item.reviewStatus === "needs_rescan" ||
      (item.uncertaintyState === "review_required" && item.reviewStatus === "unreviewed"),
  ).length;

  function selectReviewItem(item: TranscriptionReviewItem) {
    setSelectedReviewId(item.id);
    setReviewedPassage(item.reviewedText);
    setReviewerNote(item.reviewerNote);
  }

  function reviewItem(nextStatus: Exclude<TranscriptionReviewStatus, "unreviewed">) {
    if (!selectedReviewItem) return;
    run(`review-${nextStatus}`, async () => {
      await reviewTranscriptionItem(
        task.id,
        selectedReviewItem.id,
        nextStatus,
        reviewedPassage,
        reviewerNote,
      );
      setText(null);
    });
  }

  function standardsOverride(ruleId: string, decision: StandardsOverrideDecision) {
    run(`standards-${ruleId}-${decision}`, async () => {
      await recordStandardsOverride(task.id, ruleId, decision, standardsReason);
      setStandardsReason("");
    });
  }

  function saveWholeTranscription() {
    run("save", async () => {
      await saveTranscription(task.id, transcriptValue);
      setText(null);
    });
  }

  function run(name: string, fn: () => Promise<void>) {
    setError(null);
    setAction(name);
    start(async () => {
      try {
        await fn();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The action could not be completed");
      } finally {
        setAction(null);
      }
    });
  }

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-critical-50 px-4 py-3 text-sm text-critical-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <SubmissionWorkflow
        current={currentStage}
        completed={fbApproved}
        links={["#upload-translate", "#verify-review", "#assess-feedback"]}
      />

      {task.status === "rejected" && (
        <div role="status" className="flex items-start gap-2.5 rounded-xl bg-critical-50 px-4 py-3 text-sm text-critical-700">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-medium">Rejected.</span> {task.rejectionReason}</span>
        </div>
      )}
      {task.status === "archived" && (
        <div role="status" className="flex items-center gap-2.5 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-600">
          <Archive className="h-4 w-4" /> This task has been archived.
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(210px,0.7fr)_minmax(0,1.8fr)] xl:grid-cols-[minmax(200px,0.65fr)_minmax(0,1.9fr)_minmax(260px,0.85fr)]">
        <aside id="upload-translate" aria-labelledby="submission-summary-heading" className="space-y-4 xl:sticky xl:top-20">
          <Card>
            <CardHeader>
              <CardTitle id="submission-summary-heading">Submission summary</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="space-y-4">
                <SummaryItem label="Learner" value={summary.learner} />
                <SummaryItem label="Subject" value={summary.subject} />
                <SummaryItem label="Assignment" value={summary.assignment} />
                <SummaryItem label="Document" value={summary.document ?? "No file available"} />
                {summary.uploadedBy && <SummaryItem label="Uploaded" value={`${summary.uploadedBy}${summary.uploadedAt ? ` · ${summary.uploadedAt}` : ""}`} />}
                <SummaryItem label="Last updated" value={summary.updated} />
              </dl>
            </CardBody>
          </Card>
          <SourceImage upload={upload} label="Original Braille file" />
        </aside>

        <section id="verify-review" className="min-w-0 space-y-5" aria-label="Translated submission content">
          {!t ? (
            <Card>
              <CardHeader><CardTitle>Translated content</CardTitle></CardHeader>
              <CardBody className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-600"><Sparkles className="h-6 w-6" /></span>
                <div>
                  <p className="font-medium text-zinc-900">Ready to translate</p>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-zinc-500">The uploaded material is ready. Use the action panel to produce the existing draft English transcription.</p>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Translated content</CardTitle>
                  <p className="mt-1 text-xs text-zinc-500">The learner&apos;s translated work is the primary review surface.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <ConfidenceEvidenceLabel evidence={confidenceEvidence} />
                  <TranscriptionBadge status={t.status} />
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                {!verified && needsSpecialistTranscription && (
                  <div className="flex items-start gap-2.5 rounded-xl bg-critical-50 px-3.5 py-3 text-sm text-critical-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>OCR did not produce a dependable starting point from this capture. Retake the image or replace the draft with a specialist transcription; do not verify the OCR text unchanged.</span>
                  </div>
                )}
                {!verified && (
                  <div className="flex items-start gap-2.5 rounded-xl bg-caution-50 px-3.5 py-3 text-sm text-caution-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>This draft transcription must be checked by a QTVI or Braille-literate specialist before teacher feedback or export.</span></div>
                )}
                {!verified && mockDraft && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-critical-200 bg-critical-50 px-3.5 py-3 text-sm text-critical-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span><span className="font-semibold">Demo placeholder only.</span> This text was not read from the uploaded image. Enable live image transcription and run transcription again before specialist verification.</span>
                  </div>
                )}

                <div>
                  <p id="transcript-label" className="mb-1.5 text-sm font-medium text-zinc-700">English transcription</p>
                  {!verified && reviewItems.length > 0 ? (
                    <ReviewableTranslation
                      text={transcriptValue}
                      items={reviewItems}
                      selectedId={selectedReviewId}
                      onSelect={selectReviewItem}
                    />
                  ) : (
                    <textarea id="transcript" aria-labelledby="transcript-label" value={transcriptValue} onChange={(e) => setText(e.target.value)} readOnly={verified || !permissions.canEdit} rows={12} placeholder={needsSpecialistTranscription ? "Enter the specialist transcription from the source image." : undefined} className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-4 text-base leading-7 text-zinc-900 read-only:bg-zinc-50 focus:border-accent-500" />
                  )}
                  {!verified && reviewItems.length === 0 && (
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                      No passage-level uncertainty evidence was supplied or could be mapped safely to this text. Whole-document specialist verification still applies.
                    </p>
                  )}
                </div>
                {!verified && reviewItems.length > 0 && permissions.canEdit && (
                  <details className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-medium text-zinc-700">Edit full transcription</summary>
                    <div className="mt-3 space-y-3">
                      <p className="text-xs leading-relaxed text-zinc-500">
                        Use this fallback to correct unflagged text. Marked passages must remain unchanged and should be edited through their contextual review controls.
                      </p>
                      <textarea
                        id="full-transcript"
                        aria-label="Full transcription editor"
                        value={transcriptValue}
                        onChange={(event) => setText(event.target.value)}
                        rows={12}
                        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-4 text-base leading-7 text-zinc-900 focus:border-accent-500"
                      />
                      <button type="button" onClick={saveWholeTranscription} disabled={pending} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                        {action === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save full transcription edits
                      </button>
                    </div>
                  </details>
                )}
                {!verified && permissions.canVerify && additionalReviewIssues.length > 0 && (
                  <details className="rounded-xl border border-critical-200 bg-critical-50/60 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-medium text-critical-700">
                      Additional review issues ({additionalReviewIssues.length})
                    </summary>
                    <div className="mt-3">
                      <p className="text-xs leading-relaxed text-critical-700">
                        These high-priority OCR issues could not be mapped to one unambiguous passage. No text range has been guessed; inspect the full source during specialist verification.
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-critical-700">
                        {additionalReviewIssues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}
                      </ul>
                    </div>
                  </details>
                )}
                {!verified && (
                  <div>
                    <label htmlFor="specialistNotes" className="mb-1.5 block text-sm font-medium text-zinc-700">Specialist transcription notes</label>
                    <textarea id="specialistNotes" value={specialistNotes} onChange={(e) => setSpecialistNotes(e.target.value)} rows={3} className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-800 focus:border-accent-500" placeholder="Record unclear Braille, contractions, formatting, or source-quality issues for the teacher." />
                  </div>
                )}
                {verified && (
                  <div role="status" className="flex items-center gap-2 rounded-xl bg-positive-50 px-3.5 py-3 text-sm text-positive-700"><Lock className="h-4 w-4" /> Verified and locked — staff-approved final transcription.</div>
                )}

                <details className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-zinc-700">Processing details</summary>
                  <div className="mt-4 space-y-4">
                    <AiMeta
                      mode={t.aiMode}
                      provider={t.aiProvider}
                      model={t.aiModel}
                      confidence={confidenceEvidence?.kind === "provider_score" ? confidenceEvidence.value : null}
                      promptVersion={t.promptVersion}
                      processingMs={t.processingMs}
                      flagCount={t.aiFlags?.length}
                      unavailable={(t.aiFlags ?? []).some((f) => f.category === "provider_unavailable" || f.category === "processing_failed" || f.category === "real_pupil_data_blocked")}
                      redactProviderIdentity={privateProvenance}
                    />
                    {confidenceEvidence && (
                      <div className="rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-zinc-600">
                        <span className="font-medium text-zinc-800">Confidence evidence:</span>{" "}
                        {confidenceEvidence.meaning}
                      </div>
                    )}
                    {hybridReview && <HybridReviewEvidence review={hybridReview} />}
                  </div>
                </details>
              </CardBody>
            </Card>
          )}

          <section id="assess-feedback" aria-labelledby="assessment-feedback-heading">
            <Card>
              <CardHeader>
                <CardTitle id="assessment-feedback-heading">Assessment & feedback</CardTitle>
                {fb && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${fbApproved ? "bg-positive-50 text-positive-700" : "bg-caution-50 text-caution-700"}`}>{fbApproved ? "Staff-approved" : "Draft · editable"}</span>}
              </CardHeader>
              <CardBody>
                {!verified ? (
                  <div className="flex min-h-28 items-center gap-3 rounded-xl bg-zinc-50 px-4 py-4 text-sm text-zinc-600">
                    <Lock className="h-4 w-4 shrink-0" /> Assessment and feedback unlock after specialist verification.
                  </div>
                ) : !fb ? (
                  <div className="flex min-h-28 items-center gap-3 rounded-xl bg-zinc-50 px-4 py-4 text-sm text-zinc-600">
                    <FileText className="h-4 w-4 shrink-0" /> The verified translation is ready for subject feedback. Use the action panel to create the draft.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2.5 rounded-xl bg-accent-50/60 px-3.5 py-3 text-sm text-accent-700"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>This feedback is based on the specialist-verified English transcription. It does not verify Braille accuracy.</span></div>
                    <p className="text-sm text-zinc-700">{fb.summary}</p>
                    <Findings title="Specialist transcription notes" items={[fb.specialistNotes].filter(Boolean)} />
                    <Findings title="Specialist review items" items={[...fb.findings.contractions, ...fb.findings.formatting, ...fb.findings.unclear]} />
                    <Findings title="Subject teacher feedback prompts" items={fb.findings.spelling} />
                    <div>
                      <label htmlFor="comments" className="mb-1.5 block text-sm font-medium text-zinc-700">Subject teacher feedback {!fbApproved && <span className="text-xs font-normal text-zinc-400">(edit before approving)</span>}</label>
                      <textarea id="comments" value={commentsValue} onChange={(e) => setComments(e.target.value)} readOnly={fbApproved} rows={4} className="w-full rounded-lg border border-zinc-200 px-3.5 py-3 text-sm leading-relaxed text-zinc-800 read-only:bg-zinc-50 focus:border-accent-500" />
                    </div>
                    <div>
                      <label htmlFor="learner" className="mb-1.5 block text-sm font-medium text-zinc-700">Learner-friendly summary</label>
                      <textarea id="learner" value={learnerValue} onChange={(e) => setLearner(e.target.value)} readOnly={fbApproved} rows={3} className="w-full rounded-lg border border-zinc-200 px-3.5 py-3 text-sm leading-relaxed text-zinc-800 read-only:bg-zinc-50 focus:border-accent-500" />
                    </div>
                    {fbApproved && <div role="status" className="flex items-center gap-2 rounded-xl bg-positive-50 px-3.5 py-3 text-sm text-positive-700"><Lock className="h-4 w-4" /> Approved — this is the staff-approved final feedback.</div>}
                  </div>
                )}
              </CardBody>
            </Card>
          </section>
        </section>

        <aside aria-labelledby="actions-review-heading" className="space-y-4 lg:col-span-2 xl:sticky xl:top-20 xl:col-span-1">
          <Card>
            <CardHeader><CardTitle id="actions-review-heading">Actions & review</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              {!ended && t && !verified && reviewItems.length > 0 && (
                <SelectedReviewContext
                  item={selectedReviewItem}
                  reviewedPassage={reviewedPassage}
                  reviewerNote={reviewerNote}
                  canReview={permissions.canVerify}
                  pending={pending}
                  action={action}
                  unresolvedRequiredCount={unresolvedRequiredCount}
                  provenance={t.provenance ?? null}
                  onPassageChange={setReviewedPassage}
                  onNoteChange={setReviewerNote}
                  onReview={reviewItem}
                />
              )}

              {!ended && t && !verified && (t.standardsEvaluations ?? []).length > 0 && (
                <StandardsDecisionSupport
                  evaluations={t.standardsEvaluations ?? []}
                  canReview={permissions.canVerify}
                  pending={pending}
                  action={action}
                  reason={standardsReason}
                  onReasonChange={setStandardsReason}
                  onOverride={standardsOverride}
                />
              )}

              {!ended && !t && (
                <>
                  <p className="text-sm leading-relaxed text-zinc-600">Create the English draft from the uploaded Braille material.</p>
                  <button onClick={() => run("transcribe", async () => { await runTranscription(task.id); setText(null); })} disabled={pending} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
                    {action === "transcribe" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {action === "transcribe" ? "Translating…" : "Run transcription"}
                  </button>
                </>
              )}

              {!ended && t && !verified && (
                <>
                  <ExportGateHint message="Feedback and export unlock after specialist verification" />
                  {permissions.canEdit && Boolean(upload) && (
                    <button onClick={() => run("rerun", async () => { await rerunBrailleTranscription(task.id); setText(null); })} disabled={pending} title="Re-run OCR on the uploaded image" className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                      {action === "rerun" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Re-run transcription
                    </button>
                  )}
                  {permissions.canEdit && reviewItems.length === 0 && (
                    <button onClick={saveWholeTranscription} disabled={pending} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{action === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{needsSpecialistTranscription ? "Save specialist transcription" : "Save edits"}</button>
                  )}
                  {permissions.canVerify ? (
                    <button onClick={() => run("verify", () => verifyTranscription(task.id, transcriptValue, specialistNotes))} disabled={pending || mockDraft || transcriptValue.trim().length === 0 || unresolvedRequiredCount > 0} title={mockDraft ? "Run live transcription before specialist verification" : unresolvedRequiredCount > 0 ? "Resolve every required-review passage before final verification" : undefined} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">{action === "verify" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Specialist verify</button>
                  ) : (<p className="text-xs leading-relaxed text-zinc-500">A QTVI, admin, or Braille-literate staff member must verify this.</p>)}
                </>
              )}

              {!ended && verified && !fb && (
                <>
                  <div role="status" className="flex items-start gap-2 rounded-xl bg-positive-50 px-3 py-2.5 text-sm text-positive-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Verification complete.</div>
                  {permissions.canFeedback ? (
                    <button onClick={() => run("feedback", async () => { await createFeedback(task.id); setComments(null); setLearner(null); })} disabled={pending} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{action === "feedback" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Generate feedback</button>
                  ) : (<p className="text-xs leading-relaxed text-zinc-500">A teacher or QTVI can generate the report.</p>)}
                  {permissions.canExport && <ExportMenu id={task.id} kind="transcription" label="Export transcription" />}
                </>
              )}

              {!ended && verified && fb && !fbApproved && (
                <>
                  <ExportGateHint message={feedbackApprovalBlocked ? "Approval locked: complete both feedback fields" : "Export locked until approval"} />
                  <button onClick={() => run("savefb", () => saveFeedback(task.id, commentsValue, learnerValue))} disabled={pending} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{action === "savefb" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save changes</button>
                  {permissions.canApproveFeedback ? (
                    <button onClick={() => run("approvefb", () => approveFeedback(task.id, commentsValue, learnerValue))} disabled={pending || feedbackApprovalBlocked} title={feedbackApprovalBlocked ? "Complete both feedback fields before approval" : undefined} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">{action === "approvefb" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Approve report</button>
                  ) : (<p className="text-xs leading-relaxed text-zinc-500">A teacher or QTVI must approve.</p>)}
                  {permissions.canExport && <ExportMenu id={task.id} kind="transcription" label="Export transcription" />}
                </>
              )}

              {verified && fbApproved && (
                <>
                  <div role="status" className="flex items-start gap-2 rounded-xl bg-positive-50 px-3 py-2.5 text-sm text-positive-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Review and feedback complete.</div>
                  {permissions.canExport && <ExportMenu id={task.id} kind="transcription" label="Export transcription" />}
                  {permissions.canExport && <ExportMenu id={task.id} kind="feedback" label="Export report" />}
                </>
              )}

              {ended && <p className="text-sm leading-relaxed text-zinc-600">This submission is closed. Its content and review history remain available.</p>}
            </CardBody>
          </Card>

          {!ended && (permissions.canReject || permissions.canArchive) && (
            <details className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-700">More actions</summary>
              <div className="mt-3 space-y-3">
                {permissions.canReject && t && !verified && !rejecting && (
                  <button onClick={() => setRejecting(true)} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-critical-200 px-3 text-[13px] text-critical-700 hover:bg-critical-50"><XCircle className="h-3.5 w-3.5" /> Reject submission</button>
                )}
                {permissions.canArchive && (
                  <button onClick={() => run("archive", () => archiveBrailleTask(task.id))} disabled={pending} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-[13px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">{action === "archive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />} Archive submission</button>
                )}
                {rejecting && (
                  <div className="space-y-3 border-t border-zinc-100 pt-3">
                    <label htmlFor="reason" className="text-sm font-medium text-zinc-700">Reason for rejection</label>
                    <textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="e.g. Image too blurry to transcribe — please re-upload." />
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setRejecting(false)} className="h-9 flex-1 rounded-lg border border-zinc-200 px-3 text-[13px] text-zinc-700 hover:bg-zinc-50">Cancel</button>
                      <button onClick={() => run("reject", () => rejectBrailleTask(task.id, reason))} disabled={pending} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-critical-600 px-3 text-[13px] font-medium text-white hover:bg-critical-700 disabled:opacity-50">{action === "reject" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirm</button>
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}

          <details className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-zinc-700">Review history ({timeline.length})</summary>
            <div className="mt-3"><TaskTimeline entries={timeline} /></div>
          </details>
        </aside>
      </div>
    </div>
  );
}

function ConfidenceEvidenceLabel({ evidence }: { evidence: TranscriptionConfidenceEvidence | null }) {
  if (!evidence || evidence.availability !== "available" || evidence.value === null) {
    return <span className="text-xs text-zinc-500">Confidence unavailable</span>;
  }
  const label = evidence.kind === "engine_agreement" ? "Engine agreement" : "Provider document confidence";
  return <span className="text-xs text-zinc-500">{label} {Math.round(evidence.value * 100)}%</span>;
}

function reviewItemLabel(item: TranscriptionReviewItem) {
  if (item.reviewStatus === "confirmed") return "Confirmed";
  if (item.reviewStatus === "corrected") return "Corrected";
  if (item.reviewStatus === "needs_rescan") return "Needs re-scan";
  return item.uncertaintyState === "review_required" ? "Review required" : "Review suggested";
}

function reviewItemIcon(item: TranscriptionReviewItem) {
  if (item.reviewStatus === "confirmed") return <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />;
  if (item.reviewStatus === "corrected") return <Pencil aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />;
  if (item.reviewStatus === "needs_rescan") return <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />;
  return item.uncertaintyState === "review_required"
    ? <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
    : <CircleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />;
}

function ReviewableTranslation({
  text,
  items,
  selectedId,
  onSelect,
}: {
  text: string;
  items: TranscriptionReviewItem[];
  selectedId: string | null;
  onSelect: (item: TranscriptionReviewItem) => void;
}) {
  const ordered = [...items].sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const item of ordered) {
    if (item.start < cursor || item.end > text.length || text.slice(item.start, item.end) !== item.reviewedText) continue;
    if (item.start > cursor) parts.push(<span key={`text-${cursor}`}>{text.slice(cursor, item.start)}</span>);
    const required = item.uncertaintyState === "review_required";
    const completed = item.reviewStatus === "confirmed" || item.reviewStatus === "corrected";
    parts.push(
      <button
        key={item.id}
        type="button"
        aria-pressed={selectedId === item.id}
        aria-label={`${reviewItemLabel(item)}: ${item.reviewedText}`}
        onClick={() => onSelect(item)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(item);
          }
        }}
        className={`mx-0.5 inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0.5 text-left font-medium underline decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 ${
          completed
            ? "border-positive-200 bg-positive-50 text-positive-800"
            : item.reviewStatus === "needs_rescan"
              ? "border-critical-300 bg-critical-50 text-critical-800"
              : required
                ? "border-critical-200 bg-critical-50 text-critical-800"
                : "border-caution-200 bg-caution-50 text-caution-800"
        } ${selectedId === item.id ? "ring-2 ring-accent-500 ring-offset-1" : ""}`}
      >
        {reviewItemIcon(item)}
        <span>{item.reviewedText}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide">{reviewItemLabel(item)}</span>
      </button>,
    );
    cursor = item.end;
  }
  if (cursor < text.length) parts.push(<span key={`text-${cursor}`}>{text.slice(cursor)}</span>);

  return (
    <div
      role="group"
      aria-labelledby="transcript-label"
      className="min-h-72 whitespace-pre-wrap rounded-xl border border-zinc-200 bg-white px-4 py-4 text-base leading-8 text-zinc-900"
    >
      {parts}
    </div>
  );
}

function SelectedReviewContext({
  item,
  reviewedPassage,
  reviewerNote,
  canReview,
  pending,
  action,
  unresolvedRequiredCount,
  provenance,
  onPassageChange,
  onNoteChange,
  onReview,
}: {
  item: TranscriptionReviewItem | null;
  reviewedPassage: string;
  reviewerNote: string;
  canReview: boolean;
  pending: boolean;
  action: string | null;
  unresolvedRequiredCount: number;
  provenance: TranscriptionProvenance | null;
  onPassageChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onReview: (status: Exclude<TranscriptionReviewStatus, "unreviewed">) => void;
}) {
  if (!item) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-sm text-zinc-600">
        <p className="font-medium text-zinc-800">Select a marked passage</p>
        <p className="mt-1 text-xs leading-relaxed">Use the highlighted controls in the translated content. {unresolvedRequiredCount} required-review item{unresolvedRequiredCount === 1 ? " remains" : "s remain"}.</p>
      </div>
    );
  }

  const source = item.evidenceSource === "ocr_provider_flag"
    ? "OCR provider uncertainty flag"
    : item.evidenceSource === "secondary_ai_review"
      ? "Secondary AI discrepancy review"
      : "General vision model uncertainty flag";
  const confirmBlocked =
    pending ||
    reviewedPassage !== item.reviewedText ||
    item.reviewedText !== item.machineText;

  return (
    <section aria-labelledby="selected-review-heading" className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5">
      <div>
        <p className="eyebrow">Selected review item</p>
        <h3 id="selected-review-heading" className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          {reviewItemIcon(item)} {reviewItemLabel(item)}
        </h3>
      </div>
      <dl className="space-y-2 text-xs">
        <div><dt className="font-medium text-zinc-500">Original machine output</dt><dd className="mt-0.5 rounded-md bg-white px-2.5 py-2 text-sm text-zinc-800">{item.machineText}</dd></div>
        <div><dt className="font-medium text-zinc-500">Evidence source</dt><dd className="mt-0.5 text-zinc-700">{source}</dd></div>
        <div><dt className="font-medium text-zinc-500">Why it was flagged</dt><dd className="mt-0.5 leading-relaxed text-zinc-700">{item.reason}</dd></div>
        <div><dt className="font-medium text-zinc-500">Passage confidence</dt><dd className="mt-0.5 text-zinc-700">Not supplied</dd></div>
        {item.alternativeText && <div><dt className="font-medium text-zinc-500">Underlying review suggestion</dt><dd className="mt-0.5 text-zinc-700">{item.alternativeText}</dd></div>}
      </dl>
      {canReview && (
        <details className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-zinc-700">View source evidence</summary>
          <SourceEvidence provenance={provenance} />
        </details>
      )}
      <div>
        <label htmlFor="reviewed-passage" className="text-xs font-medium text-zinc-600">Current / verified output</label>
        <textarea id="reviewed-passage" value={reviewedPassage} onChange={(event) => onPassageChange(event.target.value)} readOnly={!canReview} rows={3} className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 read-only:bg-zinc-100" />
        {canReview && reviewedPassage !== item.reviewedText && (
          <p role="status" className="mt-1 text-xs leading-relaxed text-caution-700">
            This passage has an unsaved edit. Save the correction or restore the stored text before confirming.
          </p>
        )}
        {canReview && reviewedPassage === item.reviewedText && item.reviewedText !== item.machineText && (
          <p role="status" className="mt-1 text-xs leading-relaxed text-zinc-500">
            This passage is a correction and remains labelled corrected. Restore and save the original machine text before confirming the machine interpretation.
          </p>
        )}
      </div>
      {canReview && (
        <>
          <div>
            <label htmlFor="reviewer-note" className="text-xs font-medium text-zinc-600">Reviewer note <span className="font-normal text-zinc-400">(optional)</span></label>
            <textarea id="reviewer-note" value={reviewerNote} onChange={(event) => onNoteChange(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800" />
          </div>
          <div className="grid gap-2">
            <button type="button" onClick={() => onReview("confirmed")} disabled={confirmBlocked} title={reviewedPassage !== item.reviewedText ? "Save or discard the pending passage edit before confirming" : item.reviewedText !== item.machineText ? "Restore and save the original machine text before confirming" : undefined} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{action === "review-confirmed" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Confirm machine interpretation</button>
            <button type="button" onClick={() => onReview("corrected")} disabled={pending || !reviewedPassage.trim()} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 disabled:opacity-50">{action === "review-corrected" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}Save corrected translation</button>
            <button type="button" onClick={() => onReview("needs_rescan")} disabled={pending} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-critical-200 bg-white px-3 text-xs font-medium text-critical-700 disabled:opacity-50">{action === "review-needs_rescan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Needs re-scan</button>
          </div>
        </>
      )}
      {!canReview && <p className="text-xs leading-relaxed text-zinc-500">Specialist actions are unavailable for your role.</p>}
    </section>
  );
}

function SourceEvidence({ provenance }: { provenance: TranscriptionProvenance | null }) {
  const page = provenance?.pages[0];
  if (!provenance || provenance.availability === "unavailable" || !page) {
    return (
      <p className="mt-3 text-xs leading-relaxed text-zinc-600">
        Source-level provenance is unavailable for this OCR path.
      </p>
    );
  }
  const visibleCells = page.cells.slice(0, 50);

  return (
    <div className="mt-3 space-y-3 text-xs text-zinc-600">
      <p className="rounded-md bg-caution-50 px-2.5 py-2 leading-relaxed text-caution-800">
        Raw Braille and detected cells are page-level evidence only. No exact mapping to this English passage is available, and no source-image highlight has been generated.
      </p>
      <dl className="grid gap-2">
        <div><dt className="font-medium text-zinc-500">Provenance source</dt><dd className="mt-0.5 text-zinc-700">{provenance.evidenceContract ?? "Provider-supplied raw Braille"}</dd></div>
        <div><dt className="font-medium text-zinc-500">Provider / model</dt><dd className="mt-0.5 text-zinc-700">{[provenance.provider, provenance.model].filter(Boolean).join(" / ") || "Live transcription provider"}</dd></div>
        <div><dt className="font-medium text-zinc-500">Mapping granularity</dt><dd className="mt-0.5 text-zinc-700">Unavailable: page evidence is not mapped to English offsets.</dd></div>
      </dl>
      {page.rawBraille && <EvidenceText label="Raw Braille (page-level)" value={page.rawBraille} />}
      {page.cells.length > 0 && (
        <details className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2">
          <summary className="cursor-pointer font-medium text-zinc-700">
            Detected page cells ({page.cells.length}; not mapped to this passage)
          </summary>
          <ul className="mt-2 max-h-56 space-y-2 overflow-auto">
            {visibleCells.map((cell) => (
              <li key={cell.braivantaCellId} className="rounded-md bg-white px-2.5 py-2 leading-relaxed">
                <span className="font-medium text-zinc-800">{cell.braivantaCellId}</span>
                <span className="ml-1 text-zinc-400">provider ID: {cell.providerCellId ?? "not supplied"}</span>
                <span className="mt-0.5 block">
                  Line {cell.lineNumber}, cell {cell.cellIndex} · {cell.normalizedSymbol} · dots {cell.dotPattern.join("-")} · provider cell score {Math.round(cell.confidence * 100)}%
                </span>
                <span className="block text-zinc-400">
                  Working-image box [{cell.boundingBox.left}, {cell.boundingBox.top}, {cell.boundingBox.right}, {cell.boundingBox.bottom}] px; not source-image aligned.
                </span>
              </li>
            ))}
          </ul>
          {page.cells.length > visibleCells.length && (
            <p className="mt-2 text-zinc-500">Showing the first {visibleCells.length} cells. The complete evidence remains in the persisted record.</p>
          )}
        </details>
      )}
    </div>
  );
}

const standardsOutcomeLabels: Record<StandardRuleEvaluation["automatedOutcome"], string> = {
  not_applicable: "Not applicable",
  consistent: "Consistent with encoded rule",
  possible_conflict: "Possible standards conflict",
  insufficient_evidence: "Insufficient evidence",
};

function StandardsDecisionSupport({
  evaluations,
  canReview,
  pending,
  action,
  reason,
  onReasonChange,
  onOverride,
}: {
  evaluations: StandardRuleEvaluation[];
  canReview: boolean;
  pending: boolean;
  action: string | null;
  reason: string;
  onReasonChange: (value: string) => void;
  onOverride: (ruleId: string, decision: StandardsOverrideDecision) => void;
}) {
  return (
    <details className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-zinc-700">Standards decision support</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs leading-relaxed text-zinc-600">
          Bounded rule evidence only. This is not compliance certification; the qualified specialist remains authoritative.
        </p>
        {evaluations.map((evaluation) => {
          const latestOverride = evaluation.overrides.at(-1);
          const applicability = evaluation.applicability;
          const displayOutcome =
            applicability?.basis === "configured_workflow" &&
            applicability.evidenceStatus === "supported"
              ? evaluation.automatedOutcome
              : "insufficient_evidence";
          const prefix = `standards-${evaluation.ruleId}`;
          return (
            <section key={evaluation.ruleId} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3" aria-label={`${evaluation.ruleId} evaluation`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-zinc-600">{evaluation.ruleId}</span>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-zinc-700">{standardsOutcomeLabels[displayOutcome]}</span>
              </div>
              <p className="mt-2 text-xs font-medium text-zinc-800">{evaluation.ruleTitle} · {evaluation.ruleVersion}</p>
              <dl className="mt-2 grid gap-1.5 rounded-md bg-white px-2.5 py-2 text-xs leading-relaxed">
                <div>
                  <dt className="font-medium text-zinc-500">Evaluation context</dt>
                  <dd className="text-zinc-700">
                    {applicability?.context ?? "Applicability basis was not recorded for this historical evaluation."}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-500">Provider standards proof</dt>
                  <dd className="text-zinc-700">
                    Not established. Braivanta decision-support configuration is not provider/run provenance.
                  </dd>
                </div>
              </dl>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">{evaluation.evidenceSummary}</p>
              <a href={evaluation.sourceReference} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-medium text-accent-700 hover:underline">Authoritative ICEB rule evidence</a>
              {latestOverride && (
                <p className="mt-2 rounded-md bg-white px-2.5 py-2 text-xs leading-relaxed text-zinc-600">
                  Latest specialist decision: {latestOverride.decision.replaceAll("_", " ")} · {latestOverride.reason}
                </p>
              )}
              {canReview && (
                <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3">
                  <label htmlFor={`standards-reason-${evaluation.ruleId}`} className="text-xs font-medium text-zinc-600">Specialist decision reason</label>
                  <textarea id={`standards-reason-${evaluation.ruleId}`} value={reason} onChange={(event) => onReasonChange(event.target.value)} rows={2} className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs" />
                  <div className="grid gap-2">
                    {displayOutcome === "consistent" && (
                      <button type="button" onClick={() => onOverride(evaluation.ruleId, "confirm_interpretation")} disabled={pending || !reason.trim()} className="h-8 rounded-md bg-zinc-900 px-2 text-xs font-medium text-white disabled:opacity-50">
                        {action === `${prefix}-confirm_interpretation` ? "Saving…" : "Confirm interpretation"}
                      </button>
                    )}
                    {displayOutcome === "possible_conflict" && (
                      <button type="button" onClick={() => onOverride(evaluation.ruleId, "override_warning")} disabled={pending || !reason.trim()} className="h-8 rounded-md bg-zinc-900 px-2 text-xs font-medium text-white disabled:opacity-50">
                        {action === `${prefix}-override_warning` ? "Saving…" : "Override warning"}
                      </button>
                    )}
                    <button type="button" onClick={() => onOverride(evaluation.ruleId, "mark_not_applicable")} disabled={pending || !reason.trim()} className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 disabled:opacity-50">
                      {action === `${prefix}-mark_not_applicable` ? "Saving…" : "Mark not applicable"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </details>
  );
}

function HybridReviewEvidence({ review }: { review: BrailleHybridReview }) {
  const agreement = review.primaryBackTranslationAgreement;
  const completed = review.status === "completed";
  const statusClasses = completed
    ? "bg-positive-50 text-positive-700"
    : "bg-caution-50 text-caution-700";

  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4" aria-labelledby="hybrid-review-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="hybrid-review-heading" className="text-sm font-semibold text-zinc-900">Hybrid review evidence</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Suggestions are review evidence only and are never applied automatically to the primary OCR draft.
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses}`}>
          {review.status === "completed" ? "Review completed" : `Review ${review.status}`}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-lg bg-white px-3 py-2 text-zinc-600">
          <span className="block text-zinc-400">Exact character agreement</span>
          <span className="mt-0.5 block font-semibold text-zinc-800">
            {agreement === null ? "Not available" : `${Math.round(agreement * 100)}%`}
          </span>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 text-zinc-600">
          <span className="block text-zinc-400">Review images</span>
          <span className="mt-0.5 block font-semibold text-zinc-800">{review.reviewImageCount}</span>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 text-zinc-600">
          <span className="block text-zinc-400">Discrepancies</span>
          <span className="mt-0.5 block font-semibold text-zinc-800">{review.discrepancies.length}</span>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-zinc-700">{review.summary}</p>

      {review.discrepancies.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {review.discrepancies.map((item, index) => (
            <li key={`${item.lineNumber ?? "unknown"}-${item.issueType}-${index}`} className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-zinc-800">{item.lineNumber ? `Line ${item.lineNumber}` : "Line not identified"}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">{item.issueType.replace(/_/g, " ")}</span>
                <span className={item.severity === "high" ? "text-critical-600" : item.severity === "medium" ? "text-caution-700" : "text-zinc-500"}>
                  {item.severity} review priority
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-700">
                <span className="font-medium">Observed:</span> {item.sourceText || "No exact excerpt supplied"}
                {item.suggestedText && <><span className="mx-1.5 text-zinc-300">→</span><span className="font-medium">Suggested:</span> {item.suggestedText}</>}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{item.reason}</p>
            </li>
          ))}
        </ul>
      ) : completed ? (
        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-zinc-500">
          No additional discrepancy was identified. This is not a verification of accuracy.
        </p>
      ) : null}

      {(review.rawBraille || review.backTranslationText) && (
        <details className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-zinc-600">Show engine comparison text</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {review.rawBraille && <EvidenceText label="Primary detected Braille" value={review.rawBraille} />}
            {review.backTranslationText && <EvidenceText label="Deterministic back-translation" value={review.backTranslationText} />}
          </div>
        </details>
      )}
    </section>
  );
}

function EvidenceText({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-zinc-50 p-2 text-xs text-zinc-700">{value}</pre>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-relaxed text-zinc-700">{value}</dd>
    </div>
  );
}

function Findings({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="mt-1.5 space-y-1">{items.map((it, i) => (<li key={i} className="flex gap-2 text-sm text-zinc-700"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-300" />{it}</li>))}</ul>
    </div>
  );
}
