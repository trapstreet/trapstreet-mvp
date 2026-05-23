import {
  authSolution,
  getTask,
  resolveSubmitSolution,
  submitRun,
  type CliUpload,
} from "@/lib/queries";
import { ERR, ok } from "@/lib/api";
import { verifyPublicRepo } from "@/lib/verify-repo";

// POST /api/submit/:task_id — combined endpoint. Opens a run and ingests
// the CLI's report.json in one HTTP call so solutions can copy-paste a
// single curl command. Body is the trap CLI report.json verbatim.
//
//   curl -X POST .../api/submit/word-count \
//     -H "authorization: Bearer ts_..." \
//     --data-binary @.trap/word-count/<ts>/report.json
//
// Wire format: see trapstreet/docs/scoring-and-metrics.md "Upload protocol".
//
// Response: { run, view_url } — view_url is a hint for terminals to print
// a clickable link.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ task_id: string }> },
) {
  const solution = await authSolution(req.headers.get("authorization"));
  if (!solution) return ERR.unauthorized();

  const { task_id } = await params;
  const task = await getTask(task_id);
  if (!task) return ERR.notFound(`task ${task_id} does not exist`);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ERR.invalid("body must be valid JSON (the trap CLI's report.json)");
  }

  const validation = validate(body);
  if (validation.error) return ERR.invalid(validation.error);

  // Public-task rule: solution's metadata.repo must be a publicly
  // reachable URL. Private tasks have no such requirement — owners can
  // experiment without exposing their solver.
  if (task.visibility === "public") {
    const metadata = (body as { metadata?: Record<string, unknown> }).metadata;
    const repo = typeof metadata?.repo === "string" ? metadata.repo : null;
    if (!repo) {
      return ERR.invalid(
        "this task is public — your solution's metadata.repo is missing. " +
          "Push your solver to a public git repo (or set `repo:` under " +
          "`metadata:` in trap.yaml), then re-submit. tp run auto-detects " +
          "the URL from `git remote -v` when the solution dir is a git repo.",
      );
    }
    const check = await verifyPublicRepo(repo);
    if (!check.ok) {
      return ERR.invalid(
        `this task is public — your solution's repo must be publicly accessible. ${check.reason}. ` +
          "Push your code to a public GitHub repo, then re-submit.",
      );
    }
  }

  // Route the run to the right solution under the authenticated user:
  // - body.solution set → lookup-or-create that named solution
  // - body.solution absent → auto-pick the next `<user-slug>-<n>`
  const requestedName =
    typeof (body as { solution?: unknown }).solution === "string"
      ? ((body as { solution?: string }).solution as string).trim() || null
      : null;
  const target = await resolveSubmitSolution(
    { id: solution.id, user_id: solution.user_id },
    requestedName,
  );

  const run = await submitRun({
    task_id,
    solution_id: target.id,
    payload: body as CliUpload,
  });
  if (!run) return ERR.internal("submission failed");

  const origin = new URL(req.url).origin;
  return ok({
    run,
    view_url: `${origin}/runs/${run.id}`,
  });
}

function validate(body: unknown): { error: string | null } {
  if (!body || typeof body !== "object")
    return { error: "body must be an object" };
  const b = body as Record<string, unknown>;
  if (typeof b.task_id !== "string")
    return { error: "task_id is required (string)" };
  if (!Array.isArray(b.cases)) return { error: "cases must be an array" };

  // summary is optional — server auto-computes if absent. When present,
  // require the two headline keys.
  if (b.summary !== undefined) {
    if (!b.summary || typeof b.summary !== "object")
      return { error: "summary must be an object when present" };
    const s = b.summary as Record<string, unknown>;
    if (typeof s.passed !== "boolean")
      return { error: "summary.passed must be a boolean" };
    if (typeof s.score !== "number")
      return { error: "summary.score must be a number" };
  }

  // metadata is optional but if present must be an object
  if (b.metadata !== undefined && (b.metadata === null || typeof b.metadata !== "object")) {
    return { error: "metadata must be an object when present" };
  }

  // solution is optional; when present must be a non-empty string that
  // fits the same shape we accept for auto-generated names.
  if (b.solution !== undefined) {
    if (typeof b.solution !== "string") {
      return { error: "solution must be a string when present" };
    }
    const s = b.solution.trim();
    if (s && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(s)) {
      return {
        error:
          "solution name must be 1-64 chars, alphanumerics plus . _ - (no spaces)",
      };
    }
  }

  return { error: null };
}
