import { requireUser } from "@/lib/session";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

/** Placeholder privacy notice — structured so it can be completed properly later. */
const SECTIONS = [
  ["Who we are", "InsightEd AI is operated on behalf of the school/organisation as a data processor. [Complete with controller details.]"],
  ["What data we process", "Anonymised pupil work (Braille images, visuals), staff account details, and audit metadata. No pupil names or dates of birth are required."],
  ["Lawful basis", "Processing supports the school's public task and statutory duties around SEND provision. [Confirm basis with DPO.]"],
  ["AI processing", "AI is used to draft transcriptions and descriptions only. Pupil data is never used to train AI models by default. All outputs are staff-verified."],
  ["Retention", "Pupil material is retained per the organisation's configured retention period and securely deleted thereafter."],
  ["Your rights", "Schools may request access, correction, or deletion of records at any time. [Add contact route.]"],
];

export default async function PrivacyPage() {
  await requireUser();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Privacy Notice" description="Draft — placeholder content to be completed with your DPO before launch." />
      <Card>
        <CardBody className="space-y-5">
          {SECTIONS.map(([h, b]) => (
            <section key={h}>
              <h2 className="text-sm font-semibold text-zinc-900">{h}</h2>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600">{b}</p>
            </section>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
