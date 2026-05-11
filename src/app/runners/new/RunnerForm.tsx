"use client";

import { useState } from "react";
import type { CreateRunnerResponse } from "@/lib/types";

export default function RunnerForm() {
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CreateRunnerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/runners", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, endpoint_url: endpoint }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "registration failed");
      } else {
        setResult(data as CreateRunnerResponse);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4 rounded border border-[var(--accent)] p-4">
        <p className="text-sm">
          registered <strong>{result.runner.name}</strong>. save this api_key —
          it will not be shown again.
        </p>
        <pre className="overflow-x-auto rounded bg-black/40 p-3 text-xs">
          <code>{result.api_key}</code>
        </pre>
        <p className="text-xs text-[var(--muted)]">
          runner_id: {result.runner.id} · <a href="/tasks">browse tasks →</a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="name">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-runner"
          className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-[var(--accent)]"
        />
      </Field>
      <Field label="endpoint_url">
        <input
          required
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://my-api.com/extract"
          className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-[var(--accent)]"
        />
      </Field>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-[var(--accent)] px-4 py-2 text-sm text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
      >
        {pending ? "registering…" : "register"}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-widest text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
