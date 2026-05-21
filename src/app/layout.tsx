import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { HeaderAuth } from "@/components/auth-actions";

export const metadata: Metadata = {
  title: "Trapstreet.run — The Playground for AI",
  description:
    "Publish tasks. Run your solutions. Let the leaderboard decide.",
};

// Public nav — same for everyone. Account-related actions (new task,
// settings, sign out) live in the user dropdown at the right.
const NAV = [
  { href: "/", label: "tasks" },
  { href: "/threads", label: "threads" },
  { href: "/docs", label: "docs" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-5xl px-6 py-8">
          <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4 border-b border-[var(--border)] pb-4">
            <Link
              href="/"
              className="text-base font-semibold tracking-wide text-[var(--foreground)] hover:no-underline"
            >
              <span className="text-[var(--accent)]">▢</span> Trapstreet.run
            </Link>
            <nav className="flex flex-wrap items-center gap-5 text-[13px]">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] hover:no-underline"
                >
                  {n.label}
                </Link>
              ))}
              <span className="text-[var(--border)]">·</span>
              <HeaderAuth />
            </nav>
          </header>
          <main>{children}</main>
          <footer className="mt-16 flex flex-wrap items-baseline justify-between gap-2 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
            <p>
              <span className="text-[var(--foreground)]">trapstreet.run</span> ·{" "}
              public benchmark for AI workflows · v0 contract is in{" "}
              <code className="text-[var(--foreground)]">docs/api-v0.md</code>
            </p>
            <p>
              <a
                href="https://discord.gg/Ymm57FzYmF"
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] underline-offset-2 hover:underline"
              >
                join the discord →
              </a>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
