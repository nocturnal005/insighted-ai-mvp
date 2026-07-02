"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Upload, Loader2, Check } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { UploadPdfNote } from "@/components/upload-note";
import { addEvalSample } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      {pending ? "Saving…" : "Save sample"}
    </button>
  );
}

export function NewSampleForm() {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <Card>
      <CardBody>
        <form action={addEvalSample} className="space-y-5">
          <div>
            <label htmlFor="label" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Label <span className="text-critical-600">*</span>
            </label>
            <input id="label" name="label" required placeholder="e.g. Year 9 geography — clean embossed Grade 2" className="input" />
          </div>

          <div>
            <label htmlFor="groundTruthText" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Correct transcription (ground truth) <span className="text-critical-600">*</span>
            </label>
            <textarea id="groundTruthText" name="groundTruthText" required rows={6} placeholder="Type the verified, correct English for this Braille sample." className="w-full rounded-lg border border-zinc-200 px-3.5 py-3 text-sm leading-relaxed text-zinc-800 focus:border-accent-500" />
            <p className="mt-1.5 text-xs text-zinc-400">This is what the engine&apos;s output is scored against. Get it right — it&apos;s the reference.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="subject" className="mb-1.5 block text-sm font-medium text-zinc-700">Subject (optional)</label>
              <input id="subject" name="subject" placeholder="e.g. Geography" className="input" />
            </div>
            <div>
              <label htmlFor="yearGroup" className="mb-1.5 block text-sm font-medium text-zinc-700">Year group (optional)</label>
              <input id="yearGroup" name="yearGroup" placeholder="e.g. Year 9" className="input" />
            </div>
            <div>
              <label htmlFor="brailleType" className="mb-1.5 block text-sm font-medium text-zinc-700">Braille type</label>
              <select id="brailleType" name="brailleType" defaultValue="unknown" className="input">
                <option value="ueb_grade_1">UEB Grade 1 (uncontracted)</option>
                <option value="ueb_grade_2">UEB Grade 2 (contracted)</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div>
              <label htmlFor="imageQuality" className="mb-1.5 block text-sm font-medium text-zinc-700">Image quality</label>
              <select id="imageQuality" name="imageQuality" defaultValue="unknown" className="input">
                <option value="good">Good</option>
                <option value="medium">Medium</option>
                <option value="poor">Poor</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div>
              <label htmlFor="sampleSource" className="mb-1.5 block text-sm font-medium text-zinc-700">Sample source</label>
              <select id="sampleSource" name="sampleSource" defaultValue="synthetic" className="input">
                <option value="synthetic">Synthetic</option>
                <option value="anonymised_school_sample">Anonymised school sample</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="permissionStatus" className="mb-1.5 block text-sm font-medium text-zinc-700">Permission status</label>
              <select id="permissionStatus" name="permissionStatus" defaultValue="synthetic" className="input">
                <option value="synthetic">Synthetic (no personal data)</option>
                <option value="anonymised_only">Anonymised only</option>
                <option value="approved_for_testing">Approved for testing</option>
                <option value="not_approved">Not approved</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="image" className="mb-1.5 block text-sm font-medium text-zinc-700">Braille image (optional)</label>
            <label htmlFor="image" className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 px-4 py-8 text-center transition-colors hover:border-accent-300 hover:bg-accent-50/30">
              <Upload className="h-6 w-6 text-zinc-400" />
              <span className="mt-2 text-sm text-zinc-700">{fileName ?? "Click to attach the source image"}</span>
              <span className="mt-0.5 text-xs text-zinc-400">A real engine will OCR this; the mock scores against the text only</span>
              <input id="image" name="image" type="file" accept="image/png,image/jpeg,image/jpg,application/pdf" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
            </label>
            <UploadPdfNote />
          </div>

          <p className="rounded-lg border border-caution-200/60 bg-caution-50 px-3 py-2 text-xs text-caution-700">
            Only add synthetic or anonymised samples unless school permission and data-protection approval are confirmed.
          </p>

          <div className="flex justify-end pt-1"><SubmitButton /></div>
        </form>
      </CardBody>
    </Card>
  );
}
