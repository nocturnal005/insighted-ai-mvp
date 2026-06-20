"use client";

import { useState, useTransition } from "react";
import {
  Sparkles, Loader2, CheckCircle2, AlertTriangle, FileText, Lock,
  XCircle, Archive, Ban,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { TranscriptionBadge } from "@/components/ui/badge";
import { ExportMenu } from "@/components/export-menu";
import { SourceImage, type SourceUpload } from "@/components/source-image";
import type { BrailleTask } from "@/lib/types";
import {
  runTranscription, saveTranscription, verifyTranscription,
  createFeedback, saveFeedback, approveFeedback, rejectBrailleTask, archiveBrailleTask,
} from "../actions";

interface Perms {
  canEdit: boolean; canVerify: boolean; canFeedback: boolean;
  canApproveFeedback: boolean; canReject: boolean; canArchive: boolean; canExport: boolean;
}

export function ReviewWorkflow({ task, upload, permissions }: { task: BrailleTask; upload: SourceUpload | null; permissions: Perms }) {
  const t = task.transcription;
  const verified = t?.status === "verified";
  const fb = task.feedback;
  const fbApproved = fb?.status === "approved";
  const ended = task.status === "rejected" || task.status === "archived";

  const [text, setText] = useState(t?.editedText ?? "");
  const [comments, setComments] = useState(fb?.teacherComments ?? "");
  const [learner, setLearner] = useState(fb?.learnerSummary ?? "");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [action, setAction] = useState<string | null>(null);

  function run(name: string, fn: () => Promise<void>) {
    setAction(name);
    start(async () => { await fn(); setAction(null); });
  }

  return (
    <div className="space-y-5">
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
            <div className="flex justify-end gap-2.5">
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
            <button onClick={() => run("transcribe", () => runTranscription(task.id))} disabled={pending} className="mt-1 inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
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
            <div className="flex items-center gap-3"><span className="text-xs text-zinc-400">Confidence {Math.round(t.confidence * 100)}%</span><TranscriptionBadge status={t.status} /></div>
          </CardHeader>
          <CardBody className="space-y-4">
            {!verified && (
              <div className="flex items-start gap-2.5 rounded-xl bg-caution-50 px-3.5 py-3 text-sm text-caution-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>This is an unverified AI draft. Review the flagged areas and correct any errors before verifying.</span></div>
            )}
            {!verified && t.lowConfidenceRegions.length > 0 && (
              <div className="flex flex-wrap gap-2">{t.lowConfidenceRegions.map((r, i) => (<span key={i} title={r.reason} className="inline-flex items-center gap-1.5 rounded-lg border border-caution-200/60 bg-caution-50 px-2.5 py-1 text-xs text-caution-700"><span className="font-medium">“{r.text}”</span><span className="text-caution-600/70">{r.reason}</span></span>))}</div>
            )}
            <div>
              <label htmlFor="transcript" className="mb-1.5 block text-sm font-medium text-zinc-700">English transcription</label>
              <textarea id="transcript" value={text} onChange={(e) => setText(e.target.value)} readOnly={verified || !permissions.canEdit} rows={7} className="w-full rounded-lg border border-zinc-200 px-3.5 py-3 text-sm leading-relaxed text-zinc-800 read-only:bg-zinc-50 focus:border-accent-500" />
            </div>
            {verified ? (
              <>
                <div className="flex items-center gap-2 rounded-xl bg-positive-50 px-3.5 py-3 text-sm text-positive-700"><Lock className="h-4 w-4" /> Verified and locked — staff-approved final transcription.</div>
                {permissions.canExport && <ExportMenu id={task.id} kind="transcription" label="Export transcription" />}
              </>
            ) : !ended && (
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                {permissions.canEdit && (
                  <button onClick={() => run("save", () => saveTranscription(task.id, text))} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{action === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save edits</button>
                )}
                {permissions.canVerify ? (
                  <button onClick={() => run("verify", () => verifyTranscription(task.id, text))} disabled={pending || text.trim().length === 0} className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{action === "verify" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Mark as verified</button>
                ) : (<span className="text-xs text-zinc-400">A teacher or QTVI must verify this.</span>)}
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
                <p className="text-sm text-zinc-500">Generate a draft feedback report from the verified transcription.</p>
                {permissions.canFeedback ? (
                  <button onClick={() => run("feedback", () => createFeedback(task.id))} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{action === "feedback" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Generate feedback</button>
                ) : (<span className="text-xs text-zinc-400">A teacher or QTVI can generate the report.</span>)}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-zinc-700">{fb.summary}</p>
                <Findings title="Spelling (AI-suggested)" items={fb.findings.spelling} />
                <Findings title="Contractions (AI-suggested)" items={fb.findings.contractions} />
                <Findings title="Formatting (AI-suggested)" items={fb.findings.formatting} />
                <Findings title="Needs review" items={fb.findings.unclear} />

                <div>
                  <label htmlFor="comments" className="mb-1.5 block text-sm font-medium text-zinc-700">Teacher comments {!fbApproved && <span className="text-xs font-normal text-zinc-400">(edit before approving)</span>}</label>
                  <textarea id="comments" value={comments} onChange={(e) => setComments(e.target.value)} readOnly={fbApproved} rows={3} className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-800 read-only:bg-zinc-50 focus:border-accent-500" />
                </div>
                <div>
                  <label htmlFor="learner" className="mb-1.5 block text-sm font-medium text-zinc-700">Learner-friendly summary</label>
                  <textarea id="learner" value={learner} onChange={(e) => setLearner(e.target.value)} readOnly={fbApproved} rows={2} className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-800 read-only:bg-zinc-50 focus:border-accent-500" />
                </div>

                {fbApproved ? (
                  <>
                    <div className="flex items-center gap-2 rounded-xl bg-positive-50 px-3.5 py-3 text-sm text-positive-700"><Lock className="h-4 w-4" /> Approved — this is the staff-approved final feedback.</div>
                    {permissions.canExport && <ExportMenu id={task.id} kind="feedback" label="Export report" />}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-zinc-100 pt-4">
                    <button onClick={() => run("savefb", () => saveFeedback(task.id, comments, learner))} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{action === "savefb" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save changes</button>
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

function Findings({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="mt-1.5 space-y-1">{items.map((it, i) => (<li key={i} className="flex gap-2 text-sm text-zinc-700"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-300" />{it}</li>))}</ul>
    </div>
  );
}
