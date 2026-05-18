import Link from "next/link";
import type { LeaderboardRow } from "@/lib/queries";
import { fmtRelativeTime } from "@/lib/format";

// ProfileList — leaderboard-shaped table for no_ranking (classification /
// self-profile) tasks. Walks each row's grader_metrics jsonb, discovers
// the leaf keys across the union, and renders one sortable column per
// leaf. Zero task-specific code: a new classification task that emits
// any metric shape renders automatically.
//
// Server component. URL-driven sort (?sort=<leaf-path>&dir=<asc|desc>),
// fully client-side ordering applied after fetch (no_ranking sample sizes
// are small, so SQL sort would over-engineer).

export type Direction = "asc" | "desc";

interface Column {
  // Dot-separated leaf path inside the merged metrics dict (e.g.
  // "percentages.E_I.I", "mbti_type"). For axis_pair columns this is
  // the PARENT path of the two leaves (e.g. "percentages.E_I").
  path: string;
  // Header label. Drops uninteresting namespace prefixes like
  // "percentages." for compactness.
  label: string;
  type: "string" | "number" | "number_percent" | "boolean" | "axis_pair";
  // axis_pair only: two numeric sibling leaves whose values sum to ~100
  // across all rows (E.g. E_I.E + E_I.I = 100). Rendered as a single
  // diverging cell; sorting uses leftKey's value.
  pair?: { leftKey: string; rightKey: string };
}

// Keys that are either already shown as denormalized columns above, or
// are wire-format housekeeping the user doesn't need to see.
const SKIP_LEAVES = new Set([
  "score",
  "passed",
  "n_passed",
  "n_total",
  "n_scored",
  "n_skipped",
  "n_skipped_no_gold",
  "n_questions",
  "latency_ms_total",
  "latency_ms_median",
  "latency_ms_p95",
  "cost_usd_total",
  "tokens_total",
  "threshold",
  "by_category",
  "by_category.personality",
  // judge.py per-case fields that aren't comparable / interesting in
  // the grid:
  "matcher_results", // array of per-check {pass, reason} — not summable
  "raw_responses", // array — too big for a cell anyway
  "agent_answer", // verbatim solver stdout — explodes the column
  "id", // case id; same per row, no signal
  "category", // case metadata; same per row
  "difficulty", // case metadata; same per row
]);

// Top-level namespace prefixes to drop from labels (so
// "percentages.E_I.I" displays as "E_I.I", not the whole long path).
const SKIP_NAMESPACE = new Set([
  "percentages",
  "bias_stats",
  "metrics",
  "stats",
]);

const SCORED_AT: Column = { path: "scored_at", label: "submitted", type: "string" };

