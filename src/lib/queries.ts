import { cache } from "react";
import { and, asc, desc, eq, inArray, or, sql as raw, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  cases,
  comments,
  runs,
  solutions,
  tasks,
  threads,
  users,
  type CaseRow,
  type RankingDirection,
  type RankingMetric,
  type RunRow,
  type TaskRow,
  type TaskVisibility,
} from "@/db/schema";

// -----------------------------------------------------------------------------
// id helpers

let counter = 0;
export function uid(prefix = ""): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}-${counter.toString(36)}`;
}

// -----------------------------------------------------------------------------
// tasks

// listTasks honours visibility: anonymous viewers see public-only;
// signed-in viewers see public + their own private tasks.
export async function listTasks(filter: {
  track?: string;
  viewer_id?: string | null;
}): Promise<TaskRow[]> {
  const visibilityClause = filter.viewer_id
    ? or(
        eq(tasks.visibility, "public"),
        eq(tasks.created_by, filter.viewer_id),
      )
    : eq(tasks.visibility, "public");
  const where = filter.track
    ? and(visibilityClause, eq(tasks.track, filter.track))
    : visibilityClause;
  return db.select().from(tasks).where(where);
}

// React `cache` dedupes calls within a single request — layout + page +
// metadata can all call getTask(id) without N round-trips to Neon.
export const getTask = cache(
  async (id: string): Promise<TaskRow | null> => {
    const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return rows[0] ?? null;
  },
);

export async function listTracks(): Promise<string[]> {
  const rows = await db.selectDistinct({ track: tasks.track }).from(tasks);
  return rows.map((r) => r.track).sort();
}

// Group tasks by track for the home grid. Visibility-aware.
export async function tasksByTrack(viewerId: string | null): Promise<Map<string, TaskRow[]>> {
  const visibilityClause = viewerId
    ? or(
        eq(tasks.visibility, "public"),
        eq(tasks.created_by, viewerId),
      )
    : eq(tasks.visibility, "public");
  const all = await db
    .select()
    .from(tasks)
    .where(visibilityClause)
    .orderBy(asc(tasks.track), asc(tasks.id));
  const map = new Map<string, TaskRow[]>();
  for (const t of all) {
    if (!map.has(t.track)) map.set(t.track, []);
    map.get(t.track)!.push(t);
  }
  return map;
}

// Lookup display names for a batch of user_ids (for "by @username" badges).
export async function userNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(or(...unique.map((id) => eq(users.id, id))));
  const m = new Map<string, string>();
  for (const r of rows) {
    m.set(r.id, r.name ?? r.email ?? r.id);
  }
  return m;
}

export async function createTask(input: {
  id: string;
  name: string;
  track: string;
  description: string;
  traptask_ref: string;
  ranking_metric: RankingMetric;
  ranking_direction: RankingDirection;
  rules_md: string;
  io_md: string;
  visibility: TaskVisibility;
  created_by: string;
}): Promise<TaskRow> {
  const [row] = await db.insert(tasks).values(input).returning();
  return row;
}

// Tasks owned by a specific user, for the /settings management list.
// Includes both public and private tasks they created.
export async function listTasksByUser(userId: string): Promise<TaskRow[]> {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.created_by, userId))
    .orderBy(asc(tasks.id));
}

// Cascade FKs on runs/cases handle the rest. Caller must verify
// ownership before calling — this is a raw delete.
export async function deleteTask(id: string): Promise<void> {
  await db.delete(tasks).where(eq(tasks.id, id));
}

// Best score (and run count) per task — for the task grid summary.
// best_solution_id is included so the home grid can link the world-record
// row directly to /solutions/<id>.
export interface TaskStat {
  runs: number;
  best_score: number | null;
  best_solution: string | null;
  best_solution_id: string | null;
}

export async function taskStats(): Promise<Map<string, TaskStat>> {
  const rows = await db
    .select({
      task_id: runs.task_id,
      solution_id: runs.solution_id,
      solution_name: solutions.name,
      total_score: runs.total_score,
    })
    .from(runs)
    .innerJoin(solutions, eq(solutions.id, runs.solution_id))
    .where(eq(runs.status, "scored"));

  const map = new Map<string, TaskStat>();
  for (const r of rows) {
    const cur = map.get(r.task_id) ?? {
      runs: 0,
      best_score: null,
      best_solution: null,
      best_solution_id: null,
    };
    cur.runs += 1;
    if (
      r.total_score !== null &&
      (cur.best_score === null || r.total_score > cur.best_score)
    ) {
      cur.best_score = r.total_score;
      cur.best_solution = r.solution_name;
      cur.best_solution_id = r.solution_id;
    }
    map.set(r.task_id, cur);
  }
  return map;
}

// Minimal lookup for the /users/[id] profile page.
export interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export async function userById(id: string): Promise<UserRow | null> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// -----------------------------------------------------------------------------
// solutions + auth

export async function getSolutionByApiKey(apiKey: string) {
  const rows = await db
    .select()
    .from(solutions)
    .where(eq(solutions.api_key, apiKey))
    .limit(1);
  return rows[0] ?? null;
}

export async function authSolution(authHeader: string | null) {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/.exec(authHeader);
  if (!m) return null;
  return getSolutionByApiKey(m[1]);
}

export async function getSolutionById(id: string) {
  const rows = await db
    .select()
    .from(solutions)
    .where(eq(solutions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSolutionByName(name: string) {
  const rows = await db
    .select()
    .from(solutions)
    .where(eq(solutions.name, name))
    .limit(1);
  return rows[0] ?? null;
}

export async function createSolution(input: {
  name: string;
  endpoint_url: string;
  user_id: string | null;
}) {
  const id = uid("r-");
  const apiKey = `ts_${uid("")}`;
  const [row] = await db
    .insert(solutions)
    .values({
      id,
      name: input.name,
      endpoint_url: input.endpoint_url,
      api_key: apiKey,
      user_id: input.user_id,
    })
    .returning();
  return { solution: row, api_key: apiKey };
}

export async function listSolutionsByUser(userId: string) {
  return db.select().from(solutions).where(eq(solutions.user_id, userId));
}

// Idempotent insert of the users row. Needed when a stale JWT cookie
// outlives a DB reset — auth() still returns a session, but the FK
// target row is gone. Derives provider+providerAccountId from the
// `u_<provider>_<acct>` id shape that auth.ts mints.
export async function ensureUserRow(
  userId: string,
  profile: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  },
): Promise<void> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (existing.length > 0) return;

  const match = /^u_([^_]+)_(.+)$/.exec(userId);
  if (!match) {
    throw new Error(`malformed user id: ${userId}`);
  }
  const [, provider, providerAccountId] = match;
  await db
    .insert(users)
    .values({
      id: userId,
      provider,
      provider_account_id: providerAccountId,
      email: profile.email ?? null,
      name: profile.name ?? null,
      image: profile.image ?? null,
    })
    .onConflictDoNothing();
}

// Used by /cli/authorize: returns this user's default solution identity
// (used by `tp auth login`). If they have no solutions yet, auto-creates one
// named after them. We DON'T rotate the api_key on every login — login
// is idempotent. To rotate, the user needs an explicit "rotate" action
// in /settings (not built yet).
export async function getOrCreateCliSolution(
  userId: string,
  displayName: string | null,
): Promise<{ id: string; name: string; api_key: string }> {
  const existing = await listSolutionsByUser(userId);
  if (existing.length > 0) {
    const r = existing[0];
    return { id: r.id, name: r.name, api_key: r.api_key };
  }
  const slug =
    (displayName || "user")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "user";

  // Try the bare slug first ("shuhc"); only append -2, -3, ... on
  // collision. solutions.name has a unique index, so we can't just hope.
  const name = await pickAvailableSolutionName(slug);
  const { solution, api_key } = await createSolution({
    name,
    endpoint_url: "https://trapstreet.run/cli",
    user_id: userId,
  });
  return { id: solution.id, name: solution.name, api_key };
}

async function pickAvailableSolutionName(slug: string): Promise<string> {
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? slug : `${slug}-${i}`;
    const exists = await db
      .select({ id: solutions.id })
      .from(solutions)
      .where(eq(solutions.name, candidate))
      .limit(1);
    if (exists.length === 0) return candidate;
  }
  // Astronomically unlikely fallback — 1000 people with the exact same
  // github display name all signing up.
  return `${slug}-${Date.now()}`;
}

function userDisplaySlug(name: string | null | undefined): string {
  return (
    (name || "user")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "user"
  );
}

// Routes a submission to the right solution for the authenticated user.
// - requestedName set → lookup-or-create a solution named that under
//   anchor.user_id (lets one human run multiple named agents).
// - requestedName null → auto-pick the next `<user-slug>-<n>` and
//   create a fresh solution. Each unnamed submit lands as its own row.
//
// Anchor = the solution the api_key authenticated as (the api_key
// belongs to a single solution, but the user owning it can have many).
// If anchor has no user_id (legacy anonymous registration), we can't
// multi-route — fall back to anchor.
export async function resolveSubmitSolution(
  anchor: { id: string; user_id: string | null },
  requestedName: string | null,
): Promise<{ id: string }> {
  if (!anchor.user_id) return { id: anchor.id };

  if (requestedName) {
    const existing = await db
      .select({ id: solutions.id })
      .from(solutions)
      .where(
        and(
          eq(solutions.user_id, anchor.user_id),
          eq(solutions.name, requestedName),
        ),
      )
      .limit(1);
    if (existing.length > 0) return { id: existing[0].id };
    const { solution } = await createSolution({
      name: requestedName,
      endpoint_url: "https://trapstreet.run/cli",
      user_id: anchor.user_id,
    });
    return { id: solution.id };
  }

  // Auto-name: derive slug from the user's display name and pick the
  // next free numeric suffix. Each unnamed submit gets its own row.
  const user = await userById(anchor.user_id);
  const slug = userDisplaySlug(user?.name);
  const name = await pickAvailableSolutionName(slug);
  const { solution } = await createSolution({
    name,
    endpoint_url: "https://trapstreet.run/cli",
    user_id: anchor.user_id,
  });
  return { id: solution.id };
}

// -----------------------------------------------------------------------------
// runs + cases

export async function getRun(id: string): Promise<RunRow | null> {
  const rows = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listCasesForRun(runId: string): Promise<CaseRow[]> {
  return db
    .select()
    .from(cases)
    .where(eq(cases.run_id, runId))
    .orderBy(asc(cases.case_id));
}

export async function createRun(input: { task_id: string; solution_id: string }) {
  const id = uid("run-");
  const [row] = await db
    .insert(runs)
    .values({
      id,
      task_id: input.task_id,
      solution_id: input.solution_id,
      status: "created",
    })
    .returning();
  return row;
}

export async function updateRun(id: string, patch: Partial<RunRow>) {
  const [row] = await db
    .update(runs)
    .set(patch)
    .where(eq(runs.id, id))
    .returning();
  return row ?? null;
}

// CLI upload payload — see trapstreet/docs/scoring-and-metrics.md
// "Upload protocol" for the contract. Five top-level keys, all
// required-or-optional as noted.

export interface CliCase {
  case_id: string;
  exit_code?: number;
  duration?: number;       // seconds (CLI's native unit); server stores ms
  metrics?: Record<string, unknown>;
  skipped?: boolean;
}

export interface CliSummary {
  passed: boolean;
  score: number;
  n_passed?: number;
  n_total?: number;
  n_skipped?: number;
  latency_ms_total?: number;
  latency_ms_median?: number;
  latency_ms_p95?: number;
  cost_usd_total?: number;
  tokens_total?: number;
  by_category?: Record<string, number>;
  // grader.py may emit any other keys; we tolerate and store them
  [key: string]: unknown;
}

export interface CliUpload {
  task_id: string;
  cases: CliCase[];
  summary?: CliSummary;     // omitted → server auto-computes from cases
  started_at?: string;      // ISO 8601, CLI wall-clock
  finished_at?: string;     // ISO 8601, CLI wall-clock
  metadata?: Record<string, unknown>;
  // Leaderboard identity. Set in trap.yaml `solution:` field. When
  // present, server creates/reuses a solution with this name under the
  // authenticated user. When absent, server auto-assigns a serial
  // name (`<user-slug>-<n>`), so each unnamed submit lands as its own
  // leaderboard row.
  solution?: string;
}

// Server-side fallback summary when the report doesn't include one
// (grader.py was omitted on the task side). Computes the well-known
// fields from case metrics.
function autoSummary(cs: CliCase[]): CliSummary {
  const scored = cs.filter((c) => !c.skipped);
  const scores = scored
    .map((c) => (c.metrics?.score as number | undefined) ?? null)
    .filter((s): s is number => typeof s === "number");
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const n_passed = scores.filter((s) => s === 1.0).length;
  const n_total = scored.length;
  const n_skipped = cs.filter((c) => c.skipped).length;
  const durations = scored
    .map((c) => c.duration)
    .filter((d): d is number => typeof d === "number");
  const latency_ms_total = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) * 1000)
    : undefined;
  const costs = scored
    .map((c) => c.metrics?.usd_cost as number | undefined)
    .filter((x): x is number => typeof x === "number");
  const cost_usd_total = costs.length > 0
    ? Number(costs.reduce((a, b) => a + b, 0).toFixed(6))
    : undefined;
  return {
    passed: avg >= 0.8,
    score: Number(avg.toFixed(4)),
    n_passed,
    n_total,
    n_skipped,
    latency_ms_total,
    cost_usd_total,
  };
}

// Open a run AND ingest a CLI upload in one shot. Used by the combined
// POST /api/submit/:task_id endpoint that lets solutions copy-paste a single
// curl command.
export async function submitRun(input: {
  task_id: string;
  solution_id: string;
  payload: CliUpload;
}): Promise<RunRow | null> {
  const run = await createRun({
    task_id: input.task_id,
    solution_id: input.solution_id,
  });
  const now = new Date();
  await db
    .update(runs)
    .set({ started_at: now })
    .where(eq(runs.id, run.id));
  return ingestCliUpload(run.id, input.payload);
}

// Ingest a CLI upload into the run + cases tables.
// (neon-http doesn't support transactions; v0 takes the risk of partial writes.)
export async function ingestCliUpload(
  runId: string,
  payload: CliUpload,
): Promise<RunRow | null> {
  const now = new Date();

  // Wipe any prior case rows for this run (idempotent re-upload).
  await db.delete(cases).where(eq(cases.run_id, runId));

  if (payload.cases.length > 0) {
    await db.insert(cases).values(
      payload.cases.map((c) => ({
        id: uid("c-"),
        run_id: runId,
        case_id: c.case_id,
        exit_code: c.exit_code ?? null,
        duration_ms:
          c.duration !== undefined ? Math.round(c.duration * 1000) : null,
        metrics: (c.metrics ?? {}) as Record<string, unknown>,
        skipped: c.skipped ?? false,
      })),
    );
  }

  // Use the grader-supplied summary, or auto-compute from cases.
  const summary = payload.summary ?? autoSummary(payload.cases);

  // Extract well-known keys to denormalized columns (for fast SQL sort);
  // also stash the full summary as jsonb for rendering anything extra.
  const cases_total = payload.cases.length;
  const cases_passed = summary.n_passed ?? 0;
  const cases_skipped =
    summary.n_skipped ?? payload.cases.filter((c) => c.skipped).length;
  const cases_failed = Math.max(
    0,
    (summary.n_total ?? cases_total) - cases_passed - cases_skipped,
  );

  const started = payload.started_at ? new Date(payload.started_at) : null;
  const finished = payload.finished_at ? new Date(payload.finished_at) : now;

  const [row] = await db
    .update(runs)
    .set({
      status: "scored",
      passed: summary.passed,
      total_score: summary.score,
      cases_passed,
      cases_failed,
      cases_skipped,
      cost_usd: summary.cost_usd_total ?? null,
      latency_ms: summary.latency_ms_total ?? null,
      token_count: summary.tokens_total ?? null,
      grader_metrics: summary as Record<string, unknown>,
      metadata: payload.metadata ?? {},
      started_at: started,
      finished_at: finished,
      scored_at: now,
    })
    .where(eq(runs.id, runId))
    .returning();
  return row ?? null;
}

// -----------------------------------------------------------------------------
// leaderboard — sort by total_score DESC, then total duration ASC.

export type LeaderboardRow = {
  rank: number;
  solution_id: string;
  // The submission identity (what we call "solution" in the UI). Set by
  // the user via `tp auth login` / solution registration — defaults to an
  // auto-generated handle.
  solution_name: string;
  // GitHub/Google display name of the human who owns the solution. Shown
  // as a small "by Xxx" line under the solution name on the leaderboard.
  user_name: string | null;
  run_id: string;
  task_id: string;
  track: string;
  passed: boolean | null;
  total_score: number;
  cases_passed: number;
  cases_failed: number;
  cases_skipped: number;
  cost_usd: number | null;
  latency_ms: number | null;
  scored_at: string;
  // Self-reported metadata from trap.yaml. The UI looks for `repo`
  // (GitHub URL) to render a source-code link next to the solution.
  metadata: Record<string, unknown> | null;
  // Grader.py's full output (the run-level summary). Note: rich
  // per-case metrics like mbti_type live in cases.metrics, NOT here.
  // See case_metrics for that.
  grader_metrics: Record<string, unknown> | null;
  // judge.py per-case output, ordered by case_id. Populated only for
  // no_ranking tasks (which typically have 1-N cases that ARE the
  // profile). ProfileList walks the first case's metrics alongside
  // grader_metrics so MBTI-style rich fields render as columns.
  case_metrics: Record<string, unknown>[] | null;
};

// What the leaderboard can sort by. Superset of RankingMetric — we also
// allow sorting by columns that aren't valid "official" ranking metrics
// for a task (e.g. submission time, pass/fail boolean).
export type SortKey = RankingMetric | "scored_at" | "passed";

// Resolve a SortKey to the Drizzle column it maps to. Not called for
// "no_ranking" — that case is handled before this function runs.
function sortColumn(m: Exclude<SortKey, "no_ranking">): PgColumn {
  switch (m) {
    case "total_score":
      return runs.total_score;
    case "latency_ms":
      return runs.latency_ms;
    case "cost_usd":
      return runs.cost_usd;
    case "cases_passed":
      return runs.cases_passed;
    case "scored_at":
      return runs.scored_at;
    case "passed":
      return runs.passed;
  }
}

export async function leaderboardEntries(filter: {
  track?: string;
  task_id?: string;
  // What to sort by. Supports any SortKey (RankingMetric ∪ scored_at,
  // passed). Callers (task page, API) typically resolve this from
  // URL params with the task's ranking_metric as fallback default.
  sort?: SortKey;
  direction?: RankingDirection;
  // false (default) → dedup to each solution's best run per task. true →
  // raw list of every scored run (used by the "all runs" view, solution
  // history, etc.)
  all?: boolean;
}): Promise<LeaderboardRow[]> {
  const where = [eq(runs.status, "scored")];
  if (filter.task_id) where.push(eq(runs.task_id, filter.task_id));
  if (filter.track) where.push(eq(tasks.track, filter.track));

  const sort = filter.sort ?? "total_score";
  const direction = filter.direction ?? "desc";

  // For classification / self-profile tasks ("no_ranking"), there is no
  // meaningful score column to rank by — show submissions chronologically.
  let primary: SQL;
  let tiebreakers: SQL[];
  if (sort === "no_ranking") {
    primary = desc(runs.scored_at);
    tiebreakers = [];
  } else {
    primary =
      direction === "desc"
        ? desc(sortColumn(sort))
        : asc(sortColumn(sort));
    // Tiebreakers — always include the other relevant columns so order
    // is stable. We pick the inverse-direction of the primary metric so
    // a score-ranked board breaks ties by speed/cost (lower better),
    // and a latency-ranked board breaks ties by higher score.
    tiebreakers =
      sort === "total_score"
        ? [asc(runs.latency_ms), asc(runs.cost_usd)]
        : sort === "latency_ms"
          ? [desc(runs.total_score), asc(runs.cost_usd)]
          : sort === "cost_usd"
            ? [desc(runs.total_score), asc(runs.latency_ms)]
            : [desc(runs.total_score), asc(runs.latency_ms)];
  }

  const rows = await db
    .select({
      run_id: runs.id,
      solution_id: runs.solution_id,
      task_id: runs.task_id,
      track: tasks.track,
      solution_name: solutions.name,
      user_name: users.name,
      passed: runs.passed,
      total_score: runs.total_score,
      cases_passed: runs.cases_passed,
      cases_failed: runs.cases_failed,
      cases_skipped: runs.cases_skipped,
      cost_usd: runs.cost_usd,
      latency_ms: runs.latency_ms,
      scored_at: runs.scored_at,
      metadata: runs.metadata,
      grader_metrics: runs.grader_metrics,
    })
    .from(runs)
    .innerJoin(tasks, eq(tasks.id, runs.task_id))
    .innerJoin(solutions, eq(solutions.id, runs.solution_id))
    // Left-join users so solutions without an owning user (anonymous
    // registration) still appear; user_name will just be null.
    .leftJoin(users, eq(users.id, solutions.user_id))
    .where(and(...where))
    .orderBy(primary, ...tiebreakers);

  // Dedup to best run per (solution, engine, task). Rows are already
  // sorted by the ranking criteria, so the first row we see for a given
  // key wins. Postgres has DISTINCT ON for this server-side, but Drizzle
  // doesn't expose it cleanly; in-memory works fine at v0 scale.
  //
  // We include the engine identifier in the key so the same solution
  // tested against multiple engines (claude-3-5-sonnet, claude-3-opus, a
  // bespoke python extractor, etc.) all appear as comparable rows. Runs
  // that don't declare an engine collapse together under "" — preserves
  // the legacy behaviour for solutions that haven't started reporting one
  // yet. `metadata.model` is accepted as a fallback for backward-compat.
  //
  // Skip dedup entirely for classification tasks — each submission has
  // independent value, and "best" isn't defined when nothing is ranked.
  const finalRows =
    filter.all || sort === "no_ranking"
      ? rows
      : (() => {
          const seen = new Set<string>();
          const out: typeof rows = [];
          for (const r of rows) {
            const md =
              r.metadata && typeof r.metadata === "object"
                ? (r.metadata as Record<string, unknown>)
                : null;
            const rawEngine =
              md && typeof md.engine === "string"
                ? md.engine
                : md && typeof md.model === "string"
                  ? md.model
                  : "";
            const engine = rawEngine.trim();
            const key = `${r.solution_name}|${engine}|${r.task_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(r);
          }
          return out;
        })();

  // For no_ranking tasks, the "rich" per-submission metrics (mbti_type,
  // percentages, bias_stats etc) live in cases.metrics — judge.py
  // outputs them per case. Batch-fetch and group by run_id so the
  // ProfileList can walk them as columns.
  const caseMetricsByRun = new Map<string, Record<string, unknown>[]>();
  if (sort === "no_ranking" && finalRows.length > 0) {
    const runIds = finalRows.map((r) => r.run_id);
    const caseRows = await db
      .select({
        run_id: cases.run_id,
        case_id: cases.case_id,
        metrics: cases.metrics,
      })
      .from(cases)
      .where(inArray(cases.run_id, runIds))
      .orderBy(asc(cases.run_id), asc(cases.case_id));
    for (const c of caseRows) {
      if (!c.metrics || typeof c.metrics !== "object") continue;
      const list = caseMetricsByRun.get(c.run_id) ?? [];
      list.push(c.metrics as Record<string, unknown>);
      caseMetricsByRun.set(c.run_id, list);
    }
  }

  return finalRows.map((r, i) => ({
    rank: i + 1,
    solution_id: r.solution_id,
    solution_name: r.solution_name,
    user_name: r.user_name,
    run_id: r.run_id,
    task_id: r.task_id,
    track: r.track,
    passed: r.passed,
    total_score: r.total_score ?? 0,
    cases_passed: r.cases_passed,
    cases_failed: r.cases_failed,
    cases_skipped: r.cases_skipped,
    cost_usd: r.cost_usd,
    latency_ms: r.latency_ms,
    scored_at: r.scored_at!.toISOString(),
    metadata:
      r.metadata && typeof r.metadata === "object"
        ? (r.metadata as Record<string, unknown>)
        : null,
    grader_metrics:
      r.grader_metrics && typeof r.grader_metrics === "object"
        ? (r.grader_metrics as Record<string, unknown>)
        : null,
    case_metrics: caseMetricsByRun.get(r.run_id) ?? null,
  }));
}

