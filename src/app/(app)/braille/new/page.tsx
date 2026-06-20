import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getPupils } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { NewBrailleForm } from "./new-braille-form";

export default function NewBraillePage() {
  requireUser();
  const pupils = getPupils();

  return (
    <div className="max-w-2xl">
      <Link href="/braille" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Back to reviews
      </Link>
      <PageHeader title="New Braille Review" description="Add a task and a photo of the pupil's Braille work." />
      <NewBrailleForm pupils={pupils.map((p) => ({ id: p.id, label: `${p.referenceCode} · ${p.yearGroup}` }))} />
    </div>
  );
}
