"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ScanText, ImageIcon, Layers, Users, CheckSquare, ScrollText, ShieldCheck, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";
import { can } from "@/lib/rbac";

interface Item {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show?: (r: UserRole) => boolean;
}

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/braille", label: "Braille Work Review", icon: ScanText },
  { href: "/assessment", label: "Assessment-Safe", icon: ImageIcon },
  { href: "/stem", label: "STEM Support", icon: Layers },
  { href: "/pupils", label: "Pupil Records", icon: Users },
  { href: "/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/quality", label: "OCR Quality", icon: Gauge, show: (r) => can(r, "audit.read") },
  { href: "/audit", label: "Audit Trail", icon: ScrollText, show: (r) => can(r, "audit.read") },
  { href: "/admin", label: "Admin & Security", icon: ShieldCheck, show: (r) => can(r, "org.manage") },
];

export function AppNav({ role }: { role: UserRole }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5 px-3 py-2">
      {ITEMS.filter((i) => !i.show || i.show(role)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
