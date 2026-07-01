"use client";

import { useState, useTransition } from "react";
import { Loader2, Lock, CheckCircle2, ListChecks, ShieldAlert, RefreshCw } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportMenu } from "@/components/export-menu";
import { AiMeta } from "@/components/ai-meta";
import { ExportGateHint } from "@/components/gate-hint";
import { SourceImage, type SourceUpload } from "@/components/source-image";
import type { DescriptionStyle, StemTask } from "@/lib/types";
import { restyleStem, rerunStemDescription, updateStem, approveStem } from "../actions";

const STYLES: { value: DescriptionStyle; label: string }[] = [
  { value: "descriptive", label: "Descriptive" },
  { value: "instructional", label: "Instructional" },
  { value: "assessment_safe", label: "Assessment-safe" },
];

interface Perms { canApprove: boolean; canEdit: boolean; canExport: boolean }

export function StemWorkflow({ task, upload, structure, permissions }: { task: StemTask; upload: SourceUpload | null; structure: string[]; permissions: Perms }) {
  const approved = task.status === "approved";
  const [text, setText] = useState(task.editedDescription);
  const [pending, start] = useTransition();
  const [action, setAction] = useState<string | null>(null);

  function run(name: string, fn: () => Promise<void>) {
    setAction(name);
    start(async () => { await fn(); setAction(null); });
  }

  return (
    <div className="space-y-5">
      {/* Suggested structure for this visual type */}
      <Card>
        <CardHeader><CardTitle>Suggested structure</CardTitle><span className="inline-flex items-center gap-1.5 text-xs text-zinc-400"><ListChecks className="h-3.5 w-3.5" /> Based on visual type</span></CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {structure.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] text-zinc-500">{i + 1}</span>{s}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Style selector — re-drafts the description */}
      {!approved && permissions.canEdit && (
        <Card>
          <CardHeader><CardTitle>Description style</CardTitle><span className="text-xs text-zinc-400">Changing style re-drafts the text</span></CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {STYLES.map((s) => {
                const active = task.style === s.value;
                return (
                  <button key={s.value} disabled={pending} onClick={() => run("restyle", async () => { await restyleStem(task.id, s.value); setText(""); })} className={`rounded-xl border p-3 text-center text-sm font-medium transition-colors disabled:opacity-50 ${active ? "border-accent-400 bg-accent-50/60 text-accent-700 ring-1 ring-accent-200" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}>
                    {action === "restyle" && active ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : s.label}
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      <SourceImage upload={upload} label="Source visual" />

      {task.answerSensitiveFlags.length > 0 && (
        <div className="space-y-2">
          {task.answerSensitiveFlags.map((f, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-xl bg-caution-50 px-3.5 py-2.5 text-sm text-caution-700">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span><span className="font-medium">“{f.text}”</span> — {f.reason}</span>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Structured description</CardTitle>{!approved && <span className="text-xs text-zinc-400">Draft · editable</span>}</CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AiMeta
              mode={task.aiMode}
              provider={task.aiProvider}
              model={task.aiModel}
              confidence={task.confidence}
              promptVersion={task.promptVersion}
              processingMs={task.processingMs}
              flagCount={task.aiFlags?.length}
              unavailable={(task.aiFlags ?? []).some((f) => f.category === "provider_unavailable" || f.category === "processing_failed")}
            />
            {!approved && permissions.canEdit && Boolean(upload) && (
              <button
                onClick={() => run("rerun", async () => { await rerunStemDescription(task.id); setText(""); })}
                disabled={pending}
                title="Re-run the description on the uploaded image"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                {action === "rerun" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Re-run AI/OCR
              </button>
            )}
          </div>
          {!approved && (
            <div className="flex items-start gap-2.5 rounded-xl bg-caution-50 px-3.5 py-3 text-sm text-caution-700"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>This is an AI draft. Check the structure and remove anything that reveals the answer before approving.</span></div>
          )}
          <textarea value={text || task.editedDescription} onChange={(e) => setText(e.target.value)} readOnly={approved || !permissions.canEdit} rows={9} className="w-full rounded-lg border border-zinc-200 px-3.5 py-3 text-sm leading-relaxed text-zinc-800 read-only:bg-zinc-50 focus:border-accent-500" />

          {approved ? (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-positive-50 px-3.5 py-3 text-sm text-positive-700"><Lock className="h-4 w-4" /> Approved and saved to the pupil record.</div>
              {permissions.canExport && <ExportMenu id={task.id} kind="stem" label="Export description" />}
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <ExportGateHint className="mr-auto" message="Export locked until approval" />
              {permissions.canEdit && (
                <button onClick={() => run("save", () => updateStem(task.id, text || task.editedDescription))} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{action === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save changes</button>
              )}
              {permissions.canApprove ? (
                <button onClick={() => run("approve", () => approveStem(task.id, text || task.editedDescription))} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{action === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Approve & save to record</button>
              ) : (<span className="text-xs text-zinc-400">A teacher or QTVI must approve this.</span>)}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
