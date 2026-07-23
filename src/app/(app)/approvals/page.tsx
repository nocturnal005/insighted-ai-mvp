import Link from "next/link";
import { CheckSquare, ArrowUpRight, ScanText, ImageIcon, Layers } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getApprovalQueue } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { hydrateBrailleTasks } from "@/lib/durable-braille";
import { hydrateStemTasks, hydrateVisualTasks } from "@/lib/durable-demo";

const KIND_ICON = { braille: ScanText, visual: ImageIcon, stem: Layers } as const;

export default async function ApprovalsPage() {
  await requireUser();
  await Promise.all([
    hydrateBrailleTasks(),
    hydrateVisualTasks(),
    hydrateStemTasks(),
  ]);
  const items = getApprovalQueue();

  return (
    <>
      <PageHeader title="Approvals" description="Everything awaiting human review or approval, across all modules." />

      <Card>
        {items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <CheckSquare className="mx-auto h-8 w-8 text-zinc-300" />
            <p className="mt-3 text-sm text-zinc-500">Nothing awaiting approval — you&apos;re all caught up.</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {items.map((it) => {
              const Icon = KIND_ICON[it.kind];
              return (
                <li key={it.id}>
                  <Link href={it.href} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-zinc-50">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-caution-50 text-caution-600">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">{it.title}</p>
                      <p className="text-xs text-zinc-400">{it.context}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[13px] text-accent-700">
                      Review <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
