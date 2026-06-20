import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getPupils } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { NewVisualForm } from "./new-visual-form";

export default function NewVisualPage() {
  requireUser();
  const pupils = getPupils();
  return (
    <div className="max-w-2xl">
      <Link href="/assessment" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <PageHeader
        title="New Assessment-Safe Description"
        description="Upload a graph or diagram. We'll draft a neutral description for you to refine and approve."
      />
      <NewVisualForm pupils={pupils.map((p) => ({ id: p.id, label: `${p.referenceCode} · ${p.yearGroup}` }))} />
    </div>
  );
}
