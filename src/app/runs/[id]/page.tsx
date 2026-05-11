import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getRun,
  getRunnerById,
  getTask,
  listCasesForRun,
} from "@/lib/queries";
import { fmtCost, fmtDate, fmtLatency, fmtScore } from "@/lib/format";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();

  const [task, runner, cases] = await Promise.all([
    getTask(run.task_id),
    getRunnerById(run.runner_id),
    listCasesForRun(run.id),
  ]);

  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">
        run · <span className="font-mono">{run.id}</span>
      </p>
      <h1 className="mb-1 text-2xl font-semibold">
        {runner?.name ?? run.runner_id}
      </h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        on{" "}
        <Link href={`/tasks/${run.task_id}`}>
          {task ? task.name : run.task_id}
        </Link>
      </p>

      <section className="mb-8 grid gap-4 sm:grid-cols-2">
        <Stat label="status">
          <StatusPill status={run.status} passed={run.passed} />
        </Stat>
        <Stat label="total score">
          <span className="text-xl text-[var(--accent)]">
            {fmtScore(run.total_score)}
          </span>
        </Stat>
        <Stat label="cases">
          <span className="text-[var(--accent)]">{run.cases_passed}</span>
          <span className="text-[var(--muted)]"> passed</span>
          {run.cases_failed > 0 && (
            <>
              {" · "}
              <span className="text-red-400">{run.cases_failed}</span>
              <span className="text-[var(--muted)]"> failed</span>
            </>
          )}
          {run.cases_skipped > 0 && (
            <>
              {" · "}
              <span>{run.cases_skipped}</span>
              <span className="text-[var(--muted)]"> skipped</span>
            </>
          )}
        </Stat>
        <Stat label="latency">{fmtLatency(run.latency_ms)}</Stat>
        <Stat label="cost">{fmtCost(run.cost_usd)}</Stat>
        <Stat label="tokens">
          {run.token_count !== null ? run.token_count.toLocaleString() : "—"}
        </Stat>
        <Stat label="scored">{fmtDate(run.scored_at)}</Stat>
        <Stat label="duration">
          {run.started_at && run.finished_at
            ? `${Math.round(
                (run.finished_at.getTime() - run.started_at.getTime()) / 1000,
              )}s`
            : "—"}
        </Stat>
      </section>

      {run.error_message && (
        <section className="mb-8 rounded border border-red-500 p-4">
          <p className="mb-1 text-xs uppercase tracking-widest text-red-400">
            error
          </p>
          <p className="font-mono text-sm">{run.error_message}</p>
        </section>
      )}

      {cases.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Per-case results</h2>
          <table>
            <thead>
              <tr>
                <th>case</th>
                <th>exit</th>
                <th>duration</th>
                <th>metrics</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.case_id}</td>
                  <td className="text-[var(--muted)]">
                    {c.skipped
                      ? "skip"
                      : c.exit_code === 0
                        ? "0"
                        : c.exit_code !== null
                          ? (
                              <span className="text-red-400">{c.exit_code}</span>
                            )
                          : "—"}
                  </td>
                  <td className="text-[var(--muted)]">
                    {c.duration_ms !== null
                      ? `${c.duration_ms} ms`
                      : "—"}
                  </td>
                  <td>
                    <MetricsBadges metrics={c.metrics} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">
        {label}
      </p>
      <div>{children}</div>
    </div>
  );
}

function StatusPill({
  status,
  passed,
}: {
  status: string;
  passed: boolean | null;
}) {
  if (status === "scored") {
    return passed ? (
      <span className="rounded border border-[var(--accent)] px-2 py-0.5 text-xs text-[var(--accent)]">
        scored · passed
      </span>
    ) : (
      <span className="rounded border border-red-500 px-2 py-0.5 text-xs text-red-400">
        scored · failed
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="rounded border border-red-500 px-2 py-0.5 text-xs text-red-400">
        failed
      </span>
    );
  }
  return (
    <span className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
      {status}
    </span>
  );
}

function MetricsBadges({ metrics }: { metrics: unknown }) {
  if (!metrics || typeof metrics !== "object") {
    return <span className="text-[var(--muted)]">—</span>;
  }
  const entries = Object.entries(metrics as Record<string, unknown>);
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px]"
        >
          <span className="text-[var(--muted)]">{k}=</span>
          <span
            className={
              v === true
                ? "text-[var(--accent)]"
                : v === false
                  ? "text-red-400"
                  : "text-[var(--foreground)]"
            }
          >
            {String(v)}
          </span>
        </span>
      ))}
    </span>
  );
}
