import Link from "next/link";
import { Users, ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getPupils, getPupilWork } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

export default async function PupilsPage() {
  await requireUser();
  const pupils = getPupils();

  return (
    <>
      <PageHeader title="Pupil Records" description="Anonymised pupil profiles and their linked, approved work." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {pupils.map((p) => {
          const work = getPupilWork(p.id);
          const count = work.braille.length + work.visual.length + work.stem.length;
          return (
            <Link key={p.id} href={`/pupils/${p.id}`}>
              <Card className="h-full transition-shadow hover:shadow-card">
                <div className="flex items-start gap-3 p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700">
                    <Users className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-zinc-900">{p.referenceCode}</p>
                      <ArrowUpRight className="h-4 w-4 text-zinc-300" />
                    </div>
                    <p className="text-xs text-zinc-400">{p.yearGroup}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{p.supportNotes}</p>
                    <p className="mt-3 text-xs font-medium text-zinc-600">{count} linked task{count === 1 ? "" : "s"}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
