"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { prefillTaskAction } from "./actions";

const METRICS = [
  { value: "total_score", label: "score (higher better)" },
  { value: "latency_ms", label: "latency_ms (lower better)" },
  { value: "cost_usd", label: "cost_usd (lower better)" },
  { value: "cases_passed", label: "cases_passed (higher better)" },
] as const;

export default function TaskForm({
  existingTracks = [],
}: {
  existingTracks?: string[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefillUrl, setPrefillUrl] = useState("");
  const [prefilling, setPrefilling] = useState(false);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const [form, setForm] = useState({
    id: "",
    name: "",
    track: "",
    description: "",
    traptask_ref: "",
    ranking_metric: "total_score",
    ranking_direction: "desc" as "asc" | "desc",
    rules_md: "",
    visibility: "public" as "public" | "private",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handlePrefill() {
    if (!prefillUrl.trim()) return;
    setPrefilling(true);
    setPrefillNote(null);
    try {
      const { result, warning } = await prefillTaskAction(prefillUrl);
      setForm((prev) => ({
        ...prev,
        id: result.id ?? prev.id,
        name: result.name ?? prev.name,
        track: result.track ?? prev.track,
        description: result.description ?? prev.description,
        traptask_ref: result.traptask_ref ?? prev.traptask_ref,
        rules_md: result.rules_md ?? prev.rules_md,
      }));
      // Expand the optional drawer so the user can see what we filled there.
      if (result.rules_md) {
        setShowOptional(true);
      }
      const filled = [
        "id",
        "name",
        "track",
        "description",
        "traptask_ref",
        "rules_md",
      ]
        .filter((k) => result[k as keyof typeof result])
        .join(", ");
      setPrefillNote(
        warning ??
          (filled ? `Filled ${filled}. Review + tweak before creating.` : null),
      );
    } catch (e) {
      setPrefillNote(
        e instanceof Error ? `Couldn't fetch: ${e.message}` : "Prefill failed.",
      );
    } finally {
      setPrefilling(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "task creation failed");
      } else {
        router.push(`/tasks/${data.task.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  function onMetricChange(v: string) {
    set("ranking_metric", v);
    const isLowerBetter = v === "latency_ms" || v === "cost_usd";
    set("ranking_direction", isLowerBetter ? "asc" : "desc");
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* ─── auto-fill ────────────────────────────────────────────── */}
      <section className="rounded border border-[var(--border)] p-4">
        <p className="mb-1 text-[10px] uppercase tracking-widest text-[var(--accent)]">
          paste a GitHub task URL to auto-fill
        </p>
        <p className="mb-3 text-xs text-[var(--muted)]">
          We&apos;ll parse the URL + read the repo&apos;s README to
          prefill id, name, track, description, traptask_ref, and rules. You
          review + tweak below.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={prefillUrl}
            onChange={(e) => setPrefillUrl(e.target.value)}
            placeholder="https://github.com/org/repo/tree/main/tasks/your-task"
            className="flex-1 rounded border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={handlePrefill}
            disabled={prefilling || !prefillUrl.trim()}
            className="rounded border border-[var(--accent)] px-4 py-2 text-sm text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
          >
            {prefilling ? "fetching…" : "auto-fill"}
          </button>
        </div>
        {prefillNote && (
          <p className="mt-2 text-xs text-[var(--muted)]">{prefillNote}</p>
        )}
      </section>

      {/* ─── required ─────────────────────────────────────────────── */}
      <section>
        <p className="mb-3 text-[10px] uppercase tracking-widest text-[var(--muted)]">
          required
        </p>
        <div className="space-y-5">
          <Row label="id" required hint="lowercase / digits / dashes. shows in URL: /tasks/<id>">
            <input
              required
              pattern="[a-z0-9-]+"
              placeholder="my-task"
              value={form.id}
              onChange={(e) => set("id", e.target.value)}
              className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-[var(--accent)] invalid:border-red-500"
            />
          </Row>

          <Row label="name" required>
            <input
              required
              placeholder="A short, human-readable title"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-[var(--accent)] invalid:border-red-500"
            />
          </Row>

          <Row
            label="traptask_ref"
            required
            hint="GitHub path: org/repo/path/to/task — auto-filled if you used the URL above"
          >
            <input
              required
              placeholder="AntiNoise-ai/trapstreet-tasks/tasks/<your-task>"
              value={form.traptask_ref}
              onChange={(e) => set("traptask_ref", e.target.value)}
              className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-[var(--accent)] invalid:border-red-500"
            />
          </Row>
        </div>
      </section>

      {/* ─── optional ─────────────────────────────────────────────── */}
      <details
        open={showOptional}
        onToggle={(e) => setShowOptional((e.target as HTMLDetailsElement).open)}
        className="rounded border border-[var(--border)]"
      >
        <summary className="cursor-pointer list-none p-4 text-[10px] uppercase tracking-widest text-[var(--muted)] [&::-webkit-details-marker]:hidden">
          {showOptional ? "▾" : "▸"} optional — defaults work for most tasks
        </summary>
        <div className="space-y-5 border-t border-[var(--border)] p-4">
          <Row
            label="track"
            hint={
              existingTracks.length > 0
                ? `groups in the home grid. existing: ${existingTracks.join(", ")}. blank → "community".`
                : "groups in the home grid. blank → defaults to 'community'."
            }
          >
            <input
              list="existing-tracks"
              placeholder="examples"
              value={form.track}
              onChange={(e) => set("track", e.target.value)}
              className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
            <datalist id="existing-tracks">
              {existingTracks.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Row>

          <Row label="description" hint="one-line summary shown on the home grid">
            <textarea
              rows={2}
              placeholder="One-liner describing what this task tests"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
          </Row>

          <Row label="ranking metric" hint="how the leaderboard sorts">
            <select
              value={form.ranking_metric}
              onChange={(e) => onMetricChange(e.target.value)}
              className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-[var(--accent)]"
            >
              {METRICS.map((m) => (
                <option
                  key={m.value}
                  value={m.value}
                  className="bg-[var(--background)]"
                >
                  {m.label}
                </option>
              ))}
            </select>
          </Row>

          <Row label="rules" hint="Markdown: ## h2, - list, ``` fences, **bold**, `code`">
            <textarea
              rows={6}
              placeholder={"## Rules\n\n- Rule one\n- Rule two"}
              value={form.rules_md}
              onChange={(e) => set("rules_md", e.target.value)}
              className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-[var(--accent)]"
            />
          </Row>

          <Row label="visibility">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={form.visibility === "public"}
                  onChange={() => set("visibility", "public")}
                />
                <span>public</span>
                <span className="text-[var(--muted)]">— in home grid</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={form.visibility === "private"}
                  onChange={() => set("visibility", "private")}
                />
                <span>private</span>
                <span className="text-[var(--muted)]">— only you</span>
              </label>
            </div>
          </Row>
        </div>
      </details>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded border border-[var(--accent)] px-5 py-2 text-sm text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
      >
        {pending ? "creating…" : "create task"}
      </button>
    </form>
  );
}

function Row({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-widest text-[var(--muted)]">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[11px] text-[var(--muted)]">
          {hint}
        </span>
      )}
    </label>
  );
}
