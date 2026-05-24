import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * GET /api/warehouses
 *
 * Returns all warehouses ordered by creation date.
 * Response is publicly cacheable for 60s (slow-changing data).
 *
 * Response:
 * [{ id, name, location, createdAt, updatedAt }]
 */
export async function GET(): Promise<NextResponse> {
  const requestId = `req_${crypto.randomUUID()}`;

  try {
    const warehouses = await prisma.warehouse.findMany({
      select: {
        id: true,
        name: true,
        location: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    logger.info("[GET /api/warehouses] Fetched", {
      requestId,
      count: warehouses.length,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = warehouses.map((w: any) => ({
      id: w.id,
      name: w.name,
      location: w.location,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    }));

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error: unknown) {
    logger.error("[GET /api/warehouses] Internal error", {
      requestId,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : error,
    });

    return NextResponse.json(
      { 
        error: "Internal server error", 
        errorId: requestId,
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 },
    );
  }
}
