import { notFound } from "next/navigation";
import { getTask } from "@/lib/queries";

export default async function TaskRulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const task = await getTask(id);
  if (!task) notFound();

  if (!task.rules_md && !task.io_md) {
    return (
      <p className="text-[var(--muted)]">
        No rules or contract defined for this task yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {task.rules_md && (
        <section>
          <p className="mb-2 text-[10px] uppercase tracking-widest text-[var(--muted)]">
            rules
          </p>
          <div className="rounded border border-[var(--border)] p-6">
            <RulesBlock md={task.rules_md} />
          </div>
        </section>
      )}

      {task.io_md && (
        <section>
          <p className="mb-2 text-[10px] uppercase tracking-widest text-[var(--muted)]">
            inputs · outputs · scoring
          </p>
          <div className="rounded border border-[var(--border)] p-6">
            <RulesBlock md={task.io_md} />
          </div>
        </section>
      )}
    </div>
  );
}

// Inline Markdown renderer.
// Supports: ## h2, ### h3, - list, ``` fenced code, inline `code`, **bold**.
// No deps. ~80 lines.
function RulesBlock({ md }: { md: string }) {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let listBuf: string[] = [];
  let codeBuf: string[] | null = null; // null = not in a code block

  const flushList = () => {
    if (listBuf.length === 0) return;
    out.push(
      <ul key={`ul-${out.length}`} className="mb-3 list-disc space-y-1 pl-5">
        {listBuf.map((item, i) => (
          <li key={i} className="text-sm">
            {renderInline(item)}
          </li>
        ))}
      </ul>,
    );
    listBuf = [];
  };

  const flushCode = () => {
    if (codeBuf === null) return;
    out.push(
      <pre
        key={`pre-${out.length}`}
        className="mb-3 overflow-x-auto rounded border border-[var(--border)] bg-black/40 p-3 text-xs"
      >
        <code>{codeBuf.join("\n")}</code>
      </pre>,
    );
    codeBuf = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // fenced code block boundary
    if (line.startsWith("```")) {
      if (codeBuf === null) {
        flushList();
        codeBuf = [];
      } else {
        flushCode();
      }
      continue;
    }

    // inside a code block — collect verbatim
    if (codeBuf !== null) {
      codeBuf.push(raw);
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      out.push(
        <h2
          key={`h-${out.length}`}
          className="mb-2 mt-5 text-sm uppercase tracking-widest text-[var(--muted)] first:mt-0"
        >
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("### ")) {
      flushList();
      out.push(
        <h3
          key={`h-${out.length}`}
          className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-[var(--foreground)] first:mt-0"
        >
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith("- ")) {
      listBuf.push(line.slice(2));
    } else if (line === "") {
      flushList();
    } else {
      flushList();
      out.push(
        <p key={`p-${out.length}`} className="mb-2 text-sm">
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushList();
  flushCode();
  return <div>{out}</div>;
}

function renderInline(s: string): React.ReactNode[] {
  const tokens = s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((t, i) => {
    if (t.startsWith("`") && t.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-black/40 px-1 text-[var(--foreground)]"
        >
          {t.slice(1, -1)}
        </code>
      );
    }
    if (t.startsWith("**") && t.endsWith("**")) {
      return (
        <strong key={i} className="text-[var(--foreground)]">
          {t.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{t}</span>;
  });
}
