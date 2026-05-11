import { NextRequest } from "next/server";
import {
  authRunner,
  createThread,
  listThreads,
  subjectExists,
} from "@/lib/queries";
import { ERR, ok } from "@/lib/api";

const SUBJECT_TYPES = ["task", "track", "run", "runner"] as const;
type SubjectType = (typeof SUBJECT_TYPES)[number];

export async function GET(req: NextRequest) {
  const subjectType =
    req.nextUrl.searchParams.get("subject_type") ?? undefined;
  const subjectId = req.nextUrl.searchParams.get("subject_id") ?? undefined;
  const threads = await listThreads({
    subject_type: subjectType,
    subject_id: subjectId,
  });
  return ok({ threads });
}

export async function POST(req: Request) {
  const runner = await authRunner(req.headers.get("authorization"));
  if (!runner) return ERR.unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ERR.invalid("body must be valid JSON");
  }
  const { title, subject, body: firstPostBody } = (body ?? {}) as {
    title?: string;
    subject?: { type?: SubjectType; id?: string };
    body?: string;
  };

  if (!title || title.length > 200) {
    return ERR.invalid("title is required and must be ≤ 200 chars");
  }
  if (!subject?.type || !subject.id) {
    return ERR.invalid("subject.type and subject.id are required");
  }
  if (!SUBJECT_TYPES.includes(subject.type)) {
    return ERR.invalid(`subject.type must be one of ${SUBJECT_TYPES.join(", ")}`);
  }
  if (!(await subjectExists(subject.type, subject.id))) {
    return ERR.invalid(`subject ${subject.type}/${subject.id} does not exist`);
  }

  const thread = await createThread({
    title,
    author_id: runner.id,
    subject_type: subject.type,
    subject_id: subject.id,
    body: firstPostBody,
  });
  return ok({ thread });
}
