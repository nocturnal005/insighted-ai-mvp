"use client";

import { useState, useTransition } from "react";
import { Loader2, Lock, ShieldAlert, CheckCircle2, EyeOff, XCircle, Ban, RefreshCw, ClipboardList } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportMenu } from "@/components/export-menu";
import { AiMeta } from "@/components/ai-meta";
import { ExportGateHint } from "@/components/gate-hint";
import { SourceImage, type SourceUpload } from "@/components/source-image";
import { ASSESSMENT_CONTEXT_OPTIONS, hasCompleteAssessmentContext, isAssessmentLikeContext } from "@/lib/assessment-context";
import type { HintTier, VisualDescriptionTask } from "@/lib/types";
import { updateVisual, updateVisualContext, rerunVisualDescription, approveVisual, rejectVisual } from "../actions";

const TIERS: { value: HintTier; label: string; blurb: string }[] = [
  { value: "tier_0", label: "Tier 0", blurb: "Neutral access only — no interpretation or hints" },
  { value: "tier_1", label: "Tier 1", blurb: "Orientation: structure, labels, layout" },
  { value: "tier_2", label: "Tier 2", blurb: "Teacher-controlled support (not formal assessment)" },
];

interface Perms { canApprove: boolean; canEdit: boolean; canReject: boolean; canExport: boolean }

