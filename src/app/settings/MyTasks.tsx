"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface TaskRow {
  id: string;
  name: string;
  track: string;
  visibility: "public" | "private";
}

export default function MyTasks({ tasks }: { tasks: TaskRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (
      !confirm(
        `Delete task "${id}"? This also removes every run and case submitted against it. Can't be undone.`,
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      const text = await res.text();
      let data: { error?: string } | null = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // not JSON — fall through to status-based message
      }
      if (!res.ok) {
        setError(
          data?.error ?? (text ? text.slice(0, 200) : `HTTP ${res.status}`),
        );
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        You haven&apos;t created any tasks yet.{" "}
        <Link href="/tasks/new">Create one →</Link>
      </p>
    );
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>id</th>
            <th>name</th>
            <th>track</th>
            <th>visibility</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>
                <Link href={`/tasks/${t.id}`}>{t.id}</Link>
              </td>
              <td className="text-[var(--muted)]">{t.name}</td>
              <td className="text-[var(--muted)]">{t.track}</td>
              <td className="text-[var(--muted)]">{t.visibility}</td>
              <td>
                <button
                  type="button"
                  onClick={() => handleDelete(t.id)}
                  disabled={busyId === t.id}
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  {busyId === t.id ? "deleting…" : "delete"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
