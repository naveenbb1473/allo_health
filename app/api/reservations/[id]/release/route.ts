import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ReservationService } from "@/lib/services/reservationService";
import { NotFoundError, ValidationError, DatabaseError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * POST /api/reservations/[id]/release
 *
 * Releases a pending reservation:
 * - Updates status to 'released'
 * - Sets releasedAt to NOW()
 * - Decrements stock.reservedUnits for each item
 *
 * Returns:
 * - 200 if released (or already processed — idempotent)
 * - 404 if reservation not found
 * - 400 on invalid input
 * - 500 on database failure
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = `req_${crypto.randomUUID()}`;
  const { id: reservationId } = await params;

  try {
    logger.info("[POST /api/reservations/:id/release] Release attempt", {
      requestId,
      reservationId,
    });

    const released = await ReservationService.releaseReservation(reservationId);

    if (!released) {
      // Already released or confirmed — idempotent, treat as success
      logger.info("[POST /api/reservations/:id/release] Already processed", {
        requestId,
        reservationId,
      });

      return NextResponse.json(
        { message: "Reservation already processed" },
        { status: 200 },
      );
    }

    logger.info("[POST /api/reservations/:id/release] Released successfully", {
      requestId,
      reservationId,
    });

    return NextResponse.json(
      {
        id: reservationId,
        status: "released",
        message: "Reservation released",
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    // ── Missing reservationId ─────────────────────────────────────────────────
    if (error instanceof ValidationError) {
      logger.warn("[POST /api/reservations/:id/release] Validation error", {
        requestId,
        reservationId,
        message: error.message,
      });

      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: error.message },
        { status: 400 },
      );
    }

    // ── Not found ─────────────────────────────────────────────────────────────
    if (error instanceof NotFoundError) {
      logger.warn("[POST /api/reservations/:id/release] Not found", {
        requestId,
        reservationId,
      });

      return NextResponse.json(
        { error: "RESERVATION_NOT_FOUND", message: "Reservation not found" },
        { status: 404 },
      );
    }

    // ── Database / transaction failure ────────────────────────────────────────
    if (error instanceof DatabaseError) {
      logger.error("[POST /api/reservations/:id/release] Database error", {
        requestId,
        reservationId,
        message: error.message,
      });

      return NextResponse.json(
        {
          error: "INTERNAL_SERVER_ERROR",
          errorId: requestId,
          message: "Database error - contact support with error ID",
        },
        { status: 500 },
      );
    }

    // ── Unknown failure ───────────────────────────────────────────────────────
    logger.error("[POST /api/reservations/:id/release] Unknown error", {
      requestId,
      reservationId,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
    });

    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        errorId: requestId,
        message: "Database error - contact support with error ID",
      },
      { status: 500 },
    );
  }
}
