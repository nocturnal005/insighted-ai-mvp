import Link from "next/link";
import { Plus, ScanText } from "lucide-react";
import { getBrailleTasks } from "@/lib/data";
import { pupilLabel } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { TaskBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { formatRelative } from "@/lib/utils";

export default function BrailleListPage() {
  const tasks = getBrailleTasks();

  return (
    <>
      <PageHeader
        title="Braille Work Review"
        description="Upload pupil Braille work, verify the transcription, and generate feedback."
        action={
          <Link
            href="/braille/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" /> New review
          </Link>
        }
      />

      {tasks.length === 0 ? (
        <Card className="px-5 py-16 text-center">
          <ScanText className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-3 text-sm text-zinc-500">No Braille reviews yet.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left">
                <th className="px-5 py-3 eyebrow font-semibold">Task</th>
                <th className="hidden px-5 py-3 eyebrow font-semibold sm:table-cell">Pupil</th>
                <th className="hidden px-5 py-3 eyebrow font-semibold sm:table-cell">Updated</th>
                <th className="px-5 py-3 eyebrow font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {tasks.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-zinc-50">
                  <td className="px-5 py-3.5">
                    <Link href={`/braille/${t.id}`} className="font-medium text-zinc-900 hover:text-accent-700">
                      {t.title}
                    </Link>
                    <p className="text-xs text-zinc-400">{t.subject ?? "No subject"}</p>
                  </td>
                  <td className="hidden px-5 py-3.5 text-zinc-500 sm:table-cell">{pupilLabel(t.pupilId) ?? "—"}</td>
                  <td className="hidden px-5 py-3.5 text-zinc-400 sm:table-cell">{formatRelative(t.updatedAt)}</td>
                  <td className="px-5 py-3.5">
                    <TaskBadge status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
