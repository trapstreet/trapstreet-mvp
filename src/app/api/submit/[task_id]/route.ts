import {
  authRunner,
  getTask,
  submitRun,
  type CliUpload,
} from "@/lib/queries";
import { ERR, ok } from "@/lib/api";

// POST /api/submit/:task_id — combined endpoint. Opens a run and ingests
// the CLI's report.json in one HTTP call so runners can copy-paste a
// single curl command. Body is the trap CLI report.json verbatim.
//
//   curl -X POST .../api/submit/word-count \
//     -H "authorization: Bearer ts_..." \
//     --data-binary @.trap/word-count/<ts>/report.json
//
// Response: { run, view_url } — view_url is a hint for terminals to print
// a clickable link.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ task_id: string }> },
) {
  const runner = await authRunner(req.headers.get("authorization"));
  if (!runner) return ERR.unauthorized();

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

  const run = await submitRun({
    task_id,
    runner_id: runner.id,
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
  if (!body || typeof body !== "object") return { error: "body must be an object" };
  const b = body as Record<string, unknown>;
  if (!b.task || typeof b.task !== "object") return { error: "task is required" };
  if (!Array.isArray(b.cases)) return { error: "cases must be an array" };
  if (!b.run_counts || typeof b.run_counts !== "object")
    return { error: "run_counts is required" };
  const rc = b.run_counts as Record<string, unknown>;
  if (
    typeof rc.passed !== "number" ||
    typeof rc.failed !== "number" ||
    typeof rc.skipped !== "number"
  ) {
    return { error: "run_counts.passed/failed/skipped must be numbers" };
  }
  if (!b.grader_metrics || typeof b.grader_metrics !== "object")
    return { error: "grader_metrics is required" };
  const gm = b.grader_metrics as Record<string, unknown>;
  if (typeof gm.passed !== "boolean")
    return { error: "grader_metrics.passed must be a boolean" };
  if (typeof gm.score !== "number")
    return { error: "grader_metrics.score must be a number" };
  return { error: null };
}
