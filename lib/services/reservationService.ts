import { Prisma, ReservationStatus } from "@prisma/client";
import {
  ValidationError,
  OutOfStockError,
  DatabaseError,
  NotFoundError,
  ExpiredReservationError,
  InvalidReservationStateError,
} from "@/lib/errors";
import { prisma } from "@/lib/db";

export interface ReservationItemResponse {
  productId: string;
  warehouseId: string;
  quantity: number;
}

export interface ReservationResponse {
  id: string;
  customerId: string;
  status: ReservationStatus;
  expiresAt: Date;
  confirmedAt?: Date | null;
  releasedAt?: Date | null;
  items: ReservationItemResponse[];
}

type StockRow = {
  id: string;
  productId: string;
  warehouseId: string;
  totalUnits: number;
  reservedUnits: number;
};

export async function reserve(
  productId: string,
  warehouseId: string,
  quantity: number,
  customerId: string,
  expiryMinutes = 10,
): Promise<ReservationResponse | null> {
  if (!productId) throw new ValidationError("productId is required");
  if (!warehouseId) throw new ValidationError("warehouseId is required");
  if (!customerId) throw new ValidationError("customerId is required");
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ValidationError("quantity must be a positive integer");
  }
  if (!Number.isInteger(expiryMinutes) || expiryMinutes <= 0) {
    throw new ValidationError("expiryMinutes must be positive");
  }

  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const lockedRows = await tx.$queryRaw<StockRow[]>`
          SELECT *
          FROM "Stock"
          WHERE "productId" = ${productId}
            AND "warehouseId" = ${warehouseId}
          FOR UPDATE NOWAIT
        `;

        if (lockedRows.length === 0) {
          throw new OutOfStockError("Stock record not found");
        }

        const stock = lockedRows[0];
        const available = stock.totalUnits - stock.reservedUnits;

        if (available < quantity) {
          throw new OutOfStockError(
            `Insufficient inventory. Available=${available}, requested=${quantity}`,
          );
        }

        const reservation = await tx.reservation.create({
          data: {
            customerId,
            status: ReservationStatus.pending,
            expiresAt,
            items: {
              create: { productId, warehouseId, quantity },
            },
          },
          include: { items: true },
        });

        await tx.stock.update({
          where: {
            productId_warehouseId: { productId, warehouseId },
          },
          data: {
            reservedUnits: { increment: quantity },
          },
        });

        return {
          id: reservation.id,
          customerId: reservation.customerId,
          status: reservation.status,
          expiresAt: reservation.expiresAt,
          items: reservation.items.map((item) => ({
            productId: item.productId,
            warehouseId: item.warehouseId,
            quantity: item.quantity,
          })),
        } satisfies ReservationResponse;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );

    return result;
  } catch (error: unknown) {
    if (error instanceof ValidationError) throw error;
    if (error instanceof OutOfStockError) return null;

    // Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2034") {
        return null; // Transaction conflict
      }
      if (error.code === "P2024" || error.code === "P1008") {
        // Connection pool exhausted or operation timed out under heavy load
        return null;
      }
      console.error(
        "[reserve] PrismaClientKnownRequestError",
        error.code,
        error.message,
      );
      throw new DatabaseError(`Database transaction failed: ${error.message}`);
    }

    // PostgreSQL raw lock error
    if (
      error instanceof Error &&
      (error.message.includes("55P03") ||
        error.message.includes("could not obtain lock") ||
        error.message.includes("lock_not_available") ||
        error.message.includes("deadlock detected") ||
        error.message.includes("serialization"))
    ) {
      return null;
    }

    // Connection-level errors (pool exhausted, ECONNREFUSED, network blips)
    // These surface as AggregateError or generic Error with ECONNREFUSED code
    if (
      error instanceof AggregateError ||
      (error instanceof Error &&
        (("code" in error &&
          (error as NodeJS.ErrnoException).code === "ECONNREFUSED") ||
          error.message.includes("ECONNREFUSED") ||
          error.message.includes("connect ETIMEDOUT") ||
          error.message.includes("Connection terminated") ||
          error.message.includes("connection timeout") ||
          error.message.includes("too many clients")))
    ) {
      // Treat as transient overload — caller gets 409 (service unavailable / conflict)
      return null;
    }

    console.error("[reserve] Full database error", {
      error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new DatabaseError("Reservation transaction failed");
  }
}

