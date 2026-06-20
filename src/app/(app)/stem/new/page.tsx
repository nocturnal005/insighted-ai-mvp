import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getPupils } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { NewStemForm } from "./new-stem-form";

export default function NewStemPage() {
  requireUser();
  const pupils = getPupils();
  return (
    <div className="max-w-2xl">
      <Link href="/stem" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <PageHeader
        title="New STEM Description"
        description="Classify the visual and choose a style. We'll draft a structured description for staff review."
      />
      <NewStemForm pupils={pupils.map((p) => ({ id: p.id, label: `${p.referenceCode} · ${p.yearGroup}` }))} />
    </div>
  );
}