// Solution history — all runs across all tasks for one solution.
// Sorted newest first.
export async function listRunsBySolution(solutionId: string) {
  return db
    .select({
      run_id: runs.id,
      task_id: runs.task_id,
      task_name: tasks.name,
      status: runs.status,
      passed: runs.passed,
      total_score: runs.total_score,
      cases_passed: runs.cases_passed,
      cases_failed: runs.cases_failed,
      cases_skipped: runs.cases_skipped,
      cost_usd: runs.cost_usd,
      latency_ms: runs.latency_ms,
      scored_at: runs.scored_at,
      created_at: runs.created_at,
      error_message: runs.error_message,
    })
    .from(runs)
    .innerJoin(tasks, eq(tasks.id, runs.task_id))
    .where(eq(runs.solution_id, solutionId))
    .orderBy(desc(runs.created_at));
}

// -----------------------------------------------------------------------------
// threads + comments
//
// Authorship is per-user (not per-solution) — forum is human discussion.
// Posting goes through session auth (no api_key needed). See migration
// scripts/migrate-forum-authors-to-users.ts for the FK flip.

export interface ThreadListRow {
  id: string;
  title: string;
  author_id: string;
  author_name: string | null;
  subject_type: string;
  subject_id: string;
  comment_count: number;
  created_at: Date;
  updated_at: Date;
}

