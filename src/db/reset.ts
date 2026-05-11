// Drops all tables in the public schema and re-pushes. v0 destructive reset.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = neon(url);
  console.log("dropping public schema…");
  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  console.log("dropped ✓");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
