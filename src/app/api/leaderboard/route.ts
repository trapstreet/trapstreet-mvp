import { NextRequest } from "next/server";
import { leaderboardEntries } from "@/lib/queries";
import { ok } from "@/lib/api";

export async function GET(req: NextRequest) {
  const track = req.nextUrl.searchParams.get("track") ?? undefined;
  const task_id = req.nextUrl.searchParams.get("task_id") ?? undefined;
  const entries = await leaderboardEntries({ track, task_id });
  return ok({ entries });
}
