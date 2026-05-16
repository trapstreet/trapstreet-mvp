import { auth } from "@/auth";
import { deleteTask, getTask } from "@/lib/queries";
import { ERR, ok } from "@/lib/api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const task = await getTask(id);
  if (!task) return ERR.notFound("task not found");
  return ok({ task });
}

// Only the task's creator can delete it. Seeded tasks (created_by null)
// are not deletable through the API. Runs / cases cascade via the FK.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return ERR.unauthorized();

  const task = await getTask(id);
  if (!task) return ERR.notFound("task not found");
  if (task.created_by !== session.user.id) {
    return ERR.forbidden("only the task's creator can delete it");
  }

  await deleteTask(id);
  return ok({ deleted: id });
}
