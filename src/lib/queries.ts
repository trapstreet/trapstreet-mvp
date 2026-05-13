import { cache } from "react";
import { and, asc, desc, eq, or, sql as raw } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  cases,
  comments,
  runners,
  runs,
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

// Best score (and run count) per task — for the task grid summary.
export async function taskStats(): Promise<
  Map<string, { runs: number; best_score: number | null; best_runner: string | null }>
> {
  const rows = await db
    .select({
      task_id: runs.task_id,
      runner_name: runners.name,
      total_score: runs.total_score,
    })
    .from(runs)
    .innerJoin(runners, eq(runners.id, runs.runner_id))
    .where(eq(runs.status, "scored"));

  const map = new Map<
    string,
    { runs: number; best_score: number | null; best_runner: string | null }
  >();
  for (const r of rows) {
    const cur = map.get(r.task_id) ?? {
      runs: 0,
      best_score: null,
      best_runner: null,
    };
    cur.runs += 1;
    if (
      r.total_score !== null &&
      (cur.best_score === null || r.total_score > cur.best_score)
    ) {
      cur.best_score = r.total_score;
      cur.best_runner = r.runner_name;
    }
    map.set(r.task_id, cur);
  }
  return map;
}

// -----------------------------------------------------------------------------
// runners + auth

export async function getRunnerByApiKey(apiKey: string) {
  const rows = await db
    .select()
    .from(runners)
    .where(eq(runners.api_key, apiKey))
    .limit(1);
  return rows[0] ?? null;
}

export async function authRunner(authHeader: string | null) {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/.exec(authHeader);
  if (!m) return null;
  return getRunnerByApiKey(m[1]);
}

