import Link from "next/link";
import { auth } from "@/auth";
import { taskStats, tasksByTrack, userNames } from "@/lib/queries";
import { fmtScore } from "@/lib/format";

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
          Find the fakes.
        </h1>
        <p className="max-w-2xl text-[var(--muted)]">
          Public benchmark for AI workflows. Pick a task → run it locally
          with the{" "}
          <a
            href="https://github.com/AntiNoise-ai/trapstreet-mvp/tree/main/cli"
            target="_blank"
            rel="noreferrer"
          >
            trap CLI
          </a>{" "}
          → upload the result. Leaderboards live inside each task.
        </p>
      </section>

      {/* ─── Install + quick start ───────────────────────────────────── */}
      <section className="mb-12 rounded border border-[var(--border)] p-5">
        <h2 className="mb-1 text-sm uppercase tracking-widest text-[var(--muted)]">
          quick start
        </h2>
        <p className="mb-4 text-sm text-[var(--foreground)]">
          Install the <code>tp</code> CLI, then submit a run in one command.
        </p>

        <ol className="space-y-4 text-sm">
          <li>
            <p className="mb-1 text-[var(--muted)]">
              <span className="mr-2 text-[var(--accent)]">1.</span> Install{" "}
              <code className="text-[var(--foreground)]">tp</code> (requires{" "}
              <a
                href="https://docs.astral.sh/uv/"
                target="_blank"
                rel="noreferrer"
              >
                uv
              </a>
              ):
            </p>
            <pre className="overflow-x-auto rounded border border-[var(--border)] bg-black/40 p-3 text-xs">
              <code>uv tool install &quot;git+https://github.com/AntiNoise-ai/trapstreet-mvp.git#subdirectory=cli&quot;</code>
            </pre>
          </li>

          <li>
            <p className="mb-1 text-[var(--muted)]">
              <span className="mr-2 text-[var(--accent)]">2.</span> Authorize
              the CLI — opens a browser, click Approve, token saves locally:
            </p>
            <pre className="overflow-x-auto rounded border border-[var(--border)] bg-black/40 p-3 text-xs">
              <code>tp login</code>
            </pre>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Or skip{" "}
              <code className="text-[var(--foreground)]">tp login</code>{" "}
              and{" "}
              <code className="text-[var(--foreground)]">export TRAPSTREET_API_KEY=ts_...</code>{" "}
              from <Link href="/settings">/settings</Link>.
            </p>
          </li>

          <li>
            <p className="mb-1 text-[var(--muted)]">
              <span className="mr-2 text-[var(--accent)]">3.</span> Clone a task
              (see grid below), write your solution + a{" "}
              <code className="text-[var(--foreground)]">trap.yaml</code>{" "}
              pointing at it, then:
            </p>
            <pre className="overflow-x-auto rounded border border-[var(--border)] bg-black/40 p-3 text-xs">
{`tp run && tp submit                       # uses 1st task in trap.yaml
tp submit word-count                       # explicit task name`}
            </pre>
          </li>
        </ol>
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
                  <Link
                    href={`/tasks/${t.id}`}
                    className="block rounded border border-[var(--border)] p-4 transition hover:border-[var(--accent)] hover:no-underline"
                  >
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-[var(--foreground)]">
                        {t.name}
                      </span>
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
                        <span className="text-[var(--foreground)]">
                          {author}
                        </span>{" "}
                        · {s?.runs ?? 0} run{(s?.runs ?? 0) === 1 ? "" : "s"}
                      </span>
                      {s?.best_runner && (
                        <span>
                          <span className="text-[var(--muted)]">wr </span>
                          <span className="text-[var(--accent)]">
                            {fmtScore(s.best_score)}
                          </span>
                          <span className="text-[var(--muted)]"> by </span>
                          <span className="text-[var(--foreground)]">
                            {s.best_runner}
                          </span>
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
