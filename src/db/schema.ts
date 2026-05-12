import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// -----------------------------------------------------------------------------
// users — populated from Auth.js OAuth signin events. JWT session strategy,
// so this is a lightweight FK target, not Auth.js's session table.

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(), // "github" | "google"
    provider_account_id: text("provider_account_id").notNull(),
    email: text("email"),
    name: text("name"),
    image: text("image"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("users_provider_acct_idx").on(t.provider, t.provider_account_id),
  ],
);

// -----------------------------------------------------------------------------
// runners — owned by a user. api_key kept plaintext for v0; hash later.

export const runners = pgTable(
  "runners",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    endpoint_url: text("endpoint_url").notNull(),
    api_key: text("api_key").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("runners_name_idx").on(t.name),
    uniqueIndex("runners_api_key_idx").on(t.api_key),
  ],
);

// -----------------------------------------------------------------------------
// tasks — points at a traptask directory in some git repo. The CLI is
// authoritative on cases/judge/grader; we just record the leaderboard.
//
// Each task picks its own ranking_metric — what column to sort the
// leaderboard by — so different task families can compete on different
// things (score, speed, cost). See docs/glossary.md "ranking metric".

export type RankingMetric =
  | "total_score"
  | "latency_ms"
  | "cost_usd"
  | "cases_passed";

export type RankingDirection = "asc" | "desc";

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),                           // "word-count", "tenancy-agreement"
  name: text("name").notNull(),                          // "Word frequencies + summary"
  track: text("track").notNull(),                        // "examples", "pdf-reader", ...
  description: text("description").notNull().default(""),
  traptask_ref: text("traptask_ref").notNull(),          // "AntiNoise-ai/trap/examples/word-count"
  ranking_metric: text("ranking_metric")
    .$type<RankingMetric>()
    .notNull()
    .default("total_score"),
  ranking_direction: text("ranking_direction")
    .$type<RankingDirection>()
    .notNull()
    .default("desc"),
  rules_md: text("rules_md").notNull().default(""),
  // Concrete contract for this task: sample case inputs, expected outputs,
  // and how judge/grader score it. Rendered on the Rules tab alongside
  // rules_md. Markdown with `## h2`, `- list`, ``` fenced code, inline code,
  // and **bold**.
  io_md: text("io_md").notNull().default(""),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// -----------------------------------------------------------------------------
// runs — one CLI invocation. `passed` + `total_score` from grader_metrics.

export type RunStatus =
  | "created"
  | "preparing"
  | "executing"
  | "succeeded"
  | "scored"
  | "failed";

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  task_id: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  runner_id: text("runner_id")
    .notNull()
    .references(() => runners.id, { onDelete: "cascade" }),
  status: text("status").$type<RunStatus>().notNull(),

  // Final scoring summary (from grader_metrics).
  passed: boolean("passed"),
  total_score: doublePrecision("total_score"),

  // Case-count summary (from run_counts).
  cases_passed: integer("cases_passed").notNull().default(0),
  cases_failed: integer("cases_failed").notNull().default(0),
  cases_skipped: integer("cases_skipped").notNull().default(0),

  // Optional self-reported samples — CLI doesn't emit these, but AI runners
  // may attach them.
  cost_usd: doublePrecision("cost_usd"),
  latency_ms: integer("latency_ms"),
  token_count: integer("token_count"),

  // Misc.
  output_uri: text("output_uri"),
  error_message: text("error_message"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  started_at: timestamp("started_at", { withTimezone: true }),
  finished_at: timestamp("finished_at", { withTimezone: true }),
  scored_at: timestamp("scored_at", { withTimezone: true }),
});

// -----------------------------------------------------------------------------
// cases — per-case result. One Run has many Cases. metrics is freeform jsonb.

export const cases = pgTable("cases", {
  id: text("id").primaryKey(),
  run_id: text("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  case_id: text("case_id").notNull(),                    // "basic", "empty", ...
  exit_code: integer("exit_code"),
  duration_ms: integer("duration_ms"),
  metrics: jsonb("metrics").notNull().default({}),
  skipped: boolean("skipped").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// -----------------------------------------------------------------------------
// threads + comments

export type SubjectType = "task" | "track" | "run" | "runner";

export const threads = pgTable("threads", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  author_id: text("author_id")
    .notNull()
    .references(() => runners.id, { onDelete: "cascade" }),
  subject_type: text("subject_type").$type<SubjectType>().notNull(),
  subject_id: text("subject_id").notNull(),
  comment_count: integer("comment_count").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  thread_id: text("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  author_id: text("author_id")
    .notNull()
    .references(() => runners.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// -----------------------------------------------------------------------------
// shared row types

export type UserRow = typeof users.$inferSelect;
export type RunnerRow = typeof runners.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type CaseRow = typeof cases.$inferSelect;
export type ThreadRow = typeof threads.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
