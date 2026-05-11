import {
  authRunner,
  getRun,
  ingestCliUpload,
  type CliUpload,
} from "@/lib/queries";
import { ERR, ok } from "@/lib/api";

// POST /api/runs/:id/result — ingest the CLI's output JSON, transition the
// run to `scored`. Body must match the `tp` CLI output shape:
//
//   { task: {...}, cases: [...], run_counts: {...}, grader_metrics: {...} }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const runner = await authRunner(req.headers.get("authorization"));
  if (!runner) return ERR.unauthorized();

  const { id } = await params;
  const run = await getRun(id);
  if (!run) return ERR.notFound("run not found");
  if (run.runner_id !== runner.id) {
    return ERR.forbidden("run owned by another runner");
  }
  if (run.status === "scored" || run.status === "failed") {
    return ERR.invalid(`run is terminal (${run.status})`);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ERR.invalid("body must be valid JSON");
  }

  const validation = validate(body);
  if (validation.error) return ERR.invalid(validation.error);

  const updated = await ingestCliUpload(id, body as CliUpload);
  return ok({ run: updated });
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
