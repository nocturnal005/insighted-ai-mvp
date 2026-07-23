import Link from "next/link";
import { Plus, ImageIcon, ShieldCheck } from "lucide-react";
import { getVisualTasks } from "@/lib/data";
import { hydrateVisualTasks } from "@/lib/durable-demo";
import { Card, CardBody } from "@/components/ui/card";
import { TaskBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { formatRelative } from "@/lib/utils";

const TIER_LABEL: Record<string, string> = {
  tier_0: "Tier 0 · Neutral",
  tier_1: "Tier 1 · Orientation",
  tier_2: "Tier 2 · Supported",
};

export default async function AssessmentListPage() {
  await hydrateVisualTasks();
  const tasks = getVisualTasks();

  return (
    <>
      <PageHeader
        title="Assessment-Safe Visual Support"
        description="Prepare answer-neutral descriptions of graphs and diagrams, under staff control."
        action={
          <Link
            href="/assessment/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" /> New description
          </Link>
        }
      />

      <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-accent-100 bg-accent-50/50 px-4 py-3 text-sm text-accent-700">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Hint tiers and answer-sensitive flags help describe visuals without giving an unfair
          advantage. Nothing can be used in assessment until a teacher or QTVI approves it.
        </span>
      </div>

      {tasks.length === 0 ? (
        <Card className="px-5 py-16 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-3 text-sm text-zinc-500">No descriptions yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {tasks.map((t) => (
            <Link key={t.id} href={`/assessment/${t.id}`}>
              <Card className="h-full transition-shadow hover:shadow-card">
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-zinc-900">{t.title}</p>
                    <TaskBadge status={t.status} />
                  </div>
                  <p className="line-clamp-2 text-sm text-zinc-500">{t.editedDescription}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      {t.context === "assessment" ? "Assessment" : "Lesson"}
                    </span>
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      {TIER_LABEL[t.hintTier]}
                    </span>
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
