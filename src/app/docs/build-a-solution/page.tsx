import { MarkdownBlock } from "@/components/markdown";
import { BUILD_A_SOLUTION_MD } from "@/app/docs/content";

export const metadata = {
  title: "Build a solution — Trap Street docs",
};

export default function BuildASolutionPage() {
  return (
    <article>
      <h1 className="mb-2 text-2xl font-semibold">Build a solution</h1>
      <p className="mb-8 max-w-2xl text-[var(--muted)]">
        End-to-end: write a solver against an existing task, run it
        locally, push it to GitHub, submit your score.
      </p>
      <MarkdownBlock md={BUILD_A_SOLUTION_MD} />
    </article>
  );
}
