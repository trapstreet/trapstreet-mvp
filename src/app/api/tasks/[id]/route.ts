import { getTask } from "@/lib/queries";
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
