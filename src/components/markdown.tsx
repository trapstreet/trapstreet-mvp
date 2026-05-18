// Markdown renderer for task rules + docs. react-markdown + remark-gfm
// gives us tables, blockquotes, numbered lists, strikethrough, task
// lists, autolinks etc. for free. Components map each element to our
// tailwind tokens so the output matches the rest of the site.

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const COMPONENTS: Components = {
  h2: ({ children }) => (
    <h2 className="mb-3 mt-8 text-xl font-semibold text-[var(--foreground)] first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-5 text-base font-semibold text-[var(--foreground)]">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-relaxed">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-4 list-disc space-y-2 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-4 list-decimal space-y-2 pl-5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm leading-relaxed">{children}</li>
  ),
  // Inline code lives inside a `<p>` etc; block code is wrapped in a
  // `<pre>` so we style block via the `pre` mapping and let inline code
  // pass through plain `<code>` here.
  code: ({ children, className }) => {
    // remark gives fenced code blocks a `language-xxx` className on the
    // inner <code>; inline code has no className. Use that to switch.
    const isBlock = !!className;
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-black/40 px-1 text-[var(--foreground)]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded border border-[var(--border)] bg-black/40 p-3 text-xs">
      {children}
    </pre>
  ),
  a: ({ href, children }) => {
    const external = /^https?:\/\//.test(href ?? "");
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className="text-[var(--accent)] underline-offset-2 hover:underline"
      >
        {children}
      </a>
    );
  },
  strong: ({ children }) => (
    <strong className="text-[var(--foreground)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => (
    <del className="text-[var(--muted)] line-through">{children}</del>
  ),
  hr: () => <hr className="my-6 border-[var(--border)]" />,
  blockquote: ({ children }) => (
    <blockquote className="mb-4 border-l-2 border-[var(--accent)] pl-3 text-sm italic text-[var(--muted)]">
      {children}
    </blockquote>
  ),
  // GFM tables (from remark-gfm). Wrap in a scroll container so wide
  // tables don't blow up the layout on narrow screens.
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-widest text-[var(--muted)]">
      {children}
    </thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-[var(--border)]/40">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 font-medium align-top">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 align-top text-[var(--foreground)]">{children}</td>
  ),
};

export function MarkdownBlock({ md }: { md: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {md}
    </ReactMarkdown>
  );
}
