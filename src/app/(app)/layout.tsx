import { requireUser } from "@/lib/session";
import { AppNav } from "@/components/app-nav";
import { ROLE_LABELS } from "@/lib/rbac";
import { initials } from "@/lib/utils";
import { signOut } from "@/app/login/actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const user = requireUser();

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-200/80 bg-white lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white">
            iE
          </div>
          <span className="font-semibold tracking-tight text-zinc-900">InsightEd AI</span>
        </div>
        <AppNav role={user.role} />
        <div className="mt-auto px-5 py-4">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
            <p className="eyebrow">Organisation</p>
            <p className="mt-1 text-sm font-medium text-zinc-800">Northgate Secondary</p>
            <p className="mt-0.5 text-xs text-zinc-400">UK region · audit on</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-zinc-200/80 bg-white/80 px-6 backdrop-blur">
          <span className="font-semibold tracking-tight text-zinc-900 lg:hidden">InsightEd AI</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-zinc-900">{user.fullName}</p>
              <p className="text-xs text-zinc-400">{ROLE_LABELS[user.role]}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-700">
              {initials(user.fullName)}
            </span>
            <form action={signOut}>
              <button className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-50">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main id="main" className="flex-1 px-6 py-8">
          <div className="mx-auto max-w-5xl animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