export function ProfileList({
  entries,
  taskId,
  sortKey,
  sortDir,
}: {
  entries: LeaderboardRow[];
  taskId: string;
  sortKey: string | null;
  sortDir: Direction;
}) {
  const columns = discoverColumns(entries);
  const sorted = applySort(entries, sortKey, sortDir);

  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>solution</th>
          {columns.map((col) => (
            <SortHeader
              key={col.path}
              col={col}
              activeSort={sortKey}
              activeDir={sortDir}
              taskId={taskId}
            />
          ))}
          <SortHeader
            col={SCORED_AT}
            activeSort={sortKey}
            activeDir={sortDir}
            taskId={taskId}
          />
        </tr>
      </thead>
      <tbody>
        {sorted.map((row, i) => (
          <tr key={row.run_id}>
            <td className="text-[var(--muted)]">{i + 1}</td>
            <td className="font-medium">
              <Link href={`/solutions/${row.solution_id}`}>
                {row.solution_name}
              </Link>
              <SolutionSubline e={row} />
            </td>
            {columns.map((col) => (
              <td key={col.path}>
                <MetricCell col={col} row={row} />
              </td>
            ))}
            <td className="text-[var(--muted)]">
              <Link href={`/runs/${row.run_id}`}>
                {fmtRelativeTime(row.scored_at)}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// -- column discovery --------------------------------------------------------

// Merge run-level summary (grader_metrics) and the first case's judge
// metrics (case_metrics[0]) into one bucket. Case-level fields win on
// key collision — they're the richer source for self-profile tasks.
function mergedMetrics(row: LeaderboardRow): Record<string, unknown> | null {
  const caseM = row.case_metrics && row.case_metrics[0] ? row.case_metrics[0] : null;
  if (!row.grader_metrics && !caseM) return null;
  return { ...(row.grader_metrics ?? {}), ...(caseM ?? {}) };
}

function discoverColumns(entries: LeaderboardRow[]): Column[] {
  // Path → first non-null example value (for type inference).
  const paths = new Map<string, unknown>();
  for (const e of entries) {
    const m = mergedMetrics(e);
    if (!m) continue;
    walkLeaves(m, "", (path, value) => {
      const leaf = path.split(".").pop()!;
      if (SKIP_LEAVES.has(leaf) || SKIP_LEAVES.has(path)) return;
      // Skip arrays — too big for a cell. (E.g. raw_responses: [32 ints].)
      if (Array.isArray(value)) return;
      // Keep the first non-null sample for type inference.
      const prev = paths.get(path);
      if (prev == null && value != null) {
        paths.set(path, value);
      } else if (!paths.has(path)) {
        paths.set(path, value);
      }
    });
  }
  const flat: Column[] = [...paths.entries()].map(([path, example]) => ({
    path,
    label: shortenPath(path),
    type: inferType(path, example),
  }));
  // Collapse sibling numeric pairs that always sum to ~100 — e.g. for
  // MBTI: percentages.E_I.E + percentages.E_I.I always = 100, so we
  // render one combined axis cell instead of two redundant columns.
  return collapseAxisPairs(flat, entries).sort(byLabelGroup);
}

// If two sibling leaves at the same parent path are both numeric AND
// across every row their values sum to ~100, fold them into a single
// "axis_pair" column. Generic — applies to any percentage-axis shape.
function collapseAxisPairs(
  columns: Column[],
  rows: LeaderboardRow[],
): Column[] {
  // Group by parent path.
  const byParent = new Map<string, Column[]>();
  for (const c of columns) {
    const dot = c.path.lastIndexOf(".");
    if (dot < 0) continue;
    if (c.type !== "number" && c.type !== "number_percent") continue;
    const parent = c.path.slice(0, dot);
    const group = byParent.get(parent) ?? [];
    group.push(c);
    byParent.set(parent, group);
  }

  const collapseable = new Map<
    string,
    { leftKey: string; rightKey: string }
  >();
  for (const [parent, children] of byParent) {
    if (children.length !== 2) continue;
    const [a, b] = children;
    let sawSample = false;
    let allSumTo100 = true;
    for (const row of rows) {
      const m = mergedMetrics(row);
      const av = getPath(m, a.path);
      const bv = getPath(m, b.path);
      if (typeof av !== "number" || typeof bv !== "number") continue;
      sawSample = true;
      if (Math.abs(av + bv - 100) > 0.5) {
        allSumTo100 = false;
        break;
      }
    }
    if (!sawSample || !allSumTo100) continue;
    const aLeaf = a.path.slice(parent.length + 1);
    const bLeaf = b.path.slice(parent.length + 1);
    // Stable left/right order by leaf name (alphabetical).
    const [leftKey, rightKey] =
      aLeaf < bLeaf ? [aLeaf, bLeaf] : [bLeaf, aLeaf];
    collapseable.set(parent, { leftKey, rightKey });
  }

  // Replace child columns with a single axis_pair column per parent.
  const seen = new Set<string>();
  const out: Column[] = [];
  for (const c of columns) {
    const dot = c.path.lastIndexOf(".");
    const parent = dot < 0 ? "" : c.path.slice(0, dot);
    if (parent && collapseable.has(parent)) {
      if (!seen.has(parent)) {
        out.push({
          path: parent,
          label: shortenPath(parent),
          type: "axis_pair",
          pair: collapseable.get(parent)!,
        });
        seen.add(parent);
      }
      continue;
    }
    out.push(c);
  }
  return out;
}

// Group columns: strings first, then axis pairs, then plain numbers,
// booleans last. Categorical lead, flags trail.
function byLabelGroup(a: Column, b: Column): number {
  const order = {
    string: 0,
    axis_pair: 1,
    number_percent: 2,
    number: 3,
    boolean: 4,
  } as const;
  const ord = order[a.type] - order[b.type];
  if (ord !== 0) return ord;
  return a.label.localeCompare(b.label);
}

function walkLeaves(
  obj: unknown,
  prefix: string,
  cb: (path: string, value: unknown) => void,
): void {
  if (obj === null || obj === undefined) {
    cb(prefix, obj);
    return;
  }
  if (typeof obj !== "object" || Array.isArray(obj)) {
    cb(prefix, obj);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    walkLeaves(v, prefix ? `${prefix}.${k}` : k, cb);
  }
}

function getPath(obj: Record<string, unknown> | null, path: string): unknown {
  if (!obj) return null;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && !Array.isArray(acc)) {
      return (acc as Record<string, unknown>)[key];
    }
    return null;
  }, obj);
}

function shortenPath(path: string): string {
  const parts = path.split(".");
  if (parts.length > 1 && SKIP_NAMESPACE.has(parts[0])) {
    return parts.slice(1).join(".");
  }
  return path;
}

function inferType(path: string, value: unknown): Column["type"] {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") {
    // Path-based heuristic: numbers nested under a "percentages" namespace
    // (or with names like "pct_*" or "*_pct") are 0-100 percents and get
    // a mini bar. Everything else is a plain number.
    const lower = path.toLowerCase();
    if (
      lower.startsWith("percentages.") ||
      lower.includes(".pct_") ||
      lower.startsWith("pct_") ||
      lower.endsWith("_pct")
    ) {
      return "number_percent";
    }
    return "number";
  }
  return "string";
}

