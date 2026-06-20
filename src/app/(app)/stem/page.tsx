import Link from "next/link";
import { Plus, Layers } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getStemTasks } from "@/lib/data";
import { pupilLabel } from "@/lib/store";
import { VISUAL_TYPE_LABELS } from "@/lib/braille-engine";
import { Card, CardBody } from "@/components/ui/card";
import { TaskBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { formatRelative } from "@/lib/utils";

export default function StemListPage() {
  requireUser();
  const tasks = getStemTasks();

  return (
    <>
      <PageHeader
        title="STEM Description Support"
        description="Structured first-draft descriptions for graphs, charts, tables and diagrams."
        action={
          <Link href="/stem/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800">
            <Plus className="h-4 w-4" /> New STEM description
          </Link>
        }
      />

      {tasks.length === 0 ? (
        <Card className="px-5 py-16 text-center">
          <Layers className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-3 text-sm text-zinc-500">No STEM descriptions yet. Classify a visual to generate a structured draft.</p>
          <Link href="/stem/new" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent-700 hover:underline">
            <Plus className="h-4 w-4" /> Create one
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {tasks.map((t) => (
            <Link key={t.id} href={`/stem/${t.id}`}>
              <Card className="h-full transition-shadow hover:shadow-card">
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-zinc-900">{t.title}</p>
                    <TaskBadge status={t.status} />
                  </div>
                  <p className="line-clamp-2 whitespace-pre-wrap text-sm text-zinc-500">{t.editedDescription}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{VISUAL_TYPE_LABELS[t.visualType]}</span>
                    {pupilLabel(t.pupilId) && <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{pupilLabel(t.pupilId)}</span>}
                    <span className="ml-auto text-xs text-zinc-400">{formatRelative(t.updatedAt)}</span>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
