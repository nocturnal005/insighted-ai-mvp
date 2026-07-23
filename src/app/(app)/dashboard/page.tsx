import { Suspense } from "react";
import Link from "next/link";
import { ScanText, Clock, CheckCircle2, XCircle, Plus, ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/rbac";
import { getDashboardStats } from "@/lib/data";
import { pupilLabel } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { TaskBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { formatRelative } from "@/lib/utils";
import { hydrateBrailleTasks } from "@/lib/durable-braille";

export default async function DashboardPage() {
  // Only the greeting needs the user, and that is an in-memory lookup, so the shell paints
  // immediately. The Braille counts require a Neon read (hydrateBrailleTasks); that work is
  // deferred into the Suspense boundary below so it never blocks the first response.
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title={`Good to see you, ${ROLE_LABELS[user.role]}`}
        description="Here is what needs your team's attention today."
        action={
          <Link
            href="/braille/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" /> New Braille Review
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
  await hydrateBrailleTasks();
  const stats = getDashboardStats();

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={ScanText} label="Active tasks" value={stats.active} />
        <Stat icon={Clock} label="Awaiting review" value={stats.awaitingReview} tone="caution" />
        <Stat icon={CheckCircle2} label="Approved" value={stats.approved} tone="positive" />
        <Stat icon={XCircle} label="Rejected" value={stats.rejected} tone="critical" />
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-zinc-900">Recent activity</h2>
          <Link href="/braille" className="inline-flex items-center gap-1 text-[13px] text-zinc-500 hover:text-zinc-900">
            View all <ArrowUpRight className="h-3.5 w-3.5" />
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

/** Skeleton for the stat grid + recent card, shown while the Neon read resolves. */
function DashboardOverviewSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-white shadow-subtle" />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-2xl bg-white shadow-subtle" />
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "accent",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "accent" | "caution" | "positive" | "critical";
}) {
  const tones = {
    accent: "bg-accent-50 text-accent-600",
    caution: "bg-caution-50 text-caution-600",
    positive: "bg-positive-50 text-positive-600",
    critical: "bg-critical-50 text-critical-600",
  } as const;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900">{value}</p>
      <p className="mt-0.5 text-sm text-zinc-500">{label}</p>
    </Card>
  );
}
