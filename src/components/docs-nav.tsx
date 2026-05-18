"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/docs", label: "overview", exact: true },
  { href: "/docs/quick-start", label: "quick start" },
  { href: "/docs/build-a-solution", label: "build a solution" },
  { href: "/docs/build-a-task", label: "build a task" },
  { href: "/docs/reference", label: "reference" },
];

export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-8 flex gap-6 border-b border-[var(--border)] text-[13px]">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              "-mb-px border-b-2 py-2 transition hover:no-underline " +
              (active
                ? "border-[var(--accent)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
