import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ScanText, ImageIcon, Layers } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getPupil, getPupilWork } from "@/lib/data";
import { VISUAL_TYPE_LABELS } from "@/lib/braille-engine";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskBadge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import type { TaskStatus } from "@/lib/types";
import { hydrateBrailleTasks } from "@/lib/durable-braille";
import { hydrateStemTasks, hydrateVisualTasks } from "@/lib/durable-demo";

export default async function PupilDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requireUser();
  await Promise.all([
    hydrateBrailleTasks(),
    hydrateVisualTasks(),
    hydrateStemTasks(),
  ]);
  const pupil = getPupil(params.id);
  if (!pupil) notFound();
  const work = getPupilWork(pupil.id);

  return (
    <div className="max-w-3xl">
      <Link href="/pupils" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Back to pupils
      </Link>

      <div className="mb-7">
        <h1 className="text-[24px] font-semibold tracking-tight text-zinc-900">{pupil.referenceCode}</h1>
        <p className="mt-1 text-sm text-zinc-500">{pupil.yearGroup}</p>
      </div>

      <Card className="mb-5">
        <CardHeader><CardTitle>Support notes</CardTitle></CardHeader>
        <CardBody className="text-sm text-zinc-700">{pupil.supportNotes}</CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Linked work</CardTitle><span className="text-xs text-zinc-400">Approved outputs save here</span></CardHeader>
        <CardBody className="p-0">
          {work.braille.length + work.visual.length + work.stem.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">No linked work yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {work.braille.map((t) => <Row key={t.id} href={`/braille/${t.id}`} icon={ScanText} title={t.title} sub="Braille review" status={t.status} when={t.updatedAt} />)}
              {work.visual.map((t) => <Row key={t.id} href={`/assessment/${t.id}`} icon={ImageIcon} title={t.title} sub="Assessment-safe description" status={t.status} when={t.updatedAt} />)}
              {work.stem.map((t) => <Row key={t.id} href={`/stem/${t.id}`} icon={Layers} title={t.title} sub={`STEM · ${VISUAL_TYPE_LABELS[t.visualType]}`} status={t.status} when={t.updatedAt} />)}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ href, icon: Icon, title, sub, status, when }: {
  href: string; icon: React.ComponentType<{ className?: string }>; title: string; sub: string; status: TaskStatus; when: string;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-zinc-50">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500"><Icon className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900">{title}</p>
          <p className="text-xs text-zinc-400">{sub} · {formatRelative(when)}</p>
        </div>
        <TaskBadge status={status} />
      </Link>
    </li>
  );
}
