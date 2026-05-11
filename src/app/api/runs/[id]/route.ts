import { authRunner, getRun, updateRun } from "@/lib/queries";
import { ERR, ok } from "@/lib/api";

// GET /api/runs/:id — public
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) return ERR.notFound("run not found");
  return ok({ run });
}

// PATCH /api/runs/:id — limited to marking a run failed. Success/scoring
// goes through POST /api/runs/:id/result (which accepts the CLI JSON).
export async function PATCH(
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
  const { status, error_message } = (body ?? {}) as {
    status?: string;
    error_message?: string;
  };

  if (status !== "failed") {
    return ERR.invalid("only status=failed is supported via PATCH");
  }
  const updated = await updateRun(id, {
    status: "failed",
    error_message: error_message ?? null,
    finished_at: new Date(),
  });
  return ok({ run: updated });
}
