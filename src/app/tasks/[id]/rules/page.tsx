import { notFound } from "next/navigation";
import { getTask } from "@/lib/queries";
import { MarkdownBlock } from "@/components/markdown";

export default async function TaskRulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const task = await getTask(id);
  if (!task) notFound();

  if (!task.rules_md) {
    return (
      <p className="text-[var(--muted)]">
        No rules defined for this task yet.
      </p>
    );
  }

  return (
    <div className="rounded border border-[var(--border)] p-6">
      <MarkdownBlock md={task.rules_md} />
    </div>
  );
}
