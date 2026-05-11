import Link from "next/link";
import { taskStats, tasksByTrack } from "@/lib/queries";
import { fmtScore } from "@/lib/format";

// Home — speedrun.com-style category grid. Each "track" is a section;
// each task is a card. Click into a task to see its leaderboard.
export default async function HomePage() {
  const [byTrack, stats] = await Promise.all([tasksByTrack(), taskStats()]);

  return (
    <div>
      <section className="mb-12">
        <h1 className="mb-2 text-3xl font-semibold text-[var(--foreground)]">
          Find the fakes.
        </h1>
        <p className="max-w-2xl text-[var(--muted)]">
          Public benchmark for AI workflows. Pick a task → run it locally
          with the <a href="https://github.com/AntiNoise-ai/trap" target="_blank" rel="noreferrer">trap CLI</a> →
          upload the result. Leaderboards live inside each task.
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
              <code className="text-[var(--foreground)]">tp</code>{" "}
              (requires <a href="https://docs.astral.sh/uv/" target="_blank" rel="noreferrer">uv</a>):
            </p>
            <pre className="overflow-x-auto rounded border border-[var(--border)] bg-black/40 p-3 text-xs">
              <code>uv tool install git+https://github.com/AntiNoise-ai/trap</code>
            </pre>
          </li>

          <li>
            <p className="mb-1 text-[var(--muted)]">
              <span className="mr-2 text-[var(--accent)]">2.</span> Register a
              runner (one-time) at{" "}
              <Link href="/runners/new">/runners/new</Link> → copy the{" "}
              <code className="text-[var(--foreground)]">api_key</code>:
            </p>
            <pre className="overflow-x-auto rounded border border-[var(--border)] bg-black/40 p-3 text-xs">
              <code>export TRAPSTREET_API_KEY=ts_...</code>
            </pre>
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

        <p className="mt-4 text-xs text-[var(--muted)]">
          Server URL is configurable via{" "}
          <code className="text-[var(--foreground)]">--server</code> or{" "}
          <code className="text-[var(--foreground)]">TRAPSTREET_URL</code>{" "}
          (defaults to <code className="text-[var(--foreground)]">https://trapstreet.run</code>).
          For local dev: <code className="text-[var(--foreground)]">--server http://localhost:3000</code>.
        </p>
      </section>

      {/* ─── Task grid ───────────────────────────────────────────────── */}
      {[...byTrack.entries()].map(([track, tasks]) => (
        <section key={track} className="mb-10">
          <div className="mb-4 flex items-baseline justify-between border-b border-[var(--border)] pb-1">
            <h2 className="text-sm uppercase tracking-widest text-[var(--muted)]">
              {track}
            </h2>
            <span className="text-xs text-[var(--muted)]">
              {tasks.length} task{tasks.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {tasks.map((t) => {
              const s = stats.get(t.id);
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
                      <span className="text-[10px] uppercase tracking-widest text-[var(--muted)]">
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
                        {s?.runs ?? 0} run{(s?.runs ?? 0) === 1 ? "" : "s"}
                      </span>
                      {s?.best_runner && (
                        <span>
                          <span className="text-[var(--muted)]">wr by </span>
                          <span className="text-[var(--foreground)]">
                            {s.best_runner}
                          </span>{" "}
                          <span className="text-[var(--accent)]">
                            {fmtScore(s.best_score)}
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
