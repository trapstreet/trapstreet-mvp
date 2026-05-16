import { notFound } from "next/navigation";
import { getTask } from "@/lib/queries";
import {
  fetchRaw,
  fetchTaskTree,
  parseTraptaskCases,
  type TaskCase,
  type TreeEntry,
} from "@/lib/github-task";

// Hard caps so a task with 50 cases × 30 files doesn't burn the request.
const MAX_CASES = 3;
const MAX_FILES_PER_DIR = 5;

export default async function TaskCasesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const task = await getTask(id);
  if (!task) notFound();

  let yaml: string | null = null;
  let tree: TreeEntry[] = [];
  let fetchError: string | null = null;

  try {
    [yaml, tree] = await Promise.all([
      fetchRaw(task.traptask_ref, "traptask.yaml"),
      fetchTaskTree(task.traptask_ref),
    ]);
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e);
  }

  const ghHref = traptaskGithubHref(task.traptask_ref);

  if (fetchError) {
    return (
      <NoCases>
        Couldn&apos;t fetch from GitHub ({fetchError}). View the source
        on <a href={ghHref}>GitHub</a> directly.
      </NoCases>
    );
  }
  if (!yaml) {
    return (
      <NoCases>
        No <code>traptask.yaml</code> at{" "}
        <a href={ghHref}>{task.traptask_ref}</a>.
      </NoCases>
    );
  }

  const allCases = parseTraptaskCases(yaml);
  if (allCases.length === 0) {
    return (
      <NoCases>
        Found <code>traptask.yaml</code> but couldn&apos;t parse any cases
        out of it. <a href={ghHref}>View source</a>.
      </NoCases>
    );
  }

  const shown = allCases.slice(0, MAX_CASES);

  return (
    <div className="space-y-10">
      <p className="text-xs text-[var(--muted)]">
        Showing {shown.length} of {allCases.length}{" "}
        {allCases.length === 1 ? "case" : "cases"} from{" "}
        <code className="text-[var(--foreground)]">traptask.yaml</code>.{" "}
        <a href={ghHref} target="_blank" rel="noreferrer">
          See all on GitHub →
        </a>
      </p>

      {shown.map((c) => (
        <CaseBlock
          key={c.id}
          c={c}
          tree={tree}
          taskRef={task.traptask_ref}
        />
      ))}
    </div>
  );
}

async function CaseBlock({
  c,
  tree,
  taskRef,
}: {
  c: TaskCase;
  tree: TreeEntry[];
  taskRef: string;
}) {
  const inputs = tree
    .filter((t) => t.type === "blob" && t.path.startsWith(`inputs/${c.id}/`))
    .slice(0, MAX_FILES_PER_DIR);
  const expected = tree
    .filter((t) => t.type === "blob" && t.path.startsWith(`expected/${c.id}/`))
    .slice(0, MAX_FILES_PER_DIR);

  const [inputContents, expectedContents] = await Promise.all([
    Promise.all(
      inputs.map(async (f) => ({
        name: f.path.slice(`inputs/${c.id}/`.length),
        content: await fetchRaw(taskRef, f.path),
      })),
    ),
    Promise.all(
      expected.map(async (f) => ({
        name: f.path.slice(`expected/${c.id}/`.length),
        content: await fetchRaw(taskRef, f.path),
      })),
    ),
  ]);

  return (
    <section className="rounded border border-[var(--border)] p-6">
      <h2 className="mb-1 font-mono text-base text-[var(--foreground)]">
        {c.id}
      </h2>
      {c.description && (
        <p className="mb-4 text-sm text-[var(--muted)]">{c.description}</p>
      )}

      <FileList title="inputs" files={inputContents} caseId={c.id} kind="inputs" />
      <FileList
        title="expected"
        files={expectedContents}
        caseId={c.id}
        kind="expected"
      />
    </section>
  );
}

function FileList({
  title,
  files,
  caseId,
  kind,
}: {
  title: string;
  files: { name: string; content: string | null }[];
  caseId: string;
  kind: "inputs" | "expected";
}) {
  if (files.length === 0) {
    return (
      <p className="mb-3 text-xs text-[var(--muted)]">
        No <code>{kind}/{caseId}/</code> files in the source tree.
      </p>
    );
  }
  return (
    <div className="mb-4">
      <p className="mb-2 text-[10px] uppercase tracking-widest text-[var(--muted)]">
        {title}
      </p>
      <div className="space-y-3">
        {files.map((f) => (
          <div key={f.name}>
            <p className="mb-1 font-mono text-[11px] text-[var(--muted)]">
              {f.name}
            </p>
            <pre className="overflow-x-auto rounded border border-[var(--border)] bg-black/40 p-3 text-xs">
              <code>{f.content ?? "(could not fetch)"}</code>
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function NoCases({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--muted)]">{children}</p>;
}

function traptaskGithubHref(ref: string): string {
  const parts = ref.split("/").filter(Boolean);
  if (parts.length <= 2) return `https://github.com/${ref}`;
  const [owner, repo, ...rest] = parts;
  return `https://github.com/${owner}/${repo}/tree/main/${rest.join("/")}`;
}