export async function getRunnerById(id: string) {
  const rows = await db
    .select()
    .from(runners)
    .where(eq(runners.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRunnerByName(name: string) {
  const rows = await db
    .select()
    .from(runners)
    .where(eq(runners.name, name))
    .limit(1);
  return rows[0] ?? null;
}

export async function createRunner(input: {
  name: string;
  endpoint_url: string;
  user_id: string | null;
}) {
  const id = uid("r-");
  const apiKey = `ts_${uid("")}`;
  const [row] = await db
    .insert(runners)
    .values({
      id,
      name: input.name,
      endpoint_url: input.endpoint_url,
      api_key: apiKey,
      user_id: input.user_id,
    })
    .returning();
  return { runner: row, api_key: apiKey };
}

export async function listRunnersByUser(userId: string) {
  return db.select().from(runners).where(eq(runners.user_id, userId));
}

// Used by /cli/authorize: returns this user's default runner identity
// (used by `tp login`). If they have no runners yet, auto-creates one
// named after them. We DON'T rotate the api_key on every login — login
// is idempotent. To rotate, the user needs an explicit "rotate" action
// in /settings (not built yet).
export async function getOrCreateCliRunner(
  userId: string,
  displayName: string | null,
): Promise<{ id: string; name: string; api_key: string }> {
  const existing = await listRunnersByUser(userId);
  if (existing.length > 0) {
    const r = existing[0];
    return { id: r.id, name: r.name, api_key: r.api_key };
  }
  const slug = (displayName || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "user";
  const idShort = userId.slice(-8).replace(/[^a-z0-9]/gi, "");
  const name = `${slug}-${idShort}`;
  const { runner, api_key } = await createRunner({
    name,
    endpoint_url: "https://trapstreet.run/cli",
    user_id: userId,
  });
  return { id: runner.id, name: runner.name, api_key };
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

export async function createRun(input: { task_id: string; runner_id: string }) {
  const id = uid("run-");
  const [row] = await db
    .insert(runs)
    .values({
      id,
      task_id: input.task_id,
      runner_id: input.runner_id,
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

// CLI upload payload — what `tp` writes when run finishes.
export interface CliUpload {
  task: {
    name?: string;
    description?: string;
    cmd?: string;
    traptask?: string;
    inputs?: unknown;
    file_outputs?: unknown;
    timeout?: number;
    inputs_envvar?: string;
    outputs_envvar?: string;
  };
  cases: Array<{
    case_id: string;
    exit_code?: number;
    duration?: number;     // seconds
    metrics?: Record<string, unknown>;
    skipped?: boolean;
  }>;
  run_counts: {
    passed: number;
    failed: number;
    skipped: number;
  };
  grader_metrics: {
    passed: boolean;
    score: number;
  };
  // Optional samples AI runners may attach
  cost_usd?: number;
  latency_ms?: number;
  token_count?: number;
}

// Open a run AND ingest a CLI upload in one shot. Used by the combined
// POST /api/submit/:task_id endpoint that lets runners copy-paste a single
// curl command.
export async function submitRun(input: {
  task_id: string;
  runner_id: string;
  payload: CliUpload;
}): Promise<RunRow | null> {
  const run = await createRun({
    task_id: input.task_id,
    runner_id: input.runner_id,
  });
  const now = new Date();
  await db
    .update(runs)
    .set({ started_at: now })
    .where(eq(runs.id, run.id));
  return ingestCliUpload(run.id, input.payload);
}

// Ingest a CLI upload into the run + cases tables atomically (best-effort —
// neon-http doesn't support transactions; v0 takes the risk of partial writes).
export async function ingestCliUpload(
  runId: string,
  payload: CliUpload,
): Promise<RunRow | null> {
  const now = new Date();

  // wipe any prior case rows for this run (idempotent re-upload)
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

  const [row] = await db
    .update(runs)
    .set({
      status: "scored",
      passed: payload.grader_metrics.passed,
      total_score: payload.grader_metrics.score,
      cases_passed: payload.run_counts.passed,
      cases_failed: payload.run_counts.failed,
      cases_skipped: payload.run_counts.skipped,
      cost_usd: payload.cost_usd ?? null,
      latency_ms: payload.latency_ms ?? null,
      token_count: payload.token_count ?? null,
      finished_at: now,
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
  runner_name: string;
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
};

// Resolve a RankingMetric to the Drizzle column it maps to.
function metricColumn(m: RankingMetric): PgColumn {
  switch (m) {
    case "total_score":
      return runs.total_score;
    case "latency_ms":
      return runs.latency_ms;
    case "cost_usd":
      return runs.cost_usd;
    case "cases_passed":
      return runs.cases_passed;
  }
}

export async function leaderboardEntries(filter: {
  track?: string;
  task_id?: string;
  // When ranking_metric is passed (e.g. from a task page), use it.
  // Defaults to total_score DESC + (latency, cost) tiebreakers — the
  // sensible all-up cross-task default for the home grid summary.
  ranking_metric?: RankingMetric;
  ranking_direction?: RankingDirection;
}): Promise<LeaderboardRow[]> {
  const where = [eq(runs.status, "scored")];
  if (filter.task_id) where.push(eq(runs.task_id, filter.task_id));
  if (filter.track) where.push(eq(tasks.track, filter.track));

  const metric = filter.ranking_metric ?? "total_score";
  const direction = filter.ranking_direction ?? "desc";
  const primary =
    direction === "desc"
      ? desc(metricColumn(metric))
      : asc(metricColumn(metric));

  // Tiebreakers — always include the other relevant columns so order is
  // stable. We pick the inverse-direction of the primary metric so a
  // score-ranked board breaks ties by speed/cost (lower better), and a
  // latency-ranked board breaks ties by higher score.
  const tiebreakers = (
    metric === "total_score"
      ? [asc(runs.latency_ms), asc(runs.cost_usd)]
      : metric === "latency_ms"
        ? [desc(runs.total_score), asc(runs.cost_usd)]
        : metric === "cost_usd"
          ? [desc(runs.total_score), asc(runs.latency_ms)]
          : [desc(runs.total_score), asc(runs.latency_ms)]
  );

  const rows = await db
    .select({
      run_id: runs.id,
      task_id: runs.task_id,
      track: tasks.track,
      runner_name: runners.name,
      passed: runs.passed,
      total_score: runs.total_score,
      cases_passed: runs.cases_passed,
      cases_failed: runs.cases_failed,
      cases_skipped: runs.cases_skipped,
      cost_usd: runs.cost_usd,
      latency_ms: runs.latency_ms,
      scored_at: runs.scored_at,
    })
    .from(runs)
    .innerJoin(tasks, eq(tasks.id, runs.task_id))
    .innerJoin(runners, eq(runners.id, runs.runner_id))
    .where(and(...where))
    .orderBy(primary, ...tiebreakers);

  return rows.map((r, i) => ({
    rank: i + 1,
    runner_name: r.runner_name,
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
  }));
}

// -----------------------------------------------------------------------------
// threads + comments — unchanged from prior version

export async function listThreads(filter: {
  subject_type?: string;
  subject_id?: string;
}) {
  const where = [];
  if (filter.subject_type)
    where.push(eq(threads.subject_type, filter.subject_type as never));
  if (filter.subject_id)
    where.push(eq(threads.subject_id, filter.subject_id));
  const q = db.select().from(threads);
  const rows =
    where.length > 0
      ? await q.where(and(...where)).orderBy(desc(threads.updated_at))
      : await q.orderBy(desc(threads.updated_at));
  return rows;
}

export async function getThread(id: string) {
  const rows = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listComments(threadId: string) {
  return db
    .select()
    .from(comments)
    .where(eq(comments.thread_id, threadId))
    .orderBy(asc(comments.created_at));
}

export async function listThreadsForSubject(subjectType: string, subjectId: string) {
  return listThreads({ subject_type: subjectType, subject_id: subjectId });
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

export async function subjectExists(
  type: string,
  id: string,
): Promise<boolean> {
  switch (type) {
    case "task":
      return (await getTask(id)) !== null;
    case "run":
      return (await getRun(id)) !== null;
    case "runner":
      return (await getRunnerById(id)) !== null;
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
