import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getPupils } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { SubmissionWorkflow } from "@/components/submission-workflow";
import { NewBrailleForm } from "./new-braille-form";

export default async function NewBraillePage() {
  await requireUser();
  const pupils = getPupils();

  return (
    <div className="max-w-3xl">
      <Link href="/braille" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Back to submissions
      </Link>
      <PageHeader title="Upload Braille work" description="Stage 1 of 3 · Create a submission and add the learner's Braille material." />
      <SubmissionWorkflow current={1} className="mb-6" />
      <NewBrailleForm pupils={pupils.map((p) => ({ id: p.id, label: `${p.referenceCode} · ${p.yearGroup}` }))} />
    </div>
  );
}
