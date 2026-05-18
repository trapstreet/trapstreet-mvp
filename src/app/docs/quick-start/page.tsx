import Link from "next/link";
import { CopyableCode } from "@/components/copyable-code";

export const metadata = {
  title: "Quick start — Trap Street docs",
};

export default function QuickStartPage() {
  return (
    <article>
      <h1 className="mb-2 text-2xl font-semibold">Quick start</h1>
      <p className="mb-8 max-w-2xl text-[var(--muted)]">
        Three commands and your first submission lands on a leaderboard.
        Assumes you have <a href="https://docs.astral.sh/uv/" target="_blank" rel="noreferrer">uv</a> installed.
      </p>

      <section className="mb-8">
        <h2 className="mb-1 text-sm uppercase tracking-widest text-[var(--muted)]">
          1. install the CLI (one-time)
        </h2>
        <CopyableCode code="uv tool install trapstreet-cli" />
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-sm uppercase tracking-widest text-[var(--muted)]">
          2. authorize this machine (one-time)
        </h2>
        <p className="mb-2 text-sm text-[var(--muted)]">
          Opens your browser to{" "}
          <Link href="/cli/authorize">/cli/authorize</Link>; you click
          Approve once. Token saves to{" "}
          <code className="text-[var(--foreground)]">
            ~/.config/trapstreet/auth.json
          </code>
          .
        </p>
        <CopyableCode code="tp login" />
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-sm uppercase tracking-widest text-[var(--muted)]">
          3. submit a run
        </h2>
        <p className="mb-2 text-sm text-[var(--muted)]">
          From any solution directory containing a{" "}
          <code className="text-[var(--foreground)]">trap.yaml</code>{" "}
          (point that <code className="text-[var(--foreground)]">trap.yaml</code>{" "}
          at a real task &mdash; <Link href="/">browse tasks</Link>):
        </p>
        <CopyableCode code={`tp run && tp submit`} />
        <p className="mt-3 text-xs text-[var(--muted)]">
          The CLI prints a <code className="text-[var(--foreground)]">view_url</code>{" "}
          when the run scores. Click it to see your row on the leaderboard.
        </p>
      </section>

      <section>
        <h2 className="mb-1 text-sm uppercase tracking-widest text-[var(--muted)]">
          What&apos;s next
        </h2>
        <ul className="space-y-1 text-sm">
          <li>
            • Don&apos;t have a solver yet? →{" "}
            <Link href="/docs/build-a-solution">build a solution</Link>
          </li>
          <li>
            • Want to <strong>create your own task</strong>? →{" "}
            <Link href="/docs/build-a-task">build a task</Link>
          </li>
          <li>
            • Want to know what <code className="text-[var(--foreground)]">tp</code>{" "}
            actually uploads? →{" "}
            <Link href="/docs/reference">reference</Link>
          </li>
        </ul>
      </section>
    </article>
  );
}
