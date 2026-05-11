import { getThread, listComments } from "@/lib/queries";
import { ERR, ok } from "@/lib/api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const thread = await getThread(id);
  if (!thread) return ERR.notFound("thread not found");
  const comments = await listComments(id);
  return ok({ thread, comments });
}
