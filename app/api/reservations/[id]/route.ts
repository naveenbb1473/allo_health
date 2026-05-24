import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ReservationService } from "@/lib/services/reservationService";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { generateErrorId } from "@/lib/utils/errors";
import { logger } from "@/lib/logger";

/**
 * GET /api/reservations/[id]
 *
 * Returns full reservation details including items, product info,
 * warehouse info, and expiry countdown.
 *
 * Response:
 * { id, customerId, status, createdAt, expiresAt, confirmedAt, releasedAt,
 *   expiresInSeconds, isExpired, items: [{ id, productId, warehouseId, quantity,
 *   product: {...}, warehouse: {...} }] }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = `req_${crypto.randomUUID()}`;
  const { id: reservationId } = await params;

  try {
    logger.info("[GET /api/reservations/:id] Fetch reservation", {
      requestId,
      reservationId,
    });

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        items: {
          select: {
            id: true,
            productId: true,
            warehouseId: true,
            quantity: true,
            product: {
              select: { id: true, name: true, description: true, price: true },
            },
            warehouse: {
              select: { id: true, name: true, location: true },
            },
          },
        },
      },
    });

    if (!reservation) {
      logger.warn("[GET /api/reservations/:id] Not found", {
        requestId,
        reservationId,
      });

      return NextResponse.json(
        { error: "RESERVATION_NOT_FOUND", message: "Reservation not found" },
        {
          status: 404,
          headers: {
            "Cache-Control": "private, max-age=0, stale-while-revalidate=30",
          },
        },
      );
    }

    const now = Date.now();
    const expiresInSeconds = Math.max(
      0,
      Math.floor((reservation.expiresAt.getTime() - now) / 1000),
    );
    const isExpired = reservation.expiresAt < new Date();

    const response = {
      id: reservation.id,
      customerId: reservation.customerId,
      status: reservation.status,
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
      expiresAt: reservation.expiresAt.toISOString(),
      confirmedAt: reservation.confirmedAt?.toISOString() ?? null,
      releasedAt: reservation.releasedAt?.toISOString() ?? null,
      expiresInSeconds,
      isExpired,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: reservation.items.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity,
        product: {
          id: item.product.id,
          name: item.product.name,
          description: item.product.description,
          price: Number(item.product.price),
        },
        warehouse: {
          id: item.warehouse.id,
          name: item.warehouse.name,
          location: item.warehouse.location,
        },
      })),
    };

    logger.info("[GET /api/reservations/:id] Fetched", {
      requestId,
      reservationId,
      status: reservation.status,
      isExpired,
    });

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
      },
    });
  } catch (error: unknown) {
    logger.error("[GET /api/reservations/:id] Internal error", {
      requestId,
      reservationId,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : error,
    });

    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        errorId: requestId,
        message: "Database error - contact support with error ID",
      },
      { status: 500, headers: { "Cache-Control": "private, max-age=0" } },
    );
  }
}

/**
 * DELETE /api/reservations/[id]
 * Releases a reservation: updates status to 'released', decrements stock.reservedUnits.
 * Returns 200 on success, 404 if not found.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const requestId = generateErrorId();

  try {
    const released = await ReservationService.releaseReservation(id);

    if (!released) {
      return NextResponse.json(
        { message: "Reservation already processed" },
        { status: 200 },
      );
    }

    logger.info("DELETE /api/reservations/[id] - released", {
      requestId,
      reservationId: id,
    });
    return NextResponse.json(
      { message: "Reservation released" },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: error.message },
        { status: 400 },
      );
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: error.message },
        { status: 404 },
      );
    }
    const errorId = generateErrorId();
    logger.error("DELETE /api/reservations/[id] - error", {
      requestId,
      reservationId: id,
      errorId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "Failed to release reservation",
        errorId,
      },
      { status: 500 },
    );
  }
}
