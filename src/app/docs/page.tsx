import Link from "next/link";

export const metadata = {
  title: "Docs — Trap Street",
};

export default function DocsIndex() {
  return (
    <article>
      <h1 className="mb-3 text-2xl font-semibold">Docs</h1>
      <p className="mb-10 max-w-2xl text-[var(--muted)]">
        Four short pages. Pick the one that matches what you&apos;re
        actually trying to do.
      </p>

      <ul className="space-y-5">
        <li>
          <Link
            href="/docs/quick-start"
            className="block rounded border border-[var(--border)] p-5 transition hover:border-[var(--accent)] hover:no-underline"
          >
            <p className="mb-2 font-semibold text-[var(--foreground)]">
              Quick start
            </p>
            <p className="text-sm text-[var(--muted)]">
              You already have a solver and want to{" "}
              <em>submit a run</em> against an existing task. Install
              the CLI, log in once,{" "}
              <code className="text-[var(--foreground)]">
                tp run && tp submit
              </code>
              . ~30 seconds if you have{" "}
              <code className="text-[var(--foreground)]">uv</code>.
            </p>
          </Link>
        </li>

        <li>
          <Link
            href="/docs/build-a-solution"
            className="block rounded border border-[var(--border)] p-5 transition hover:border-[var(--accent)] hover:no-underline"
          >
            <p className="mb-2 font-semibold text-[var(--foreground)]">
              Build a solution
            </p>
            <p className="text-sm text-[var(--muted)]">
              You want to <em>write a solver from scratch</em> against an
              existing task and land on the leaderboard. ~5-minute
              walkthrough: minimal{" "}
              <code className="text-[var(--foreground)]">solve.py</code>{" "}
              +{" "}
              <code className="text-[var(--foreground)]">trap.yaml</code>{" "}
              for the example task from{" "}
              <em>build a task</em>, then push + submit.
            </p>
          </Link>
        </li>

        <li>
          <Link
            href="/docs/build-a-task"
            className="block rounded border border-[var(--border)] p-5 transition hover:border-[var(--accent)] hover:no-underline"
          >
            <p className="mb-2 font-semibold text-[var(--foreground)]">
              Build a task
            </p>
            <p className="text-sm text-[var(--muted)]">
              You want to <em>create a new benchmark</em> for everyone
              else to compete on. ~15-minute walkthrough where we build a
              small real example from zero — input files,{" "}
              <code className="text-[var(--foreground)]">judge.py</code>,{" "}
              <code className="text-[var(--foreground)]">grader.py</code>,{" "}
              <code className="text-[var(--foreground)]">traptask.yaml</code>,
              publishing on trapstreet.
            </p>
          </Link>
        </li>

        <li>
          <Link
            href="/docs/reference"
            className="block rounded border border-[var(--border)] p-5 transition hover:border-[var(--accent)] hover:no-underline"
          >
            <p className="mb-2 font-semibold text-[var(--foreground)]">
              Reference
            </p>
            <p className="text-sm text-[var(--muted)]">
              You want to know <em>exactly how it works under the hood</em>.
              Four design specs: scoring + leaderboard rendering, the
              two-tier trust model, the glossary, and the v0 HTTP API.
              Each one is short.
            </p>
          </Link>
        </li>
      </ul>
    </article>
  );
}
