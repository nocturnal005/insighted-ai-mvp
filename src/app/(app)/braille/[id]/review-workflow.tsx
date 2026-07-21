"use client";

import { useState, useTransition } from "react";
import {
  Sparkles, Loader2, CheckCircle2, AlertTriangle, FileText, Lock,
  XCircle, Archive, Ban, UploadCloud, ScanText, ShieldCheck, FileCheck2, RefreshCw,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { TranscriptionBadge } from "@/components/ui/badge";
import { ExportMenu } from "@/components/export-menu";
import { AiMeta } from "@/components/ai-meta";
import { ExportGateHint } from "@/components/gate-hint";
import { SourceImage, type SourceUpload } from "@/components/source-image";
import type { BrailleHybridReview, BrailleTask } from "@/lib/types";
import {
  runTranscription, rerunBrailleTranscription, saveTranscription, verifyTranscription,
  createFeedback, saveFeedback, approveFeedback, rejectBrailleTask, archiveBrailleTask,
} from "../actions";

interface Perms {
  canEdit: boolean; canVerify: boolean; canFeedback: boolean;
  canApproveFeedback: boolean; canReject: boolean; canArchive: boolean; canExport: boolean;
}

export function ReviewWorkflow({
  task,
  upload,
  permissions,
  privateProvenance,
}: {
  task: BrailleTask;
  upload: SourceUpload | null;
  permissions: Perms;
  privateProvenance: boolean;
}) {
  const t = task.transcription;
  const verified = t?.status === "specialist_verified";
  const confidenceNotSupplied =
    t?.confidenceBasis === "not_supplied" || (!t?.confidenceBasis && privateProvenance);
  const hybridReview = t?.review;
  const mockDraft = t?.aiMode === "mock";
  const fb = task.feedback;
  const fbApproved = fb?.status === "approved";
  const ended = task.status === "rejected" || task.status === "archived";
  const needsSpecialistTranscription = Boolean(
    t &&
      !verified &&
      t.aiMode === "real" &&
      (t.draftText.trim().length === 0 ||
        (!confidenceNotSupplied && t.confidence < 0.6) ||
        (t.aiFlags ?? []).some(
          (flag) =>
            (flag.severity === "high" && flag.category !== "requires_specialist_review") ||
            flag.category === "low_image_quality" ||
            flag.category === "processing_failed",
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
  const [pending, start] = useTransition();
  const [action, setAction] = useState<string | null>(null);

  // Effective values: local edit if present (?? preserves an intentionally-cleared ""),
  // otherwise the latest server value — so freshly generated drafts appear without a reload.
  const transcriptValue = text ?? t?.editedText ?? "";
  const commentsValue = comments ?? fb?.teacherComments ?? "";
  const learnerValue = learner ?? fb?.learnerSummary ?? "";

  function run(name: string, fn: () => Promise<void>) {
    setAction(name);
    start(async () => { await fn(); setAction(null); });
  }

  return (
    <div className="space-y-5">
      <WorkflowStages task={task} hasUpload={Boolean(upload)} />

      {task.status === "rejected" && (
        <div className="flex items-start gap-2.5 rounded-xl bg-critical-50 px-4 py-3 text-sm text-critical-700">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-medium">Rejected.</span> {task.rejectionReason}</span>
        </div>
      )}
      {task.status === "archived" && (
        <div className="flex items-center gap-2.5 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-600">
          <Archive className="h-4 w-4" /> This task has been archived.
        </div>
      )}

      {/* Status actions */}
      {!ended && (permissions.canReject || permissions.canArchive) && (
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {permissions.canReject && t && !verified && !rejecting && (
            <button onClick={() => setRejecting(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-[13px] text-critical-600 hover:bg-critical-50">
              <XCircle className="h-3.5 w-3.5" /> Reject
            </button>
          )}
          {permissions.canArchive && (
            <button onClick={() => run("archive", () => archiveBrailleTask(task.id))} disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-[13px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
              {action === "archive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />} Archive
            </button>
          )}
        </div>
      )}

      {rejecting && (
        <Card>
          <CardBody className="space-y-3">
            <label htmlFor="reason" className="text-sm font-medium text-zinc-700">Reason for rejection</label>
            <textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="e.g. Image too blurry to transcribe — please re-upload." />
            <div className="flex flex-wrap justify-end gap-2.5">
              <button onClick={() => setRejecting(false)} className="h-9 rounded-lg border border-zinc-200 px-3.5 text-[13px] text-zinc-700 hover:bg-zinc-50">Cancel</button>
              <button onClick={() => run("reject", () => rejectBrailleTask(task.id, reason))} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg bg-critical-600 px-3.5 text-[13px] font-medium text-white hover:bg-critical-700 disabled:opacity-50">
                {action === "reject" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirm rejection
              </button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Source image (from the tracked Upload record) */}
      <SourceImage upload={upload} label="Source image" />

      {/* Step 1 — transcribe */}
      {!t && !ended && (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-600"><Sparkles className="h-6 w-6" /></span>
            <div><p className="font-medium text-zinc-900">Ready to transcribe</p><p className="mt-0.5 text-sm text-zinc-500">Run the engine to produce a draft English transcription for review.</p></div>
            <button onClick={() => run("transcribe", async () => { await runTranscription(task.id); setText(null); })} disabled={pending} className="mt-1 inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
              {action === "transcribe" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {action === "transcribe" ? "Transcribing…" : "Run transcription"}
            </button>
          </CardBody>
        </Card>
      )}

      {/* Step 2/3 — review + verify */}
      {t && (
        <Card>
          <CardHeader>
            <CardTitle>Transcription</CardTitle>
            <div className="flex items-center gap-3"><span className="text-xs text-zinc-400">{confidenceNotSupplied ? "Confidence not supplied" : `${t.confidenceBasis === "consensus" ? "Consensus confidence" : "Confidence"} ${Math.round(t.confidence * 100)}%`}</span><TranscriptionBadge status={t.status} /></div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AiMeta
                mode={t.aiMode}
                provider={t.aiProvider}
                model={t.aiModel}
                confidence={confidenceNotSupplied || t.confidenceBasis === "consensus" ? null : t.confidence}
                promptVersion={t.promptVersion}
                processingMs={t.processingMs}
                flagCount={t.aiFlags?.length}
                unavailable={(t.aiFlags ?? []).some((f) => f.category === "provider_unavailable" || f.category === "processing_failed" || f.category === "real_pupil_data_blocked")}
                redactProviderIdentity={privateProvenance}
              />
              {!verified && permissions.canEdit && Boolean(upload) && (
                <div className="ml-auto flex flex-wrap gap-2">
                  <button
                    onClick={() => run("rerun", async () => { await rerunBrailleTranscription(task.id); setText(null); })}
                    disabled={pending}
                    title="Re-run OCR on the uploaded image"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {action === "rerun" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Re-run AI/OCR
                  </button>
                </div>
              )}
            </div>
            {!verified && needsSpecialistTranscription && (
              <div className="flex items-start gap-2.5 rounded-xl bg-critical-50 px-3.5 py-3 text-sm text-critical-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  OCR did not produce a dependable starting point from this capture.
                  Retake the image or replace the draft with a specialist transcription;
                  do not verify the OCR text unchanged.
                </span>
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
            {hybridReview && <HybridReviewEvidence review={hybridReview} />}
            <div>
              <label htmlFor="transcript" className="mb-1.5 block text-sm font-medium text-zinc-700">English transcription</label>
              <textarea id="transcript" value={transcriptValue} onChange={(e) => setText(e.target.value)} readOnly={verified || !permissions.canEdit} rows={7} placeholder={needsSpecialistTranscription ? "Enter the specialist transcription from the source image." : undefined} className="w-full rounded-lg border border-zinc-200 px-3.5 py-3 text-sm leading-relaxed text-zinc-800 read-only:bg-zinc-50 focus:border-accent-500" />
            </div>
            {!verified && (
              <div>
                <label htmlFor="specialistNotes" className="mb-1.5 block text-sm font-medium text-zinc-700">Specialist transcription notes</label>
                <textarea id="specialistNotes" value={specialistNotes} onChange={(e) => setSpecialistNotes(e.target.value)} rows={3} className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-800 focus:border-accent-500" placeholder="Record unclear Braille, contractions, formatting, or source-quality issues for the teacher." />
              </div>
            )}
            {verified ? (
              <>
                <div className="flex items-center gap-2 rounded-xl bg-positive-50 px-3.5 py-3 text-sm text-positive-700"><Lock className="h-4 w-4" /> Verified and locked — staff-approved final transcription.</div>
                {permissions.canExport && <ExportMenu id={task.id} kind="transcription" label="Export transcription" />}
              </>
            ) : !ended && (
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <ExportGateHint className="mr-auto" message="Teacher feedback & export unlock after specialist verification" />
                {permissions.canEdit && (
                  <button onClick={() => run("save", () => saveTranscription(task.id, transcriptValue))} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{action === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{needsSpecialistTranscription ? "Save specialist transcription" : "Save edits"}</button>
                )}
                {permissions.canVerify ? (
                  <button onClick={() => run("verify", () => verifyTranscription(task.id, transcriptValue, specialistNotes))} disabled={pending || transcriptValue.trim().length === 0} className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{action === "verify" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Specialist verify</button>
                ) : (<span className="text-xs text-zinc-400">A QTVI, admin, or Braille-literate staff member must verify this.</span>)}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Step 4 — feedback editor */}
      {verified && (
        <Card>
          <CardHeader>
            <CardTitle>Teacher feedback report</CardTitle>
            {fb && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${fbApproved ? "bg-positive-50 text-positive-700" : "bg-caution-50 text-caution-700"}`}>{fbApproved ? "Staff-approved" : "AI draft · editable"}</span>}
          </CardHeader>
          <CardBody>
            {!fb ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-50 text-accent-600"><FileText className="h-5 w-5" /></span>
                <p className="text-sm text-zinc-500">Generate subject feedback from the specialist-verified English transcription.</p>
                {permissions.canFeedback ? (
                  <button onClick={() => run("feedback", async () => { await createFeedback(task.id); setComments(null); setLearner(null); })} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{action === "feedback" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Generate feedback</button>
                ) : (<span className="text-xs text-zinc-400">A teacher or QTVI can generate the report.</span>)}
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
                  <textarea id="comments" value={commentsValue} onChange={(e) => setComments(e.target.value)} readOnly={fbApproved} rows={3} className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-800 read-only:bg-zinc-50 focus:border-accent-500" />
                </div>
                <div>
                  <label htmlFor="learner" className="mb-1.5 block text-sm font-medium text-zinc-700">Learner-friendly summary</label>
                  <textarea id="learner" value={learnerValue} onChange={(e) => setLearner(e.target.value)} readOnly={fbApproved} rows={2} className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-800 read-only:bg-zinc-50 focus:border-accent-500" />
                </div>

                {fbApproved ? (
                  <>
                    <div className="flex items-center gap-2 rounded-xl bg-positive-50 px-3.5 py-3 text-sm text-positive-700"><Lock className="h-4 w-4" /> Approved — this is the staff-approved final feedback.</div>
                    {permissions.canExport && <ExportMenu id={task.id} kind="feedback" label="Export report" />}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-zinc-100 pt-4">
                    <ExportGateHint className="mr-auto" message="Export locked until approval" />
                    <button onClick={() => run("savefb", () => saveFeedback(task.id, commentsValue, learnerValue))} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{action === "savefb" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save changes</button>
                    {permissions.canApproveFeedback ? (
                      <button onClick={() => run("approvefb", () => approveFeedback(task.id))} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{action === "approvefb" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Approve report</button>
                    ) : (<span className="text-xs text-zinc-400">A teacher or QTVI must approve.</span>)}
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
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
          <span className="block text-zinc-400">Primary / back-translation agreement</span>
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
                  {item.severity} · {Math.round(item.confidence * 100)}% finding confidence
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

function WorkflowStages({ task, hasUpload }: { task: BrailleTask; hasUpload: boolean }) {
  const hasDraft = Boolean(task.transcription);
  const specialistVerified = task.transcription?.status === "specialist_verified";
  const teacherFeedbackStarted = Boolean(task.feedback);
  const teacherApproved = task.feedback?.status === "approved";
  const exported = Boolean(task.exportedAt);

  const stages = [
    { label: "Upload", icon: UploadCloud, done: hasUpload || hasDraft || task.status !== "draft" },
    { label: "AI draft", icon: ScanText, done: hasDraft },
    { label: "Specialist verify", icon: ShieldCheck, done: specialistVerified },
    { label: "Teacher feedback", icon: FileText, done: teacherFeedbackStarted || teacherApproved },
    { label: "Export", icon: FileCheck2, done: exported },
  ];

  const currentIndex = stages.findIndex((stage) => !stage.done);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 shadow-subtle">
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const current = index === currentIndex;
          return (
            <li
              key={stage.label}
              className={`flex min-h-14 items-center gap-2 rounded-lg px-2.5 py-2 ${
                stage.done
                  ? "bg-positive-50 text-positive-700"
                  : current
                    ? "bg-caution-50 text-caution-700"
                    : "bg-zinc-50 text-zinc-400"
              }`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80">
                {stage.done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className="min-w-0 text-xs font-semibold">{stage.label}</span>
            </li>
          );
        })}
      </ol>
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
