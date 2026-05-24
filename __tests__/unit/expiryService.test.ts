import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { ExpiryService } from '@/services/expiry.service'

const { mockFindMany } = vi.hoisted(() => ({ mockFindMany: vi.fn() }))

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: vi.fn().mockImplementation(() => ({
      reservation: {
        findMany: mockFindMany,
      },
    })),
    ReservationStatus: {
      pending: 'pending',
    },
  }
})

vi.mock('@/lib/db', () => ({
  default: {
    $transaction: vi.fn(async (cb) => {
      // Mock enough tx methods for markAsExpired
      return cb({
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'r1', status: 'pending' }]),
        reservation: { update: vi.fn() },
        reservationItem: { findMany: vi.fn().mockResolvedValue([]) },
        stock: { update: vi.fn() },
      })
    }),
    reservation: {
      findMany: mockFindMany,
    },
  },
  prisma: {
    reservation: {
      findMany: mockFindMany,
    },
  }
}))

describe('expiryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should release expired reservations', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'r1' },
      { id: 'r2' },
    ])

    const markSpy = vi.spyOn(ExpiryService, 'markAsExpired')
    markSpy.mockResolvedValue(true)

    const result = await ExpiryService.releaseExpiredReservations()

    expect(result.released).toBe(2)
    expect(result.failed).toBe(0)
  })
})
