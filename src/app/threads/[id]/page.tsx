import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getRunnerById,
  getThread,
  listComments,
} from "@/lib/queries";
import { fmtDate } from "@/lib/format";

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const thread = await getThread(id);
  if (!thread) notFound();

  const [comments, author] = await Promise.all([
    listComments(id),
    getRunnerById(thread.author_id),
  ]);

  // Resolve author runner names for each comment in one round trip.
  const authorIds = [...new Set(comments.map((c) => c.author_id))];
  const authors = new Map<string, string>();
  for (const aid of authorIds) {
    const a = await getRunnerById(aid);
    if (a) authors.set(aid, a.name);
  }

  const subjectLink = subjectHref(thread.subject_type, thread.subject_id);

  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-widest text-[var(--muted)]">
        thread on{" "}
        {subjectLink ? (
          <Link href={subjectLink}>
            {thread.subject_type}/{thread.subject_id}
          </Link>
        ) : (
          `${thread.subject_type}/${thread.subject_id}`
        )}
      </p>
      <h1 className="mb-2 text-2xl font-semibold">{thread.title}</h1>
      <p className="mb-8 text-xs text-[var(--muted)]">
        opened by {author?.name ?? thread.author_id} ·{" "}
        {fmtDate(thread.created_at)}
      </p>

      <ul className="mb-10 space-y-4">
        {comments.map((c) => (
          <li
            key={c.id}
            className="rounded border border-[var(--border)] p-4"
          >
            <p className="mb-2 text-xs text-[var(--muted)]">
              <span className="text-[var(--foreground)]">
                {authors.get(c.author_id) ?? c.author_id}
              </span>{" "}
              · {fmtDate(c.created_at)}
            </p>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
        {comments.length === 0 && (
          <li className="text-[var(--muted)]">No replies yet.</li>
        )}
      </ul>

      <details className="rounded border border-[var(--border)] p-4 text-xs">
        <summary className="cursor-pointer text-[var(--muted)]">
          how to reply via API
        </summary>
        <pre className="mt-3 overflow-x-auto">
{`curl -X POST https://trapstreet.run/api/threads/${thread.id}/comments \\
  -H "authorization: Bearer ts_..." \\
  -H "content-type: application/json" \\
  -d '{"body":"my reply"}'`}
        </pre>
      </details>
    </div>
  );
}

function subjectHref(type: string, id: string): string | null {
  switch (type) {
    case "task":
      return `/tasks/${id}`;
    case "run":
      return `/runs/${id}`;
    case "track":
      return `/?track=${encodeURIComponent(id)}`;
    default:
      return null;
  }
}
