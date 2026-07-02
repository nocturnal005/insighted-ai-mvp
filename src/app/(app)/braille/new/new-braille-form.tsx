"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Upload, Loader2, Check } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { UploadPdfNote } from "@/components/upload-note";
import { createBrailleTask } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      {pending ? "Creating…" : "Create & continue"}
    </button>
  );
}

export function NewBrailleForm({ pupils }: { pupils: { id: string; label: string }[] }) {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <Card>
      <CardBody>
        <form action={createBrailleTask} className="space-y-5">
          <Field label="Task title" required htmlFor="title">
            <input
              id="title"
              name="title"
              required
              placeholder="e.g. Year 9 science homework — water cycle"
              className="input"
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Subject" htmlFor="subject">
              <input id="subject" name="subject" placeholder="Science" className="input" />
            </Field>
            <Field label="Pupil (anonymised)" htmlFor="pupilId">
              <select id="pupilId" name="pupilId" className="input">
                <option value="">No pupil linked</option>
                {pupils.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Braille work image" htmlFor="image">
            <label
              htmlFor="image"
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 px-4 py-9 text-center transition-colors hover:border-accent-300 hover:bg-accent-50/30"
            >
              <Upload className="h-6 w-6 text-zinc-400" />
              <span className="mt-2 text-sm text-zinc-700">
                {fileName ?? "Click to choose a photo or scan"}
              </span>
              <span className="mt-0.5 text-xs text-zinc-400">PNG or JPEG · optional for this demo</span>
              <input
                id="image"
                name="image"
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </label>
            <UploadPdfNote />
          </Field>

          <div className="flex justify-end pt-1">
            <SubmitButton />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-zinc-700">
        {label} {required && <span className="text-critical-600">*</span>}
      </label>
      {children}
    </div>
  );
}
