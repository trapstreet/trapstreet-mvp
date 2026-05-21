import Link from "next/link";
import { auth } from "@/auth";
import { taskStats, tasksByTrack, userNames } from "@/lib/queries";
import { fmtScore } from "@/lib/format";
import { CopyableCode } from "@/components/copyable-code";

// Home — speedrun.com-style category grid. Each "track" is a section;
// each task is a card. Click into a task to see its leaderboard.
export default async function HomePage() {
  const session = await auth();
  const viewerId = session?.user?.id ?? null;

  const [byTrack, stats] = await Promise.all([
    tasksByTrack(viewerId),
    taskStats(),
  ]);

  // Look up display names for all task authors in one go.
  const authorIds = [...byTrack.values()]
    .flat()
    .map((t) => t.created_by)
    .filter((x): x is string => !!x);
  const authors = await userNames(authorIds);

  return (
    <div>
      <section className="mb-12">
        <h1 className="mb-2 text-3xl font-semibold text-[var(--foreground)]">
          The Playground for AI
        </h1>
        <p className="max-w-2xl text-[var(--muted)]">
          Publish tasks. Run your solutions. Let the leaderboard decide.
        </p>
        <p className="mt-4 flex max-w-2xl flex-wrap gap-x-4 gap-y-2 text-[var(--muted)]">
          <span>Run locally with the command line.</span>
          <a
            href="https://github.com/AntiNoise-ai/trapstreet-mvp/tree/main/cli"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)]"
          >
            trap CLI →
          </a>
        </p>
      </section>

      {/* ─── Quick start ─────────────────────────────────────────────── */}
      <section className="mb-12 rounded border border-[var(--border)] p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm uppercase tracking-widest text-[var(--muted)]">
            Install trap CLI
          </h2>
          <a
            href="https://github.com/AntiNoise-ai/trapstreet-mvp/tree/main/cli"
            target="_blank"
            rel="noreferrer"
            className="text-xs"
          >
            more →
          </a>
        </div>
        <CopyableCode
          code={`uv tool install trapstreet-cli   # one-time
tp login                          # one-time, opens browser
tp run && tp submit               # in any task's solution dir`}
        />

        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-xs text-[var(--muted)]">
          <p>
            Don&apos;t have <a href="https://docs.astral.sh/uv/" target="_blank" rel="noreferrer">uv</a> yet?{" "}
            <code className="text-[var(--foreground)]">curl -LsSf https://astral.sh/uv/install.sh | sh</code>.
          </p>
          <Link href="/docs">Full walkthrough →</Link>
        </div>
      </section>

      {/* ─── Task grid ───────────────────────────────────────────────── */}
      {[...byTrack.entries()].map(([track, list]) => (
        <section key={track} className="mb-10">
          <div className="mb-4 flex items-baseline justify-between border-b border-[var(--border)] pb-1">
            <h2 className="text-sm uppercase tracking-widest text-[var(--muted)]">
              {track}
            </h2>
            <span className="text-xs text-[var(--muted)]">
              {list.length} task{list.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((t) => {
              const s = stats.get(t.id);
              const author = t.created_by
                ? authors.get(t.created_by) ?? "(unknown)"
                : "trapstreet";
              return (
                <li key={t.id}>
                  {/* Stretched-link card. The title <Link> spans the
                      whole card via before:absolute, so the author /
                      world-record links can sit on top with z-10 and
                      stay clickable without nesting <a> tags. */}
                  <div className="group relative rounded border border-[var(--border)] p-4 transition hover:border-[var(--accent)]">
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <Link
                        href={`/tasks/${t.id}`}
                        className="font-semibold text-[var(--foreground)] hover:no-underline before:absolute before:inset-0 before:rounded"
                      >
                        {t.name}
                      </Link>
                      <span className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--muted)]">
                        {t.visibility === "private" && (
                          <span className="rounded border border-[var(--border)] px-1 normal-case tracking-normal">
                            private
                          </span>
                        )}
                        {t.id}
                      </span>
                    </div>
                    {t.description && (
                      <p className="mb-3 text-xs text-[var(--muted)]">
                        {t.description}
                      </p>
                    )}
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-[var(--muted)]">
                        by{" "}
                        {t.created_by ? (
                          <Link
                            href={`/users/${t.created_by}`}
                            className="relative z-10 text-[var(--foreground)]"
                          >
                            {author}
                          </Link>
                        ) : (
                          <span className="text-[var(--foreground)]">
                            {author}
                          </span>
                        )}{" "}
                        · {s?.runs ?? 0} run{(s?.runs ?? 0) === 1 ? "" : "s"}
                      </span>
                      {s?.best_solution && (
                        <span>
                          <span className="text-[var(--muted)]">wr </span>
                          <span className="text-[var(--accent)]">
                            {fmtScore(s.best_score)}
                          </span>
                          <span className="text-[var(--muted)]"> by </span>
                          {s.best_solution_id ? (
                            <Link
                              href={`/solutions/${s.best_solution_id}`}
                              className="relative z-10 text-[var(--foreground)]"
                            >
                              {s.best_solution}
                            </Link>
                          ) : (
                            <span className="text-[var(--foreground)]">
                              {s.best_solution}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
