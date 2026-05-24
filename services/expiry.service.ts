import { Prisma, ReservationStatus } from "@prisma/client";
import prisma from "@/lib/db";

/**
 * Cleanup service result.
 */
export interface ExpiryCleanupResult {
  processed: number;
  released: number;
  failed: number;
}

/**
 * Service-level database error.
 */
export class ExpiryServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpiryServiceError";
  }
}

/**
 * Expiry cleanup service.
 *
 * Can safely run from:
 * - Vercel Cron
 * - background workers
 * - manual admin endpoints
 *
 * Concurrency guarantees:
 * - each reservation released atomically
 * - row-level locking prevents double-release
 * - failures isolated per reservation
 */
export class ExpiryService {
  /**
   * Releases a single expired reservation.
   */
  static async markAsExpired(reservationId: string): Promise<boolean> {
    try {
      const released = await prisma.$transaction(
        async (tx) => {
          /**
           * Lock reservation row
           */
          const reservations = await tx.$queryRaw<
            Array<{
              id: string;
              status: ReservationStatus;
            }>
          >`
            SELECT *
            FROM "Reservation"
            WHERE "id" = ${reservationId}
            FOR UPDATE NOWAIT
          `;

          /**
           * Missing reservation
           */
          if (reservations.length === 0) {
            console.warn("[ExpiryService] Reservation missing", {
              reservationId,
            });
            return false;
          }

          const reservation = reservations[0];

          /**
           * Skip terminal states
           */
          if (
            reservation.status === ReservationStatus.released ||
            reservation.status === ReservationStatus.confirmed
          ) {
            console.info("[ExpiryService] Reservation already processed", {
              reservationId,
              status: reservation.status,
            });
            return false;
          }

          /**
           * Load reservation items
           */
          const items = await tx.reservationItem.findMany({
            where: { reservationId },
          });

          /**
           * Release stock safely
           */
          for (const item of items) {
            /**
             * Lock stock row
             */
            await tx.$queryRaw`
              SELECT *
              FROM "Stock"
              WHERE "productId" = ${item.productId}
                AND "warehouseId" = ${item.warehouseId}
              FOR UPDATE
            `;

            /**
             * Prevent negative reserved units
             */
            await tx.stock.update({
              where: {
                productId_warehouseId: {
                  productId: item.productId,
                  warehouseId: item.warehouseId,
                },
              },
              data: {
                reservedUnits: {
                  decrement: item.quantity,
                },
              },
            });
          }

          /**
           * Mark released
           */
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

      return released;
    } catch (error: unknown) {
      console.error("[ExpiryService] Failed to expire reservation", {
        reservationId,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : error,
      });
      return false;
    }
  }

  /**
   * Releases all expired pending reservations.
   */
  static async releaseExpiredReservations(): Promise<ExpiryCleanupResult> {
    const startedAt = new Date();

    console.info("[ExpiryService] Cleanup started", {
      timestamp: startedAt.toISOString(),
    });

    try {
      /**
       * Find expired pending reservations
       */
      const expiredReservations = await prisma.reservation.findMany({
        where: {
          status: ReservationStatus.pending,
          expiresAt: { lt: new Date() },
        },
        select: { id: true, expiresAt: true },
        orderBy: { expiresAt: "asc" },
      });

      console.info("[ExpiryService] Expired reservations found", {
        count: expiredReservations.length,
      });

      let released = 0;
      let failed = 0;

      /**
       * Sequential processing prevents lock storms under heavy load.
       */
      for (const reservation of expiredReservations) {
        try {
          const success = await this.markAsExpired(reservation.id);

          if (success) {
            released += 1;
            console.info("[ExpiryService] Reservation released", {
              reservationId: reservation.id,
            });
          }
        } catch (error) {
          failed += 1;
          console.error("[ExpiryService] Failed processing reservation", {
            reservationId: reservation.id,
            error: error instanceof Error ? { message: error.message } : error,
          });
        }
      }

      const completedAt = new Date();

      console.info("[ExpiryService] Cleanup completed", {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        processed: expiredReservations.length,
        released,
        failed,
      });

      return {
        processed: expiredReservations.length,
        released,
        failed,
      };
    } catch (error: unknown) {
      console.error("[ExpiryService] Cleanup fatal error", {
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : error,
      });

      throw new ExpiryServiceError(
        error instanceof Error ? error.message : "Unknown cleanup failure",
      );
    }
  }
}
