import { ShieldCheck, ArrowRight } from "lucide-react";
import { demoUsers } from "@/lib/session";
import { ROLE_LABELS, ROLE_BLURB } from "@/lib/rbac";
import { initials } from "@/lib/utils";
import { signInAs } from "./actions";

/**
 * Demo sign-in. Picking a staff member shows role-based access instantly:
 * a TA can upload and edit; only a Teacher/QTVI can verify and approve.
 */
export default function LoginPage() {
  const users = demoUsers();

  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-sm font-bold text-white">
            iE
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">InsightEd AI</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            Secure, human-verified accessibility workflow for VI education teams
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-2 shadow-card">
          <p className="px-3 pb-2 pt-3 eyebrow">Choose a staff account to continue</p>
          <ul className="space-y-1">
            {users.map((u) => (
              <li key={u.id}>
                <form action={signInAs}>
                  <input type="hidden" name="userId" value={u.id} />
                  <button
                    type="submit"
                    className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-zinc-50"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-semibold text-accent-700">
                      {initials(u.fullName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-zinc-900">{u.fullName}</span>
                      <span className="block text-xs text-zinc-500">
                        {ROLE_LABELS[u.role]} · {ROLE_BLURB[u.role]}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-zinc-300 transition-colors group-hover:text-zinc-500" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-zinc-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Demo environment · UK data region · audit logging on
        </p>
      </div>
    </main>
  );
}
