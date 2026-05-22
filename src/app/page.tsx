import Link from "next/link";
import { auth } from "@/auth";
import { taskStats, tasksByTrack, userNames } from "@/lib/queries";
import { fmtScore } from "@/lib/format";
import { CopyableCode } from "@/components/copyable-code";

// Home — clear entry points for installing the CLI and browsing tasks.
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
  const taskCount = [...byTrack.values()].reduce(
    (sum, list) => sum + list.length,
    0,
  );

  return (
    <div>
      <section className="mb-20 max-w-4xl pt-2">
        <h1 className="mb-5 max-w-3xl text-5xl font-bold leading-tight tracking-normal text-[var(--foreground)]">
          The Playground for AI
        </h1>
        <p className="max-w-3xl text-2xl font-medium leading-snug text-[var(--muted)]">
          Publish tasks. Run your solutions.
          <br />
          Let the leaderboard decide.
        </p>
      </section>

      <section className="mb-24">
        <div className="mb-5">
          <div>
            <h2 className="text-3xl font-bold text-[var(--foreground)]">
              Install trap CLI
            </h2>
            <p className="mt-2 max-w-2xl text-base text-[var(--muted)]">
              Run submissions locally, then publish results to the leaderboard.
            </p>
          </div>
        </div>

        <div className="mb-3 flex justify-end text-sm">
          <a
            href="https://github.com/AntiNoise-ai/trapstreet-mvp/tree/main/cli"
            target="_blank"
            rel="noreferrer"
          >
            more →
          </a>
        </div>

        <CopyableCode
          code={`uv tool install trapstreet-cli   # one-time
tp login                          # one-time, opens browser
tp run && tp submit               # in any task's solution dir`}
        />

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3 text-base leading-7 text-[var(--muted)]">
          <p>
            Don&apos;t have{" "}
            <a href="https://docs.astral.sh/uv/" target="_blank" rel="noreferrer">
              uv
            </a>{" "}
            yet?{" "}
            <code className="text-[var(--foreground)]">
              curl -LsSf https://astral.sh/uv/install.sh | sh
            </code>
            .
          </p>
          <Link href="/docs">Full walkthrough →</Link>
        </div>
      </section>

      <section className="mb-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-t border-[var(--border)] pt-10">
          <div>
            <h2 className="text-3xl font-bold text-[var(--foreground)]">
              Browse Tasks
            </h2>
            <p className="mt-2 max-w-2xl text-base text-[var(--muted)]">
              Pick a benchmark, inspect the rules, and climb the leaderboard.
            </p>
          </div>
          <span className="font-mono text-base text-[var(--muted)]">
            {taskCount} tasks
          </span>
        </div>

        {[...byTrack.entries()].map(([track, list]) => (
          <section key={track} className="mb-12">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h3 className="font-mono text-sm uppercase tracking-widest text-[var(--muted)]">
                {track}
              </h3>
              <span className="font-mono text-sm text-[var(--muted)]">
                {list.length} task{list.length === 1 ? "" : "s"}
              </span>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
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
                    <div className="group relative flex min-h-44 flex-col justify-between rounded border border-[var(--border)] p-5 transition hover:border-[var(--accent)]">
                      <div>
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <Link
                              href={`/tasks/${t.id}`}
                              className="text-xl font-semibold text-[var(--foreground)] hover:no-underline before:absolute before:inset-0 before:rounded"
                            >
                              {t.name}
                            </Link>
                            <p className="mt-2 font-mono text-sm text-[var(--muted)]">
                              {track}
                            </p>
                          </div>
                          <span className="relative z-10 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-[var(--muted)]">
                            {t.visibility === "private" && (
                              <span className="rounded border border-[var(--border)] px-1.5 py-0.5 normal-case tracking-normal">
                                private
                              </span>
                            )}
                            {t.id}
                          </span>
                        </div>
                        {t.description && (
                          <p className="mb-5 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
                            {t.description}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-end justify-between gap-4">
                        <div className="text-sm text-[var(--muted)]">
                          <p>
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
                            )}
                          </p>
                          <p className="mt-1 font-mono">
                            {s?.runs ?? 0} run{(s?.runs ?? 0) === 1 ? "" : "s"}
                          </p>
                        </div>

                        <div className="text-right font-mono">
                          {s?.best_solution ? (
                            <>
                              <p className="text-lg text-[var(--accent)]">
                                wr {fmtScore(s.best_score)}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                by{" "}
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
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-[var(--muted)]">
                              no runs yet
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </section>
    </div>
  );
}