export class ReservationService {
  static async confirmReservation(
    reservationId: string,
  ): Promise<ReservationResponse> {
    if (!reservationId) {
      throw new ValidationError("reservationId is required");
    }

    try {
      return await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              customerId: string;
              status: ReservationStatus;
              expiresAt: Date;
              confirmedAt: Date | null;
              releasedAt: Date | null;
            }>
          >`
            SELECT *
            FROM "Reservation"
            WHERE "id" = ${reservationId}
            FOR UPDATE NOWAIT
          `;

          if (rows.length === 0) {
            throw new NotFoundError("Reservation not found");
          }

          const reservation = rows[0];

          if (reservation.status !== ReservationStatus.pending) {
            throw new InvalidReservationStateError(
              `Reservation status is ${reservation.status}, expected pending`,
            );
          }

          if (new Date(reservation.expiresAt) < new Date()) {
            throw new ExpiredReservationError("Reservation has expired");
          }

          const updated = await tx.reservation.update({
            where: { id: reservationId },
            data: {
              status: ReservationStatus.confirmed,
              confirmedAt: new Date(),
            },
            include: { items: true },
          });

          return {
            id: updated.id,
            customerId: updated.customerId,
            status: updated.status,
            expiresAt: updated.expiresAt,
            confirmedAt: updated.confirmedAt,
            releasedAt: updated.releasedAt,
            items: updated.items.map((item) => ({
              productId: item.productId,
              warehouseId: item.warehouseId,
              quantity: item.quantity,
            })),
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error: unknown) {
      if (
        error instanceof ValidationError ||
        error instanceof NotFoundError ||
        error instanceof ExpiredReservationError ||
        error instanceof InvalidReservationStateError
      ) {
        throw error;
      }

      if (error instanceof Error) {
        throw new DatabaseError(
          `Failed to confirm reservation: ${error.message}`,
        );
      }

      throw new DatabaseError("Unknown confirmation failure");
    }
  }

  static async releaseReservation(reservationId: string): Promise<boolean> {
    if (!reservationId) {
      throw new ValidationError("reservationId is required");
    }

    try {
      return await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{ id: string; status: ReservationStatus }>
          >`
            SELECT *
            FROM "Reservation"
            WHERE "id" = ${reservationId}
            FOR UPDATE NOWAIT
          `;

          if (rows.length === 0) {
            throw new NotFoundError("Reservation not found");
          }

          const reservation = rows[0];

          if (
            reservation.status === ReservationStatus.released ||
            reservation.status === ReservationStatus.confirmed
          ) {
            return false;
          }

          const items = await tx.reservationItem.findMany({
            where: { reservationId },
          });

          for (const item of items) {
            await tx.$queryRaw`
              SELECT *
              FROM "Stock"
              WHERE "productId" = ${item.productId}
                AND "warehouseId" = ${item.warehouseId}
              FOR UPDATE
            `;

            await tx.stock.update({
              where: {
                productId_warehouseId: {
                  productId: item.productId,
                  warehouseId: item.warehouseId,
                },
              },
              data: {
                reservedUnits: { decrement: item.quantity },
              },
            });
          }

          await tx.reservation.update({
            where: { id: reservationId },
            data: {
              status: ReservationStatus.released,
              releasedAt: new Date(),
            },
          });

          return true;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error: unknown) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new DatabaseError(
          `Failed to release reservation: ${error.message}`,
        );
      }

      throw new DatabaseError("Unknown release failure");
    }
  }

  /**
   * Finds all pending reservations that have passed their expiresAt timestamp
   * and releases each one atomically.
   * Safe to call from a cron job or API route — idempotent per reservation.
   * Returns the count of reservations actually released.
   */
  static async getReleaseExpired(): Promise<number> {
    const now = new Date();

    // Fetch IDs only — each release is its own transaction
    const expired = await prisma.reservation.findMany({
      where: {
        status: ReservationStatus.pending,
        expiresAt: { lt: now },
      },
      select: { id: true },
    });

    if (expired.length === 0) {
      console.log("[getReleaseExpired] No expired reservations found");
      return 0;
    }

    console.log(
      `[getReleaseExpired] Found ${expired.length} expired reservation(s) — releasing...`,
    );

    let releasedCount = 0;

    for (const { id } of expired) {
      try {
        const released = await ReservationService.releaseReservation(id);
        if (released) {
          releasedCount++;
          console.log(`[getReleaseExpired] Released reservation ${id}`);
        } else {
          // Already released or confirmed between our SELECT and transaction — skip
          console.log(
            `[getReleaseExpired] Skipped reservation ${id} (already processed)`,
          );
        }
      } catch (error) {
        // Log and continue — don't let one failure abort the rest
        console.error(
          `[getReleaseExpired] Failed to release reservation ${id}:`,
          error,
        );
      }
    }

    console.log(
      `[getReleaseExpired] Done — released ${releasedCount}/${expired.length}`,
    );
    return releasedCount;
  }
}
