import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTask,
  leaderboardEntries,
  listThreadsForSubject,
} from "@/lib/queries";
import { fmtCost, fmtLatency, fmtScore } from "@/lib/format";

// Task page — speedrun.com game-page analogue. The leaderboard for this
// task lives here (not on home). Discussion + how-to-run are on the side.
export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const task = await getTask(id);
  if (!task) notFound();

  const [entries, threads] = await Promise.all([
    leaderboardEntries({ task_id: task.id }),
    listThreadsForSubject("task", task.id),
  ]);

  const repoUrl = `https://github.com/${task.traptask_ref}`;

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-3">
        <Link
          href={`/?track=${encodeURIComponent(task.track)}`}
          className="text-[10px] uppercase tracking-widest text-[var(--muted)]"
        >
          ← {task.track}
        </Link>
      </div>
      <h1 className="mb-2 text-2xl font-semibold">{task.name}</h1>
      <p className="mb-1 font-mono text-xs text-[var(--muted)]">{task.id}</p>
      {task.description && (
        <p className="mb-6 max-w-2xl text-[var(--muted)]">{task.description}</p>
      )}

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          <span className="text-xs text-[var(--muted)]">
            sorted by score · ties broken by latency
          </span>
        </div>
        {entries.length === 0 ? (
          <p className="text-[var(--muted)]">No scored runs yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>runner</th>
                <th>score</th>
                <th>pass</th>
                <th>cases</th>
                <th>latency</th>
                <th>cost</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.run_id}>
                  <td className="text-[var(--muted)]">{e.rank}</td>
                  <td className="font-medium">
                    <Link href={`/runs/${e.run_id}`}>{e.runner_name}</Link>
                  </td>
                  <td className="font-medium text-[var(--accent)]">
                    {fmtScore(e.total_score)}
                  </td>
                  <td>
                    {e.passed === true ? (
                      <span className="text-[var(--accent)]">✓</span>
                    ) : e.passed === false ? (
                      <span className="text-red-400">✗</span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="text-[var(--muted)]">
                    {e.cases_passed}
                    <span className="text-[var(--border)]">
                      /
                      {e.cases_passed + e.cases_failed + e.cases_skipped}
                    </span>
                  </td>
                  <td>{fmtLatency(e.latency_ms)}</td>
                  <td>{fmtCost(e.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Submit a run</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          From your solution dir (<code className="text-[var(--foreground)]">trap.yaml</code> pointing at{" "}
          <a href={repoUrl} target="_blank" rel="noreferrer">
            <code className="text-[var(--foreground)]">{task.traptask_ref}</code>
          </a>
          ):
        </p>
        <pre className="overflow-x-auto rounded border border-[var(--border)] bg-black/40 p-4 text-xs">
{`tp run && tp submit ${task.id}`}
        </pre>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Needs <code className="text-[var(--foreground)]">TRAPSTREET_API_KEY</code> set —
          see <Link href="/">quick start on home</Link> for installation. Returns a{" "}
          <code className="text-[var(--foreground)]">view_url</code> linking back to this
          task&apos;s leaderboard once the run is scored.
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Discussion</h2>
          <Link
            href={`/threads?subject_type=task&subject_id=${task.id}`}
            className="text-xs"
          >
            see all →
          </Link>
        </div>
        {threads.length === 0 ? (
          <p className="text-[var(--muted)]">No discussion yet.</p>
        ) : (
          <ul className="space-y-1">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/threads/${t.id}`}>{t.title}</Link>{" "}
                <span className="text-[var(--muted)]">
                  · {t.comment_count} comments
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
