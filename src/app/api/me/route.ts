import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { authSolution } from "@/lib/queries";
import { ERR, ok } from "@/lib/api";

export async function GET(req: Request) {
  const solution = await authSolution(req.headers.get("authorization"));
  if (!solution) return ERR.unauthorized();

  let user = null;
  if (solution.user_id) {
    const rows = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, solution.user_id))
      .limit(1);
    user = rows[0] ?? null;
  }
  return ok({ solution: { name: solution.name }, user });
}