async function listThreadsInternal(filter: {
  subject_type?: string;
  subject_id?: string;
}): Promise<ThreadListRow[]> {
  const where = [];
  if (filter.subject_type)
    where.push(eq(threads.subject_type, filter.subject_type as never));
  if (filter.subject_id)
    where.push(eq(threads.subject_id, filter.subject_id));
  const q = db
    .select({
      id: threads.id,
      title: threads.title,
      author_id: threads.author_id,
      author_name: users.name,
      subject_type: threads.subject_type,
      subject_id: threads.subject_id,
      comment_count: threads.comment_count,
      created_at: threads.created_at,
      updated_at: threads.updated_at,
    })
    .from(threads)
    .leftJoin(users, eq(users.id, threads.author_id));
  return where.length > 0
    ? await q.where(and(...where)).orderBy(desc(threads.updated_at))
    : await q.orderBy(desc(threads.updated_at));
}

export async function listThreads(filter: {
  subject_type?: string;
  subject_id?: string;
}): Promise<ThreadListRow[]> {
  return listThreadsInternal(filter);
}

export async function listThreadsForSubject(
  subjectType: string,
  subjectId: string,
): Promise<ThreadListRow[]> {
  return listThreadsInternal({
    subject_type: subjectType,
    subject_id: subjectId,
  });
}

