import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { createTask, getTask, listTasks } from "@/lib/queries";
import { ERR, ok } from "@/lib/api";
import type { RankingDirection, RankingMetric, TaskVisibility } from "@/db/schema";

const ALLOWED_METRICS: RankingMetric[] = [
  "total_score",
  "latency_ms",
  "cost_usd",
  "cases_passed",
];

export async function GET(req: NextRequest) {
  const track = req.nextUrl.searchParams.get("track") ?? undefined;
  const session = await auth();
  const tasks = await listTasks({
    track,
    viewer_id: session?.user?.id ?? null,
  });
  return ok({ tasks });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return ERR.unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ERR.invalid("body must be valid JSON");
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const id = String(b.id ?? "").trim();
  const name = String(b.name ?? "").trim();
  // track is optional; defaults to "community" when blank
  const track = String(b.track ?? "").trim() || "community";
  const description = String(b.description ?? "");
  const traptask_ref = String(b.traptask_ref ?? "").trim();
  const ranking_metric = String(b.ranking_metric ?? "total_score") as RankingMetric;
  const ranking_direction = (b.ranking_direction === "asc" ? "asc" : "desc") as RankingDirection;
  const rules_md = String(b.rules_md ?? "");
  // io_md was an experimental second textarea split out of the README;
  // we abandoned the heuristic split. The column stays with default "".
  const visibility = (b.visibility === "private" ? "private" : "public") as TaskVisibility;

  // The 3 required fields. Everything else has a sensible default.
  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    return ERR.invalid("id is required, lowercase letters / digits / dashes only");
  }
  if (!name) return ERR.invalid("name is required");
  if (!traptask_ref) return ERR.invalid("traptask_ref is required");
  if (!ALLOWED_METRICS.includes(ranking_metric)) {
    return ERR.invalid("invalid ranking_metric");
  }

  if (await getTask(id)) {
    return ERR.conflict(`task id "${id}" already taken`);
  }

  const task = await createTask({
    id,
    name,
    track,
    description,
    traptask_ref,
    ranking_metric,
    ranking_direction,
    rules_md,
    io_md: "",
    visibility,
    created_by: session.user.id,
  });
  return ok({ task });
}
