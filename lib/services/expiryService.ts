import { PrismaClient, ReservationStatus } from '@prisma/client'
import { DatabaseError } from '@/lib/errors'
import { ReservationService } from './reservationService'

const prisma = new PrismaClient()

export class ExpiryService {
  /**
   * Releases all expired pending reservations.
   */
  static async getReleaseExpired(): Promise<number> {
    try {
      const expiredReservations = await prisma.reservation.findMany({
        where: {
          status: ReservationStatus.pending,
          expiresAt: {
            lt: new Date(),
          },
        },
        select: {
          id: true,
        },
      })

      let releasedCount = 0

      for (const reservation of expiredReservations) {
        try {
          const released = await ReservationService.releaseReservation(reservation.id)
          if (released) {
            releasedCount += 1
          }
        } catch (error) {
          console.error(`Failed to release reservation ${reservation.id}`, error)
        }
      }

      console.log(`Released ${releasedCount} expired reservations`)
      return releasedCount
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new DatabaseError(`Failed to process expired reservations: ${error.message}`)
      }
      throw new DatabaseError('Unknown expired cleanup failure')
    }
  }
}