// -- sort --------------------------------------------------------------------

function applySort(
  entries: LeaderboardRow[],
  sortKey: string | null,
  sortDir: Direction,
): LeaderboardRow[] {
  const dirMul = sortDir === "asc" ? 1 : -1;
  // Default: newest first.
  if (!sortKey || sortKey === "scored_at") {
    return [...entries].sort((a, b) => {
      const at = new Date(a.scored_at).getTime();
      const bt = new Date(b.scored_at).getTime();
      // For chronological default, desc means newest first.
      const useDir = sortKey === "scored_at" ? dirMul : -1;
      return (at - bt) * useDir;
    });
  }
  return [...entries].sort((a, b) => {
    const av = getPath(mergedMetrics(a), sortKey);
    const bv = getPath(mergedMetrics(b), sortKey);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls last regardless of direction
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * dirMul;
    }
    return String(av).localeCompare(String(bv)) * dirMul;
  });
}

// -- header cells ------------------------------------------------------------

function SortHeader({
  col,
  activeSort,
  activeDir,
  taskId,
}: {
  col: Column;
  activeSort: string | null;
  activeDir: Direction;
  taskId: string;
}) {
  // For axis_pair, we sort on the left leaf's value — the parent path
  // itself points at an object so a direct comparison would degrade.
  const sortPath =
    col.type === "axis_pair" && col.pair
      ? `${col.path}.${col.pair.leftKey}`
      : col.path;
  const active = sortPath === activeSort;
  // Natural default per type: numbers want desc (big first), strings want
  // asc (A→Z), submitted wants desc (newest first).
  const defaultDir: Direction =
    col.type === "string" && col.path !== "scored_at" ? "asc" : "desc";
  const nextDir: Direction = active
    ? activeDir === "desc"
      ? "asc"
      : "desc"
    : defaultDir;
  // Clicking the active column back to its default state clears the URL.
  const goingBackToDefault =
    active && col.path === "scored_at" && nextDir === "desc";
  const href = goingBackToDefault
    ? `/tasks/${taskId}`
    : `/tasks/${taskId}?sort=${encodeURIComponent(sortPath)}&dir=${nextDir}`;
  const arrow = active ? (activeDir === "desc" ? " ↓" : " ↑") : "";
  return (
    <th>
      <Link
        href={href}
        className={
          "hover:no-underline " +
          (active
            ? "text-[var(--accent)]"
            : "text-[var(--muted)] hover:text-[var(--foreground)]")
        }
      >
        {col.label}
        {arrow}
      </Link>
    </th>
  );
}

