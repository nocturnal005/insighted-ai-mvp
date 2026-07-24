import Link from "next/link";
import { requireUser } from "@/lib/session";
import { AppNav } from "@/components/app-nav";
import { MobileNav } from "@/components/mobile-nav";
import { ROLE_INITIALS, ROLE_LABELS, ROLE_STAFF_LABEL } from "@/lib/rbac";
import { signOut } from "@/app/login/actions";

// Every page under this layout depends on the demo session cookie (requireUser),
// so it must be rendered per-request. Declaring it explicitly keeps the build from
// attempting static generation of authenticated pages.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-200/80 bg-white lg:flex">
        <Link
          href="/login"
          aria-label="Braivanta — return to the home page"
          className="flex h-16 items-center gap-2.5 px-5 transition-opacity hover:opacity-70"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white">
            B
          </div>
          <span className="font-semibold tracking-tight text-zinc-900">Braivanta</span>
        </Link>
        <AppNav role={user.role} />
        <div className="mt-auto px-5 py-4">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
            <p className="eyebrow">Organisation</p>
            <p className="mt-1 text-sm font-medium text-zinc-800">Northgate Secondary</p>
            <p className="mt-0.5 text-xs text-zinc-400">Demo environment · audit logging enabled</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-zinc-200/80 bg-white px-4 sm:px-6">
          <MobileNav role={user.role} />
          <Link
            href="/login"
            aria-label="Braivanta — return to the home page"
            className="font-semibold tracking-tight text-zinc-900 transition-opacity hover:opacity-70 lg:hidden"
          >
            Braivanta
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-zinc-900">{ROLE_STAFF_LABEL[user.role]}</p>
              <p className="text-xs text-zinc-400">{ROLE_LABELS[user.role]}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-700">
              {ROLE_INITIALS[user.role]}
            </span>
            <form action={signOut}>
              <button className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-50">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main id="main" className="flex-1 px-4 py-8 sm:px-6">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