export function VisualWorkflow({ task, upload, permissions }: { task: VisualDescriptionTask; upload: SourceUpload | null; permissions: Perms }) {
  const approved = task.status === "approved";
  const rejected = task.status === "rejected";
  // `null` = not locally edited (reflects server value); a non-null value is the user's edit.
  const [text, setText] = useState<string | null>(null);
  const [tier, setTier] = useState<HintTier>(task.hintTier);
  const [context, setContext] = useState<VisualDescriptionTask["context"]>(task.context);
  const [questionPrompt, setQuestionPrompt] = useState(task.questionPrompt ?? "");
  const [assessedSkill, setAssessedSkill] = useState(task.assessedSkill ?? "");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contextRisk = !hasCompleteAssessmentContext(context, questionPrompt, assessedSkill);
  const aiFlags = task.aiFlags ?? [];
  const aiUnavailable = aiFlags.some((f) =>
    ["provider_unavailable", "processing_failed", "real_pupil_data_blocked", "pdf_processing_pending"].includes(f.category),
  );
  const sourceUnavailable = !upload?.src;
  const effectiveText = text ?? task.editedDescription;
  const approvalBlocked = contextRisk || aiUnavailable || sourceUnavailable || !effectiveText.trim();

  function run(name: string, fn: () => Promise<void>) {
    setError(null);
    setAction(name);
    start(async () => {
      try {
        await fn();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The action could not be completed.");
      } finally {
        setAction(null);
      }
    });
  }

  /** Redact a flagged phrase by replacing it inline (staff control over answer leakage). */
  function redact(phrase: string) {
    setText((cur) => (cur ?? task.editedDescription).split(phrase).join("[redacted]"));
  }

  return (
    <div className="space-y-5">
      {rejected && (
        <div className="flex items-start gap-2.5 rounded-xl bg-critical-50 px-4 py-3 text-sm text-critical-700">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" /><span><span className="font-medium">Rejected.</span> {task.rejectionReason}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-critical-200 bg-critical-50 px-4 py-3 text-sm text-critical-700">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-medium">Action unavailable.</span> {error}</span>
        </div>
      )}

      {isAssessmentLikeContext(task.context) && !approved && !rejected && (
        <div className="flex items-start gap-2.5 rounded-xl border border-caution-200/60 bg-caution-50 px-4 py-3 text-sm text-caution-700">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-medium">Assessment mode.</span> This description cannot be exported until a teacher or QTVI approves it. Redact anything that could reveal an answer.</span>
        </div>
      )}

      {!upload && (
        <div className="flex items-start gap-2.5 rounded-xl border border-critical-200 bg-critical-50 px-4 py-3 text-sm text-critical-700">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-medium">Source visual missing.</span> Create a new task with the source attached before review or approval.</span>
        </div>
      )}
      <SourceImage upload={upload} label="Source visual" />

      {/* Assessment context — editable; regenerating re-evaluates answer-sensitivity */}
      <Card>
        <CardHeader>
          <CardTitle>Assessment context</CardTitle>
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400"><ClipboardList className="h-3.5 w-3.5" /> Drives answer-safety checks</span>
        </CardHeader>
        <CardBody>
          {contextRisk && (
            <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-critical-200/60 bg-critical-50 px-3.5 py-3 text-sm text-critical-700">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span><span className="font-medium">Assessment safety at risk.</span> This is assessment-like use but the question prompt and/or assessed skill are missing — answer-leak risk cannot be fully judged. Add both, then regenerate.</span>
            </div>
          )}
          {approved || !permissions.canEdit ? (
            <dl className="grid gap-2 text-sm">
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-zinc-400 sm:w-32">Context</dt><dd className="min-w-0 break-words text-zinc-700">{ASSESSMENT_CONTEXT_OPTIONS.find((c) => c.value === context)?.label ?? context}</dd></div>
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-zinc-400 sm:w-32">Question prompt</dt><dd className="min-w-0 break-words text-zinc-700">{questionPrompt || "—"}</dd></div>
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-zinc-400 sm:w-32">Assessed skill</dt><dd className="min-w-0 break-words text-zinc-700">{assessedSkill || "—"}</dd></div>
            </dl>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor="ctx" className="mb-1.5 block text-sm font-medium text-zinc-700">Context</label>
                <select id="ctx" value={context} onChange={(e) => setContext(e.target.value as VisualDescriptionTask["context"])} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                  {ASSESSMENT_CONTEXT_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="qp" className="mb-1.5 block text-sm font-medium text-zinc-700">Question prompt</label>
                <textarea id="qp" value={questionPrompt} onChange={(e) => setQuestionPrompt(e.target.value)} rows={2} placeholder="What is the learner being asked to do?" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label htmlFor="as" className="mb-1.5 block text-sm font-medium text-zinc-700">Assessed skill</label>
                <input id="as" value={assessedSkill} onChange={(e) => setAssessedSkill(e.target.value)} placeholder="e.g. reading a gradient from a graph" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                <p className="mt-1.5 text-xs text-zinc-400">State what the learner must do, for example identify, compare, interpret, calculate or explain.</p>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => run("ctx", async () => {
                    const fd = new FormData();
                    fd.set("context", context);
                    fd.set("questionPrompt", questionPrompt);
                    fd.set("assessedSkill", assessedSkill);
                    fd.set("hintTier", tier);
                    await updateVisualContext(task.id, fd);
                    setText(null);
                  })}
                  disabled={pending}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {action === "ctx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Save context &amp; regenerate
                </button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Answer-sensitive flags with redact action */}
      {task.answerSensitiveFlags.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Answer-sensitive areas</CardTitle><span className="inline-flex items-center gap-1.5 text-xs text-caution-700"><ShieldAlert className="h-3.5 w-3.5" /> Review before assessment use</span></CardHeader>
          <CardBody className="space-y-2">
            {task.answerSensitiveFlags.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-lg bg-caution-50 px-3 py-2 text-sm text-caution-700">
                <EyeOff className="h-4 w-4 shrink-0" />
                <span className="flex-1"><span className="font-medium">“{f.text}”</span> — {f.reason}</span>
                {!approved && permissions.canEdit && (
                  <button onClick={() => redact(f.text)} className="rounded-md border border-caution-300/60 bg-white px-2 py-0.5 text-xs font-medium text-caution-700 hover:bg-caution-50">Redact</button>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Hint tier */}
      <Card>
        <CardHeader><CardTitle>Hint tier</CardTitle></CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {TIERS.map((tr) => {
              const active = tier === tr.value;
              return (
                <button key={tr.value} type="button" disabled={approved || !permissions.canEdit} onClick={() => setTier(tr.value)} className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${active ? "border-accent-400 bg-accent-50/60 ring-1 ring-accent-200" : "border-zinc-200 hover:bg-zinc-50"}`}>
                  <p className="text-sm font-semibold text-zinc-900">{tr.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{tr.blurb}</p>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader><CardTitle>Neutral description</CardTitle>{!approved && <span className="text-xs text-zinc-400">Draft · editable</span>}</CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AiMeta
              mode={task.aiMode}
              provider={task.aiProvider}
              model={task.aiModel}
              confidence={task.aiMode === "mock" ? null : task.confidence}
              promptVersion={task.promptVersion}
              processingMs={task.processingMs}
              flagCount={aiFlags.length}
              unavailable={aiUnavailable}
            />
            {!approved && permissions.canEdit && Boolean(upload) && (
              <button
                onClick={() => run("rerun", async () => { await rerunVisualDescription(task.id); setText(null); })}
                disabled={pending}
                title="Re-run the description on the uploaded image"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                {action === "rerun" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Re-run AI/OCR
              </button>
            )}
          </div>
          {task.aiMode === "mock" && !aiUnavailable && (
            <div className="flex items-start gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-sm text-zinc-600">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span><span className="font-medium">Demo fixture.</span> This draft uses a predefined scenario matched to the upload name and task context. It demonstrates the review workflow; it is not live computer vision.</span>
            </div>
          )}
          {!approved && (
            <div className="flex items-start gap-2.5 rounded-xl bg-caution-50 px-3.5 py-3 text-sm text-caution-700"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>Check that the description gives access to the visual without revealing what the learner is being assessed on.</span></div>
          )}
          <textarea value={effectiveText} onChange={(e) => setText(e.target.value)} readOnly={approved || !permissions.canEdit} rows={9} className="w-full rounded-lg border border-zinc-200 px-3.5 py-3 text-sm leading-relaxed text-zinc-800 read-only:bg-zinc-50 focus:border-accent-500" />

          {!approved && permissions.canEdit && task.previousDescription && (
            <details className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3.5 py-2.5 text-sm">
              <summary className="cursor-pointer font-medium text-zinc-600">Previous version — before the last re-run</summary>
              <p className="mt-2 whitespace-pre-wrap text-zinc-600">{task.previousDescription}</p>
              <button type="button" onClick={() => setText(task.previousDescription ?? "")} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                <RefreshCw className="h-3.5 w-3.5" /> Restore this version
              </button>
            </details>
          )}

          {approved ? (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-positive-50 px-3.5 py-3 text-sm text-positive-700"><Lock className="h-4 w-4" /> Approved and locked — cleared for the selected use.</div>
              {permissions.canExport && <ExportMenu id={task.id} kind="visual" label="Export description" />}
            </>
          ) : !rejected && (
            <>
              {rejecting && (
                <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
                  <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                  <div className="flex flex-wrap justify-end gap-2">
                    <button onClick={() => setRejecting(false)} className="h-8 rounded-lg border border-zinc-200 px-3 text-[13px] text-zinc-700 hover:bg-zinc-50">Cancel</button>
                    <button onClick={() => run("reject", () => rejectVisual(task.id, reason))} disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-critical-600 px-3 text-[13px] font-medium text-white hover:bg-critical-700 disabled:opacity-50">{action === "reject" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Confirm</button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <ExportGateHint className="mr-auto" message={sourceUnavailable ? "Approval locked: source visual unavailable" : contextRisk ? "Approval locked: complete assessment context" : aiUnavailable ? "Approval locked: generate a valid draft" : "Export locked until approval"} />
                {permissions.canReject && !rejecting && (
                  <button onClick={() => setRejecting(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3.5 text-[13px] text-critical-600 hover:bg-critical-50"><XCircle className="h-3.5 w-3.5" /> Reject</button>
                )}
                {permissions.canEdit && (
                  <button onClick={() => run("save", () => updateVisual(task.id, text ?? task.editedDescription, tier))} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{action === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save changes</button>
                )}
                {permissions.canApprove ? (
                  <button onClick={() => run("approve", () => approveVisual(task.id, effectiveText, tier))} disabled={pending || approvalBlocked} title={approvalBlocked ? "Resolve the review warnings before approval" : undefined} className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">{action === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Approve for use</button>
                ) : (<span className="text-xs text-zinc-400">A teacher or QTVI must approve this.</span>)}
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
