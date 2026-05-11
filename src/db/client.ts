import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Get a free Neon Postgres URL at " +
      "https://neon.tech and put it in .env.local. See README.",
  );
}

const sql = neon(url);
export const db = drizzle({ client: sql, schema });
export { schema };
