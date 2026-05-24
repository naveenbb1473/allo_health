/**
 * Prisma client singleton
 *
 * We use PrismaPg (driver-adapter) so Prisma delegates connection management
 * to the `pg` Pool. The `?pgbouncer=true` query param is a Prisma-only hint
 * that pg.Pool does not understand — strip it before constructing the pool.
 *
 * Pool size is kept at 10 to stay within Supabase free-tier limits. Raising
 * it higher causes ECONNREFUSED when the pooler's slot cap is hit.
 */
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Strip Prisma-only hints that pg.Pool does not understand
function sanitizeConnectionString(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("pgbouncer");
    return parsed.toString();
  } catch {
    return url;
  }
}

const connectionString = sanitizeConnectionString(process.env.DATABASE_URL);

// Keep pool size very low — Supabase free-tier has max 25 connections total.
// With 50 concurrent serverless fns × max=2 = 100 would still exceed the cap.
// At max=2 we handle bursts gracefully with PgBouncer queueing the rest.
const pool = new Pool({
  connectionString,
  max: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

const adapter = new PrismaPg(pool);

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// Cache singleton in all environments to avoid pool proliferation
globalForPrisma.prisma = prisma;

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

export default prisma;
