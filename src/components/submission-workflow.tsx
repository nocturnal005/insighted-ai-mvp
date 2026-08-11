import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type SubmissionStage = 1 | 2 | 3;

const STAGES: Array<{ number: SubmissionStage; label: string; description: string }> = [
  { number: 1, label: "Upload & Translate", description: "Add the learner's Braille work and create the English draft." },
  { number: 2, label: "Verify & Review", description: "Check the translated work and record specialist corrections." },
  { number: 3, label: "Assess & Feedback", description: "Review the verified work and approve learner feedback." },
];

export function SubmissionWorkflow({
  current = null,
  completed = false,
  links,
  className,
}: {
  current?: SubmissionStage | null;
  completed?: boolean;
  links?: [string, string, string];
  className?: string;
}) {
  return (
    <nav aria-label="Submission workflow" className={cn("rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 shadow-subtle", className)}>
      <ol className="grid gap-2 sm:grid-cols-3">
        {STAGES.map((stage, index) => {
          const done = completed || (current !== null && stage.number < current);
          const active = !completed && stage.number === current;
          const content = (
            <>
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  done && "border-positive-600 bg-positive-600 text-white",
                  active && "border-accent-600 bg-accent-600 text-white",
                  !done && !active && "border-zinc-200 bg-white text-zinc-500",
                )}
                aria-hidden="true"
              >
                {done ? <Check className="h-4 w-4" /> : stage.number}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-[13px] font-semibold", active || done ? "text-zinc-900" : "text-zinc-600")}>{stage.label}</span>
                <span className="mt-0.5 hidden text-[11px] leading-relaxed text-zinc-500 xl:block">{stage.description}</span>
              </span>
            </>
          );

          return (
            <li key={stage.number}>
              {links ? (
                <Link
                  href={links[index]}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-zinc-50",
                    active && "bg-accent-50",
                    done && "bg-positive-50/60",
                  )}
                >
                  {content}
                </Link>
              ) : (
                <div
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5",
                    active && "bg-accent-50",
                    done && "bg-positive-50/60",
                  )}
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
