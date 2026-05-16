"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  label: string;
  href: string;
  // match the active tab; we exact-match leaderboard (the index route)
  // and prefix-match the rest
  exact?: boolean;
};

export function TaskTabs({ taskId }: { taskId: string }) {
  const pathname = usePathname();
  const base = `/tasks/${taskId}`;
  const tabs: Tab[] = [
    { label: "leaderboard", href: base, exact: true },
    { label: "rules", href: `${base}/rules` },
    { label: "cases", href: `${base}/cases` },
    { label: "forum", href: `${base}/forum` },
  ];

  return (
    <nav className="mb-6 flex gap-6 border-b border-[var(--border)] text-[13px]">
      {tabs.map((t) => {
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
