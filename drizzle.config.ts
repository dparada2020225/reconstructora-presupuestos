import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { urlParaScripts } from "./scripts/db-url";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: urlParaScripts(process.env.DATABASE_URL) },
  strict: true,
  verbose: true,
});