// -- value cells -------------------------------------------------------------

function MetricCell({ col, row }: { col: Column; row: LeaderboardRow }) {
  const merged = mergedMetrics(row);
  if (col.type === "axis_pair" && col.pair) {
    const left = getPath(merged, `${col.path}.${col.pair.leftKey}`);
    const right = getPath(merged, `${col.path}.${col.pair.rightKey}`);
    if (typeof left !== "number" || typeof right !== "number") {
      return <span className="text-[var(--muted)]">—</span>;
    }
    return <AxisPairCell left={left} right={right} pair={col.pair} />;
  }

  const value = getPath(merged, col.path);
  if (value === null || value === undefined) {
    return <span className="text-[var(--muted)]">—</span>;
  }
  switch (col.type) {
    case "string":
      return (
        <span className="font-mono text-xs uppercase">{String(value)}</span>
      );
    case "number_percent":
      return <NumberWithBar value={Number(value)} />;
    case "number":
      return (
        <span>
          {typeof value === "number"
            ? Number.isInteger(value)
              ? value
              : value.toFixed(1)
            : String(value)}
        </span>
      );
    case "boolean":
      return value ? (
        <span className="text-yellow-400" title="flag set">
          ⚠
        </span>
      ) : (
        <span className="text-[var(--muted)]">—</span>
      );
  }
}

// Diverging cell for a 2-letter axis (E_I, S_N, T_F, J_P). Left letter
// label + value, a centered bar showing the split, then right value +
// right letter label. Bar fill represents the LEFT side's share.
function AxisPairCell({
  left,
  right,
  pair,
}: {
  left: number;
  right: number;
  pair: { leftKey: string; rightKey: string };
}) {
  const leftPct = Math.min(100, Math.max(0, left));
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap text-xs">
      <span className="text-[var(--muted)]">{pair.leftKey}</span>
      <span className="w-6 text-right tabular-nums">{Math.round(left)}</span>
      <span className="relative inline-block h-1 w-12 overflow-hidden rounded bg-[var(--border)]">
        <span
          className="absolute inset-y-0 left-0 bg-[var(--accent)]"
          style={{ width: `${leftPct}%` }}
        />
      </span>
      <span className="w-6 tabular-nums">{Math.round(right)}</span>
      <span className="text-[var(--muted)]">{pair.rightKey}</span>
    </span>
  );
}

function NumberWithBar({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
      <span className="inline-block w-6 text-right tabular-nums">
        {Math.round(value)}
      </span>
      <span className="relative inline-block h-1 w-10 overflow-hidden rounded bg-[var(--border)]">
        <span
          className="absolute inset-y-0 left-0 bg-[var(--accent)]"
          style={{ width: `${clamped}%` }}
        />
      </span>
    </span>
  );
}

// -- solution subline (mirrors leaderboard page) -----------------------------

function SolutionSubline({ e }: { e: LeaderboardRow }) {
  const repo = extractRepo(e.metadata);
  if (!e.user_name && !repo) return null;
  return (
    <div className="text-[11px] font-normal text-[var(--muted)]">
      {e.user_name && <>by {e.user_name}</>}
      {e.user_name && repo && <span className="px-1">·</span>}
      {repo && (
        <a
          href={repo.url}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent)] underline-offset-2 hover:underline"
        >
          {repo.label} ↗
        </a>
      )}
    </div>
  );
}

function extractRepo(
  metadata: Record<string, unknown> | null,
): { url: string; label: string } | null {
  if (!metadata) return null;
  const raw = metadata.repo ?? metadata.source ?? metadata.repo_url;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const parts = trimmed
      .replace(/^https?:\/\//i, "")
      .split("/")
      .filter(Boolean);
    const label = parts.slice(1, 3).join("/") || "source";
    return { url: trimmed, label };
  }
  const stripped = trimmed.replace(/^github\.com\//i, "");
  const parts = stripped.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const ownerRepo = parts.slice(0, 2).join("/");
  return { url: `https://github.com/${ownerRepo}`, label: ownerRepo };
}
