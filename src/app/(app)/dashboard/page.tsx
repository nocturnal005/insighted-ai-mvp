import { Suspense } from "react";
import Link from "next/link";
import { ScanText, Plus, ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/rbac";
import { getDashboardStats } from "@/lib/data";
import { pupilLabel } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { TaskBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { SubmissionWorkflow } from "@/components/submission-workflow";
import { formatRelative } from "@/lib/utils";
import { hydrateBrailleTasks } from "@/lib/durable-braille";
import { hydrateStemTasks, hydrateVisualTasks } from "@/lib/durable-demo";

export default async function DashboardPage() {
  // Only the greeting needs the user, and that is an in-memory lookup, so the shell paints
  // immediately. The Braille counts require a Neon read (hydrateBrailleTasks); that work is
  // deferred into the Suspense boundary below so it never blocks the first response.
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title={`Good to see you, ${ROLE_LABELS[user.role]}`}
        description="Continue a submission or start the focused three-stage Braille workflow."
        action={
          <Link
            href="/braille/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" /> Start upload
          </Link>
        }
      />

      <Suspense fallback={<DashboardOverviewSkeleton />}>
        <DashboardOverview />
      </Suspense>
    </>
  );
}

/**
 * Task counts + recent activity. Isolated in its own async component so its Neon-backed
 * hydrate streams in behind a skeleton instead of blocking the whole dashboard render.
 */
async function DashboardOverview() {
  await Promise.all([
    hydrateBrailleTasks(),
    hydrateVisualTasks(),
    hydrateStemTasks(),
  ]);
  const stats = getDashboardStats();

  return (
    <>
      <section aria-labelledby="workflow-heading">
        <h2 id="workflow-heading" className="mb-3 text-[15px] font-semibold text-zinc-900">How every submission moves forward</h2>
        <SubmissionWorkflow />
      </section>

      <Card className="mt-6">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-zinc-900">Continue a submission</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Open the next piece of learner work that needs attention.</p>
          </div>
          <Link href="/braille" className="inline-flex items-center gap-1 text-[13px] text-zinc-500 hover:text-zinc-900">
            View submissions <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {stats.recent.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <ScanText className="mx-auto h-8 w-8 text-zinc-300" />
            <p className="mt-3 text-sm text-zinc-500">No tasks yet — create your first review.</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {stats.recent.map((t) => (
              <li key={t.id}>
                <Link href={`/braille/${t.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-zinc-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{t.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {t.subject ?? "No subject"}
                      {pupilLabel(t.pupilId) ? ` · ${pupilLabel(t.pupilId)}` : ""} · {formatRelative(t.updatedAt)}
                    </p>
                  </div>
                  <TaskBadge status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/** Skeleton for the workflow orientation + submission list, shown while the Neon read resolves. */
function DashboardOverviewSkeleton() {
  return (
    <>
      <div className="h-24 animate-pulse rounded-2xl bg-white shadow-subtle" />
      <div className="mt-6 h-64 animate-pulse rounded-2xl bg-white shadow-subtle" />
    </>
  );
}
