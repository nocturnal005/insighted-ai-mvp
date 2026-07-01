"use client";

import { useState, useTransition } from "react";
import { Loader2, Lock, ShieldAlert, CheckCircle2, EyeOff, XCircle, Ban } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportMenu } from "@/components/export-menu";
import { AiMeta } from "@/components/ai-meta";
import { SourceImage, type SourceUpload } from "@/components/source-image";
import type { HintTier, VisualDescriptionTask } from "@/lib/types";
import { updateVisual, approveVisual, rejectVisual } from "../actions";

const TIERS: { value: HintTier; label: string; blurb: string }[] = [
  { value: "tier_0", label: "Tier 0", blurb: "Neutral access only — no interpretation or hints" },
  { value: "tier_1", label: "Tier 1", blurb: "Orientation: structure, labels, layout" },
  { value: "tier_2", label: "Tier 2", blurb: "Teacher-controlled support (not formal assessment)" },
];

interface Perms { canApprove: boolean; canEdit: boolean; canReject: boolean; canExport: boolean }

export function VisualWorkflow({ task, upload, permissions }: { task: VisualDescriptionTask; upload: SourceUpload | null; permissions: Perms }) {
  const approved = task.status === "approved";
  const rejected = task.status === "rejected";
  const [text, setText] = useState(task.editedDescription);
  const [tier, setTier] = useState<HintTier>(task.hintTier);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [action, setAction] = useState<string | null>(null);

  function run(name: string, fn: () => Promise<void>) {
    setAction(name);
    start(async () => { await fn(); setAction(null); });
  }

  /** Redact a flagged phrase by replacing it inline (staff control over answer leakage). */
  function redact(phrase: string) {
    setText((cur) => cur.split(phrase).join("[redacted]"));
  }

  return (
    <div className="space-y-5">
      {rejected && (
        <div className="flex items-start gap-2.5 rounded-xl bg-critical-50 px-4 py-3 text-sm text-critical-700">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" /><span><span className="font-medium">Rejected.</span> {task.rejectionReason}</span>
        </div>
      )}

      {task.context === "assessment" && !approved && !rejected && (
        <div className="flex items-start gap-2.5 rounded-xl border border-caution-200/60 bg-caution-50 px-4 py-3 text-sm text-caution-700">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-medium">Assessment mode.</span> This description cannot be exported until a teacher or QTVI approves it. Redact anything that could reveal an answer.</span>
        </div>
      )}

      <SourceImage upload={upload} label="Source visual" />

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
          <AiMeta mode={task.aiMode} provider={task.aiProvider} model={task.aiModel} confidence={task.confidence} promptVersion={task.promptVersion} />
          {!approved && (
            <div className="flex items-start gap-2.5 rounded-xl bg-caution-50 px-3.5 py-3 text-sm text-caution-700"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>Check that the description gives access to the visual without revealing what the learner is being assessed on.</span></div>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} readOnly={approved || !permissions.canEdit} rows={6} className="w-full rounded-lg border border-zinc-200 px-3.5 py-3 text-sm leading-relaxed text-zinc-800 read-only:bg-zinc-50 focus:border-accent-500" />

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
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setRejecting(false)} className="h-8 rounded-lg border border-zinc-200 px-3 text-[13px] text-zinc-700 hover:bg-zinc-50">Cancel</button>
                    <button onClick={() => run("reject", () => rejectVisual(task.id, reason))} disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-critical-600 px-3 text-[13px] font-medium text-white hover:bg-critical-700 disabled:opacity-50">{action === "reject" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Confirm</button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                {permissions.canReject && !rejecting && (
                  <button onClick={() => setRejecting(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3.5 text-[13px] text-critical-600 hover:bg-critical-50"><XCircle className="h-3.5 w-3.5" /> Reject</button>
                )}
                {permissions.canEdit && (
                  <button onClick={() => run("save", () => updateVisual(task.id, text, tier))} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{action === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save changes</button>
                )}
                {permissions.canApprove ? (
                  <button onClick={() => run("approve", () => approveVisual(task.id, text, tier))} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{action === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Approve for use</button>
                ) : (<span className="text-xs text-zinc-400">A teacher or QTVI must approve this.</span>)}
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