export async function getThread(id: string) {
  const rows = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface CommentRow {
  id: string;
  thread_id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: Date;
}

export async function listComments(threadId: string): Promise<CommentRow[]> {
  return db
    .select({
      id: comments.id,
      thread_id: comments.thread_id,
      author_id: comments.author_id,
      author_name: users.name,
      body: comments.body,
      created_at: comments.created_at,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.author_id))
    .where(eq(comments.thread_id, threadId))
    .orderBy(asc(comments.created_at));
}

export async function createThread(input: {
  title: string;
  author_id: string;
  subject_type: string;
  subject_id: string;
  body?: string;
}) {
  const id = uid("th-");
  const [thread] = await db
    .insert(threads)
    .values({
      id,
      title: input.title,
      author_id: input.author_id,
      subject_type: input.subject_type as never,
      subject_id: input.subject_id,
      comment_count: 0,
    })
    .returning();
  if (input.body && input.body.length > 0) {
    const cid = uid("c-");
    await db.insert(comments).values({
      id: cid,
      thread_id: id,
      author_id: input.author_id,
      body: input.body.slice(0, 4000),
    });
    await db
      .update(threads)
      .set({ comment_count: 1 })
      .where(eq(threads.id, id));
    thread.comment_count = 1;
  }
  return thread;
}

export async function createComment(input: {
  thread_id: string;
  author_id: string;
  body: string;
}) {
  const id = uid("c-");
  const [row] = await db
    .insert(comments)
    .values({
      id,
      thread_id: input.thread_id,
      author_id: input.author_id,
      body: input.body.slice(0, 4000),
    })
    .returning();
  await db
    .update(threads)
    .set({
      comment_count: raw`${threads.comment_count} + 1`,
      updated_at: new Date(),
    })
    .where(eq(threads.id, input.thread_id));
  return row;
}

// Deletion. Caller is responsible for verifying the actor has the right
// to delete (own author, or task creator for threads attached to their
// task). These are raw deletes.
export async function deleteThread(id: string): Promise<void> {
  // comments cascade via FK on thread_id
  await db.delete(threads).where(eq(threads.id, id));
}

export async function deleteComment(id: string): Promise<void> {
  const [row] = await db
    .select({ thread_id: comments.thread_id })
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  if (!row) return;
  await db.delete(comments).where(eq(comments.id, id));
  // Decrement comment_count; don't touch updated_at on delete (a delete
  // shouldn't bump the thread to the top of the list).
  await db
    .update(threads)
    .set({ comment_count: raw`GREATEST(${threads.comment_count} - 1, 0)` })
    .where(eq(threads.id, row.thread_id));
}

export async function getComment(id: string) {
  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// Per-task forum stats — thread count and total comments across all
// threads on the task. Used in the forum tab header.
export async function taskForumStats(
  taskId: string,
): Promise<{ thread_count: number; comment_total: number }> {
  const rows = await db
    .select({
      thread_count: raw<number>`count(*)::int`,
      comment_total: raw<number>`coalesce(sum(${threads.comment_count}), 0)::int`,
    })
    .from(threads)
    .where(
      and(
        eq(threads.subject_type, "task" as never),
        eq(threads.subject_id, taskId),
      ),
    );
  return rows[0] ?? { thread_count: 0, comment_total: 0 };
}

export async function subjectExists(
  type: string,
  id: string,
): Promise<boolean> {
  switch (type) {
    case "task":
      return (await getTask(id)) !== null;
    case "run":
      return (await getRun(id)) !== null;
    case "solution":
      return (await getSolutionById(id)) !== null;
    case "track": {
      const rows = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.track, id))
        .limit(1);
      return rows.length > 0;
    }
    default:
      return false;
  }
}
