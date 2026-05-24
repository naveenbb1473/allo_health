import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // In Prisma v7, directUrl is removed. Use DIRECT_URL here so that
    // CLI commands (migrate, studio) bypass PgBouncer and connect directly.
    url: env("DIRECT_URL"),
  },
});
