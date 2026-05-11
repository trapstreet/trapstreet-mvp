import { NextRequest } from "next/server";
import { listTasks } from "@/lib/queries";
import { ok } from "@/lib/api";

export async function GET(req: NextRequest) {
  const track = req.nextUrl.searchParams.get("track") ?? undefined;
  const tasks = await listTasks({ track });
  return ok({ tasks });
}
