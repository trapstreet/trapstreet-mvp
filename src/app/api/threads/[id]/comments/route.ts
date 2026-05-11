import {
  authRunner,
  createComment,
  getThread,
} from "@/lib/queries";
import { ERR, ok } from "@/lib/api";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const runner = await authRunner(req.headers.get("authorization"));
  if (!runner) return ERR.unauthorized();

  const { id } = await params;
  const thread = await getThread(id);
  if (!thread) return ERR.notFound("thread not found");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ERR.invalid("body must be valid JSON");
  }
  const { body: text } = (body ?? {}) as { body?: string };
  if (!text || text.length === 0) return ERR.invalid("body is required");

  const comment = await createComment({
    thread_id: id,
    author_id: runner.id,
    body: text,
  });
  return ok({ comment });
}
