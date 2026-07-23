import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Eye,
  GraduationCap,
  PenLine,
  Settings,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { DEMO_MODE, demoUsers } from "@/lib/session";
import type { User, UserRole } from "@/lib/types";
import { WorkspaceCard } from "./workspace-card";

/**
 * Public front page. Presents the product and lets a visitor enter a role-specific
 * workspace. In demo mode each workspace card signs the user in as that role's
 * seeded staff member (RBAC then governs everything downstream); with DEMO_MODE=false
 * it invites a real identity-provider sign-in instead.
 */

interface WorkspaceCard {
  role: UserRole;
  title: string;
  blurb: string;
  icon: LucideIcon;
  /** Optional post-login destination; defaults to the dashboard. */
  redirectTo?: string;
  highlight?: boolean;
}

const WORKSPACE_CARDS: WorkspaceCard[] = [
  {
    role: "teaching_assistant",
    title: "Teaching Assistant (TA)",
    blurb: "Uploads work, prepares drafts for review. Focused on initial material processing and OCR validation.",
    icon: PenLine,
  },
  {
    role: "teacher",
    title: "Teacher",
    blurb: "Reviews verified English work and approves subject feedback.",
    icon: GraduationCap,
  },
  {
    role: "qtvi",
    title: "QTVI",
    blurb: "Specialist review & final accessibility approval.",
    icon: Eye,
  },
  {
    role: "senco",
    title: "SENCO",
    blurb: "Oversight, audit & high-level reporting for compliance and progress.",
    icon: ClipboardCheck,
  },
  {
    role: "admin",
    title: "Admin",
    blurb: "Manages users, system settings & data security.",
    icon: Settings,
  },
  {
    role: "admin",
    title: "Audit & Compliance",
    blurb: "Review security logs, OCR performance metrics, and human-verification audit trails.",
    icon: BarChart3,
    redirectTo: "/audit",
    highlight: true,
  },
];

function SiteHeader() {
  return (
    <header className="relative z-20 flex h-[77px] w-full items-center border-b border-white/10 bg-[#071d42] px-6 sm:px-[30px]">
      <div className="flex w-full items-center justify-between">
        <span className="font-display text-[22px] font-bold tracking-[-0.03em] text-white sm:text-[26px]">InsightEd AI</span>
        <div className="flex items-center gap-3">
          <div className="hidden h-8 items-center gap-2.5 rounded-full border border-white/20 bg-[#061a39] px-3.5 shadow-sm sm:flex">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#8ff1bb] opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8ff1bb]" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white">System Status: Online</span>
          </div>
          <a
            href="#profiles"
            className="flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/10 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-white/15 focus-visible:ring-[#8ff1bb] focus-visible:ring-offset-[#071d42] sm:min-h-[45px]"
          >
            <UserIcon className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={2} />
            Login
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative flex min-h-[calc(100svh-77px)] w-full flex-col overflow-hidden bg-[#071d42] lg:flex-row"
    >
      <div className="relative flex min-h-[620px] flex-col justify-center overflow-hidden px-6 py-16 text-left sm:px-10 lg:min-h-[calc(100svh-77px)] lg:w-1/2 lg:px-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 14% 88%, rgba(55, 95, 155, 0.16), transparent 38%), radial-gradient(circle at 80% 10%, rgba(71, 106, 156, 0.10), transparent 34%)",
          }}
        />
        <div className="relative z-10 max-w-[535px] lg:-translate-y-6">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.12em] text-[#8ff1bb] sm:text-[14px]">Welcome Back</p>
          <h1
            id="hero-title"
            className="font-display mb-8 text-[3.25rem] font-bold leading-[0.92] tracking-[-0.045em] text-white sm:text-[4rem] lg:text-[clamp(3.75rem,4.7vw,4.05rem)]"
          >
            <span className="block">Secure</span>
            <span className="block">Accessibility</span>
            <span className="block">Workflow</span>
          </h1>
          <p className="font-hyperlegible mb-10 max-w-[510px] text-left text-base leading-[1.55] text-[#bdc9df] [text-align-last:left] [text-wrap:pretty] sm:text-[18px] md:text-justify">
            Secure, human-verified accessibility workflow for <span className="whitespace-nowrap">VI education</span>{" "}
            teams. Select your workspace to continue.
          </p>
          <a
            href="#profiles"
            className="inline-flex min-h-16 min-w-[167px] items-center justify-center rounded-[8px] bg-[#e2e9fb] px-8 py-3 text-base font-semibold text-[#07172f] shadow-[0_8px_24px_rgba(0,0,0,0.10)] transition hover:-translate-y-0.5 hover:bg-white focus-visible:ring-[#8ff1bb] focus-visible:ring-offset-[#071d42]"
          >
            Get Started
          </a>
        </div>
      </div>
      <div className="relative min-h-[520px] lg:min-h-[calc(100svh-77px)] lg:w-1/2">
        <Image
          src="/hero-classroom-stitch.png"
          alt="A visually impaired student using a braille typewriter while classmates work with accessible technology."
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover object-center"
        />
      </div>
    </section>
  );
}

