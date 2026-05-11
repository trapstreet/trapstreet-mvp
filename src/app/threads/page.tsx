import Link from "next/link";
import { listThreads } from "@/lib/queries";
import { fmtDate } from "@/lib/format";

export default async function ThreadsPage({
  searchParams,
}: {
  searchParams: Promise<{ subject_type?: string; subject_id?: string }>;
}) {
  const sp = await searchParams;
  const threads = await listThreads({
    subject_type: sp.subject_type,
    subject_id: sp.subject_id,
  });

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Threads</h1>
      <p className="mb-8 text-[var(--muted)]">
        Discussion attached to a task, track, run, or runner.
      </p>

      {(sp.subject_type || sp.subject_id) && (
        <p className="mb-4 text-xs">
          filter:{" "}
          <code>
            {sp.subject_type ?? "*"}/{sp.subject_id ?? "*"}
          </code>{" "}
          · <Link href="/threads">clear</Link>
        </p>
      )}

      {threads.length === 0 ? (
        <p className="text-[var(--muted)]">No threads.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>title</th>
              <th>on</th>
              <th>comments</th>
              <th>updated</th>
            </tr>
          </thead>
          <tbody>
            {threads.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/threads/${t.id}`}>{t.title}</Link>
                </td>
                <td className="text-[var(--muted)]">
                  {t.subject_type}/{t.subject_id}
                </td>
                <td>{t.comment_count}</td>
                <td className="text-[var(--muted)]">
                  {fmtDate(t.updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
