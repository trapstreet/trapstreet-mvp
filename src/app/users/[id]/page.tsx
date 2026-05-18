import Link from "next/link";
import { notFound } from "next/navigation";
import {
  listRunnersByUser,
  listTasksByUser,
  userById,
} from "@/lib/queries";

// Public profile for a trapstreet user. Reached from the "by xxx" line
// on task cards / leaderboard rows. Shows the tasks they've created
// and the runners they own.
export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await userById(id);
  if (!user) notFound();

  const [tasks, runners] = await Promise.all([
    listTasksByUser(id),
    listRunnersByUser(id),
  ]);

  return (
    <article className="max-w-3xl">
      <p className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">
        user
      </p>
      <h1 className="mb-1 text-2xl font-semibold">{user.name ?? "(no name)"}</h1>
      <p className="mb-10 text-xs text-[var(--muted)]">
        {providerLabel(user.id)}
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm uppercase tracking-widest text-[var(--muted)]">
          tasks created ({tasks.length})
        </h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Hasn&apos;t created any tasks yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="rounded border border-[var(--border)] p-3">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <Link
                    href={`/tasks/${t.id}`}
                    className="font-medium text-[var(--foreground)]"
                  >
                    {t.name}
                  </Link>
                  <span className="text-[10px] uppercase tracking-widest text-[var(--muted)]">
                    {t.visibility === "private" ? "private" : t.track}
                  </span>
                </div>
                {t.description && (
                  <p className="text-xs text-[var(--muted)]">{t.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm uppercase tracking-widest text-[var(--muted)]">
          runners ({runners.length})
        </h2>
        {runners.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No runners registered yet — sign in via the CLI with{" "}
            <code className="text-[var(--foreground)]">tp login</code>{" "}
            to create one.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {runners.map((r) => (
              <li key={r.id}>
                <Link href={`/runners/${r.id}`}>{r.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

// User ids are minted as `u_<provider>_<account_id>` by auth.ts — pull
// the provider out for a small label.
function providerLabel(userId: string): string {
  const m = /^u_([^_]+)_/.exec(userId);
  if (!m) return "trapstreet user";
  return `via ${m[1]}`;
}