function WorkspaceGrid({ users }: { users: User[] }) {
  const cards = WORKSPACE_CARDS.map((card) => ({
    ...card,
    user: users.find((u) => u.role === card.role),
  })).filter((card): card is WorkspaceCard & { user: User } => Boolean(card.user));

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <WorkspaceCard
            key={card.title}
            userId={card.user.id}
            next={card.redirectTo}
            ariaLabel={`Enter the ${card.title} workspace`}
            highlight={Boolean(card.highlight)}
          >
            <div className="mb-4">
              <Icon className="mb-4 h-8 w-8 text-[#002147]" aria-hidden="true" strokeWidth={1.75} />
              <h3 className="font-display mb-2 text-xl font-bold text-[#000a1e]">{card.title}</h3>
              <p className="text-sm italic leading-relaxed text-[#44474e]">{card.blurb}</p>
            </div>
            <div className="mt-auto flex items-center justify-between border-t border-[#c4c6cf] pt-4 text-sm font-semibold text-[#002147]">
              <span>Enter Workspace</span>
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </div>
          </WorkspaceCard>
        );
      })}
    </div>
  );
}

// Brand marks (lucide has no current TikTok / X icon) — official single-path logos.
const SOCIALS: { label: string; href: string; path: string }[] = [
  {
    label: "Facebook",
    href: "#",
    path: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.628-5.373-12-12-12s-12 5.372-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  },
  {
    label: "TikTok",
    href: "#",
    path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
  {
    label: "YouTube",
    href: "#",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
  {
    label: "X",
    href: "#",
    path: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  },
];

function SiteFooter() {
  return (
    <footer className="w-full border-t border-[#c4c6cf] bg-white px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
        <div className="flex flex-col gap-1">
          <span className="font-display text-lg font-bold text-[#002147]">InsightEd AI</span>
          <span className="text-xs text-[#44474e]">© 2026 InsightEd AI. Designed for UK school accessibility workflows.</span>
        </div>
        <div className="flex flex-col items-center gap-3 md:items-end">
          <div className="flex items-center gap-1">
            {SOCIALS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                aria-label={`InsightEd AI on ${social.label}`}
                className="rounded-full p-2 text-[#44474e] transition-colors hover:bg-[#eef4ff] hover:text-[#002147]"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                  <path d={social.path} />
                </svg>
              </a>
            ))}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-[#44474e]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Demo environment · audit logging enabled
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#eef4ff]">
      <main id="main" className="w-full flex-grow">
        <SiteHeader />
        <Hero />
        <section id="profiles" className="defer-render bg-[#eef4ff] px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 text-center">
              <h2 className="font-display mb-2 text-3xl font-bold text-[#002147]">Select Workspace Profile</h2>
              <p className="mx-auto max-w-2xl text-[#44474e]">
                Choose your workspace to begin a secure session. Each environment is tailored to your specific role and
                responsibilities.
              </p>
            </div>

            {DEMO_MODE ? (
              <WorkspaceGrid users={demoUsers()} />
            ) : (
              <div className="mx-auto max-w-md rounded-2xl border border-[#c4c6cf] bg-white p-8 text-center shadow-card">
                <h3 className="font-display text-xl font-bold text-[#002147]">Authentication required</h3>
                <p className="mt-2 text-sm text-[#44474e]">
                  The demo staff picker is disabled. Connect Supabase Auth or your school identity provider through
                  getCurrentUser() to enable sign-in.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
