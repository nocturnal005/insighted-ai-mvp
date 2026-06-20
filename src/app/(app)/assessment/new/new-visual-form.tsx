"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Upload, Loader2, Sparkles } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { createVisualTask } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {pending ? "Drafting…" : "Draft description"}
    </button>
  );
}

export function NewVisualForm({ pupils }: { pupils: { id: string; label: string }[] }) {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <Card>
      <CardBody>
        <form action={createVisualTask} className="space-y-5">
          <div>
            <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-zinc-700">Title <span className="text-critical-600">*</span></label>
            <input id="title" name="title" required placeholder="e.g. Physics mock — distance/time graph" className="input" />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <label htmlFor="subject" className="mb-1.5 block text-sm font-medium text-zinc-700">Subject</label>
              <input id="subject" name="subject" placeholder="Physics" className="input" />
            </div>
            <div>
              <label htmlFor="yearGroup" className="mb-1.5 block text-sm font-medium text-zinc-700">Year group</label>
              <input id="yearGroup" name="yearGroup" placeholder="Year 11" className="input" />
            </div>
            <div>
              <label htmlFor="context" className="mb-1.5 block text-sm font-medium text-zinc-700">Use</label>
              <select id="context" name="context" className="input" defaultValue="assessment">
                <option value="lesson">Lesson use</option>
                <option value="assessment">Assessment use</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="pupilId" className="mb-1.5 block text-sm font-medium text-zinc-700">Pupil (anonymised)</label>
            <select id="pupilId" name="pupilId" className="input">
              <option value="">No pupil linked</option>
              {pupils.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="image" className="mb-1.5 block text-sm font-medium text-zinc-700">Visual (graph, diagram, chart)</label>
            <label htmlFor="image" className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 px-4 py-9 text-center transition-colors hover:border-accent-300 hover:bg-accent-50/30">
              <Upload className="h-6 w-6 text-zinc-400" />
              <span className="mt-2 text-sm text-zinc-700">{fileName ?? "Click to choose an image"}</span>
              <span className="mt-0.5 text-xs text-zinc-400">PNG or JPEG · optional for this demo</span>
              <input id="image" name="image" type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
            </label>
          </div>

          <div className="flex justify-end pt-1"><SubmitButton /></div>
        </form>
      </CardBody>
    </Card>
  );
}
