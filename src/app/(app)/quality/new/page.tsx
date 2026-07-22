import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { NewSampleForm } from "./new-sample-form";

export default async function NewSamplePage() {
  const user = await requireUser();
  if (!can(user.role, "audit.read")) redirect("/dashboard");

  return (
    <div className="max-w-2xl">
      <Link href="/quality" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Back to OCR Quality
      </Link>
      <PageHeader
        title="Add ground-truth sample"
        description="A known-correct transcription the harness scores the engine against. Image optional."
      />
      <NewSampleForm />
    </div>
  );
}
