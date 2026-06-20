import Link from "next/link";
import { redirect } from "next/navigation";
import { Gauge, Plus, Play, Database, Trash2, FlaskConical } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getCorrections, getEvalSamples, getQualityStats } from "@/lib/data";
import { pct } from "@/lib/metrics";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { formatRelative } from "@/lib/utils";
import { runEvaluation, deleteEvalSample } from "./actions";

export default function QualityPage() {
  const user = requireUser();
  if (!can(user.role, "audit.read")) redirect("/dashboard");

  const stats = getQualityStats();
  const corrections = getCorrections();
  const samples = getEvalSamples();

  return (
    <>
      <PageHeader
        title="OCR Quality"
        description="Measure transcription accuracy and capture every staff correction as labelled data."
      />

      {/* Engine banner */}
      <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-accent-100 bg-accent-50/50 px-4 py-3 text-sm text-accent-700">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Active engine: <span className="font-medium">mock-v1 (simulated)</span>. Numbers below are
          illustrative until a real Braille OCR engine is wired — at which point the harness scores it
          unchanged.
        </span>
      </div>

      {/* Overview */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Database} label="Labelled pairs captured" value={String(stats.pairs)} />
        <Stat icon={Gauge} label="Avg correction rate (CER)" value={pct(stats.avgCer)} hint="how much staff fix the AI" />
        <Stat icon={FlaskConical} label="Ground-truth samples" value={String(stats.samples)} />
        <Stat icon={Play} label="Harness accuracy" value={stats.evalAvgCer === null ? "—" : pct(1 - stats.evalAvgCer)} hint={`${stats.evaluated} evaluated`} />
      </div>

      {/* Evaluation harness */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Evaluation harness</CardTitle>
          <div className="flex items-center gap-2.5">
            <Link href="/quality/new" className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">
              <Plus className="h-3.5 w-3.5" /> Add sample
            </Link>
            <form action={runEvaluation}>
              <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800">
                <Play className="h-3.5 w-3.5" /> Run evaluation
              </button>
            </form>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {samples.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <FlaskConical className="mx-auto h-8 w-8 text-zinc-300" />
              <p className="mt-3 text-sm text-zinc-500">No ground-truth samples yet. Add labelled images to measure accuracy.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left">
                  <th className="px-5 py-3 eyebrow font-semibold">Sample</th>
                  <th className="px-5 py-3 eyebrow font-semibold">CER</th>
                  <th className="px-5 py-3 eyebrow font-semibold">WER</th>
                  <th className="px-5 py-3 eyebrow font-semibold">Accuracy</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {samples.map((s) => (
                  <tr key={s.id} className="align-top">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-zinc-900">{s.label}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-zinc-400">{s.groundTruthText}</p>
                      {s.lastRunAt && <p className="mt-0.5 text-[11px] text-zinc-400">Run {formatRelative(s.lastRunAt)}</p>}
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-zinc-700">{pct(s.cer)}</td>
                    <td className="px-5 py-3.5 tabular-nums text-zinc-700">{pct(s.wer)}</td>
                    <td className="px-5 py-3.5">
                      {s.cer === null ? (
                        <span className="text-zinc-400">not run</span>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${accuracyTone(1 - s.cer)}`}>{pct(1 - s.cer)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <form action={deleteEvalSample}>
                        <input type="hidden" name="sampleId" value={s.id} />
                        <button className="text-zinc-300 hover:text-critical-600" aria-label="Delete sample">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {/* Captured corrections */}
      <Card>
        <CardHeader>
          <CardTitle>Captured corrections</CardTitle>
          <span className="text-xs text-zinc-400">Auto-collected when staff verify a transcription</span>
        </CardHeader>
        <CardBody className="p-0">
          {corrections.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">No corrections captured yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left">
                  <th className="px-5 py-3 eyebrow font-semibold">Task</th>
                  <th className="px-5 py-3 eyebrow font-semibold">CER</th>
                  <th className="px-5 py-3 eyebrow font-semibold">WER</th>
                  <th className="hidden px-5 py-3 eyebrow font-semibold sm:table-cell">Verified by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {corrections.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-zinc-900">{c.taskTitle}</p>
                      <p className="text-xs text-zinc-400">{formatRelative(c.createdAt)} · {c.engine}</p>
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-zinc-700">{pct(c.cer)}</td>
                    <td className="px-5 py-3.5 tabular-nums text-zinc-700">{pct(c.wer)}</td>
                    <td className="hidden px-5 py-3.5 text-zinc-500 sm:table-cell">{c.verifiedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-400">
            These (AI draft → verified final) pairs are exactly the labelled data needed to evaluate and
            later fine-tune a real OCR engine.
          </p>
        </CardBody>
      </Card>
    </>
  );
}

function accuracyTone(acc: number): string {
  if (acc >= 0.95) return "bg-positive-50 text-positive-700";
  if (acc >= 0.85) return "bg-caution-50 text-caution-700";
  return "bg-critical-50 text-critical-700";
}

function Stat({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
      <p className="mt-0.5 text-sm text-zinc-500">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
    </Card>
  );
}
