import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load .env.local first (Next.js convention), then fall back to .env.
config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required for drizzle-kit");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
