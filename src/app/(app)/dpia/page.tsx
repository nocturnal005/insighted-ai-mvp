import { requireUser } from "@/lib/session";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

/** Placeholder DPIA — structured so it can be completed properly later. */
const ROWS: [string, string, string][] = [
  ["Processing activity", "AI-assisted Braille transcription & visual description for VI learners", "—"],
  ["Personal data", "Anonymised pupil work + staff accounts; special category data avoided by design", "Low"],
  ["Necessity & proportionality", "Reduces staff workload; human-in-the-loop required at every output", "—"],
  ["Risk: inaccurate AI output", "All output is draft; mandatory staff verification before use", "Mitigated"],
  ["Risk: answer leakage in assessments", "Hint tiers, answer-sensitive flags, redaction, approval gate", "Mitigated"],
  ["Risk: data misuse", "RBAC, audit logs, no training on pupil data, configurable retention, secure deletion", "Mitigated"],
];

export default function DpiaPage() {
  requireUser();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Data Protection Impact Assessment" description="Draft — placeholder structure to be completed and signed off before launch." />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left">
              <th className="px-5 py-3 eyebrow font-semibold">Area</th>
              <th className="px-5 py-3 eyebrow font-semibold">Assessment</th>
              <th className="px-5 py-3 eyebrow font-semibold">Residual risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {ROWS.map(([a, b, c]) => (
              <tr key={a} className="align-top">
                <td className="px-5 py-3.5 font-medium text-zinc-900">{a}</td>
                <td className="px-5 py-3.5 text-zinc-600">{b}</td>
                <td className="px-5 py-3.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c === "Mitigated" ? "bg-positive-50 text-positive-700" : c === "Low" ? "bg-caution-50 text-caution-700" : "bg-zinc-100 text-zinc-500"}`}>{c}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
