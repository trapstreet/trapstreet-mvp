"use client";

import { useState } from "react";

// Pre + code block with a copy button. Used wherever we show a shell
// command users are meant to paste into their terminal (task page,
// home quick-start, etc).
//
// Falls back gracefully if navigator.clipboard is unavailable (older
// browsers, insecure contexts).
export function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older browsers / insecure contexts — best effort, ignore
    }
  }

  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded border border-[var(--border)] bg-black/40 p-5 pr-20 text-sm leading-7 md:text-[15px]">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label="copy to clipboard"
        className={
          "absolute right-3 top-3 rounded border px-2.5 py-1 text-[11px] uppercase tracking-widest transition " +
          (copied
            ? "border-[var(--accent)] text-[var(--accent)]"
            : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]")
        }
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
