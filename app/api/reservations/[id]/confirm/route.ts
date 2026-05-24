import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ReservationService } from "@/lib/services/reservationService";
import {
  ExpiredReservationError,
  NotFoundError,
  InvalidReservationStateError,
  DatabaseError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * POST /api/reservations/[id]/confirm
 *
 * Confirms a pending reservation.
 *
 * Rules:
 * - Reservation must exist             → 404
 * - Reservation must still be pending  → 400
 * - Reservation must not be expired    → 410
 * - Reserved stock remains reserved after confirmation
 *
 * Success response:
 * { id, status: "confirmed", confirmedAt, items }
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = `req_${crypto.randomUUID()}`;
  const { id: reservationId } = await params;

  try {
    logger.info("[POST /api/reservations/:id/confirm] Confirmation attempt", {
      requestId,
      reservationId,
    });

    const reservation =
      await ReservationService.confirmReservation(reservationId);

    logger.info("[POST /api/reservations/:id/confirm] Reservation confirmed", {
      requestId,
      reservationId,
      status: reservation.status,
      confirmedAt: reservation.confirmedAt,
    });

    return NextResponse.json(
      {
        id: reservation.id,
        status: reservation.status,
        confirmedAt: reservation.confirmedAt?.toISOString() ?? null,
        items: reservation.items,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    // ── Invalid state (already confirmed/released) or missing reservationId ──
    if (
      error instanceof ValidationError ||
      error instanceof InvalidReservationStateError
    ) {
      logger.warn("[POST /api/reservations/:id/confirm] Invalid request", {
        requestId,
        reservationId,
        message: (error as Error).message,
      });

      return NextResponse.json(
        {
          error: "INVALID_RESERVATION_STATE",
          message: (error as Error).message,
        },
        { status: 400 },
      );
    }

    // ── Reservation has expired ───────────────────────────────────────────────
    if (error instanceof ExpiredReservationError) {
      logger.warn("[POST /api/reservations/:id/confirm] Reservation expired", {
        requestId,
        reservationId,
      });

      return NextResponse.json(
        { error: "RESERVATION_EXPIRED", message: "Reservation has expired" },
        { status: 410 },
      );
    }

    // ── Not found ─────────────────────────────────────────────────────────────
    if (error instanceof NotFoundError) {
      logger.warn(
        "[POST /api/reservations/:id/confirm] Reservation not found",
        {
          requestId,
          reservationId,
        },
      );

      return NextResponse.json(
        { error: "RESERVATION_NOT_FOUND", message: "Reservation not found" },
        { status: 404 },
      );
    }

    // ── Database / transaction failure ────────────────────────────────────────
    if (error instanceof DatabaseError) {
      logger.error("[POST /api/reservations/:id/confirm] Database error", {
        requestId,
        reservationId,
        message: (error as Error).message,
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
    logger.error("[POST /api/reservations/:id/confirm] Unknown error", {
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
