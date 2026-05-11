import { authRunner, createRun, getTask } from "@/lib/queries";
import { ERR, ok } from "@/lib/api";

export async function POST(req: Request) {
  const runner = await authRunner(req.headers.get("authorization"));
  if (!runner) return ERR.unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ERR.invalid("body must be valid JSON");
  }
  const { task_id } = (body ?? {}) as { task_id?: string };
  if (!task_id) return ERR.invalid("task_id is required");

  const task = await getTask(task_id);
  if (!task) return ERR.invalid(`task ${task_id} does not exist`);

  const run = await createRun({ task_id, runner_id: runner.id });
  return ok({ run });
}
