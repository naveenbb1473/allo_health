import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  reserve,
  ReservationService,
} from '@/lib/services/reservationService'

import { ExpiredReservationError } from '@/lib/errors'

import {
  reservationFactory,
  stockFactory,
} from '../fixtures/sample-data'

const { mockTransaction, mockQueryRaw, mockReservationCreate, mockStockUpdate, mockReservationUpdate } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockReservationCreate: vi.fn(),
  mockStockUpdate: vi.fn(),
  mockReservationUpdate: vi.fn(),
}))

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: vi.fn().mockImplementation(() => ({
      $transaction: mockTransaction,
      reservation: {
        update: mockReservationUpdate,
      },
    })),
    ReservationStatus: {
      pending: 'pending',
      confirmed: 'confirmed',
      released: 'released',
    },
    Prisma: {
      TransactionIsolationLevel: {
        Serializable: 'Serializable',
      },
      PrismaClientKnownRequestError: class extends Error {},
    },
  }
})

// We must also mock the singleton prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: mockTransaction,
    reservation: {
      update: mockReservationUpdate,
    },
  }
}))

function createMockTx() {
  return {
    $queryRaw: mockQueryRaw,
    reservation: {
      create: mockReservationCreate,
      update: mockReservationUpdate,
    },
    stock: {
      update: mockStockUpdate,
    },
    reservationItem: {
      findMany: vi.fn(),
    },
  }
}

describe('reservationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('reserve()', () => {
    it('should reserve inventory successfully', async () => {
      mockQueryRaw.mockResolvedValue([stockFactory()])
      mockReservationCreate.mockResolvedValue(reservationFactory())
      mockStockUpdate.mockResolvedValue({})

      mockTransaction.mockImplementation(async (callback: any) => {
        return callback(createMockTx())
      })

      const result = await reserve('product_1', 'warehouse_1', 1, 'customer_1')

      expect(result).not.toBeNull()
      expect(result?.customerId).toBe('customer_1')
      expect(mockStockUpdate).toHaveBeenCalled()
    })

    it('should return null when stock unavailable', async () => {
      mockQueryRaw.mockResolvedValue([
        stockFactory({
          totalUnits: 1,
          reservedUnits: 1,
        }),
      ])

      mockTransaction.mockImplementation(async (callback: any) => {
        return callback(createMockTx())
      })

      const result = await reserve('product_1', 'warehouse_1', 5, 'customer_1')

      expect(result).toBeNull()
      expect(mockReservationCreate).not.toHaveBeenCalled()
    })

    it('should allow only one concurrent reservation', async () => {
      let reserved = false

      mockTransaction.mockImplementation(async (callback: any) => {
        const tx = {
          ...createMockTx(),
          $queryRaw: vi.fn(() => {
            if (reserved) {
              return [
                stockFactory({
                  totalUnits: 1,
                  reservedUnits: 1,
                }),
              ]
            }
            reserved = true // Simulates row lock
            return [
              stockFactory({
                totalUnits: 1,
                reservedUnits: 0,
              }),
            ]
          }),
          reservation: {
            create: vi.fn(() => {
              reserved = true
              return reservationFactory()
            }),
          },
        }

        return callback(tx)
      })

      const [r1, r2] = await Promise.all([
        reserve('product_1', 'warehouse_1', 1, 'customer_1'),
        reserve('product_1', 'warehouse_1', 1, 'customer_2'),
      ])

      const success = [r1, r2].filter(Boolean).length
      const failure = [r1, r2].filter((r) => r === null).length

      expect(success).toBe(1)
      expect(failure).toBe(1)
    })
  })

  describe('confirmReservation()', () => {
    it('should confirm reservation', async () => {
      mockQueryRaw.mockResolvedValue([reservationFactory()])
      mockReservationUpdate.mockResolvedValue(
        reservationFactory({
          status: 'confirmed',
        })
      )

      mockTransaction.mockImplementation(async (callback: any) => {
        return callback(createMockTx())
      })

      const result = await ReservationService.confirmReservation('reservation_1')

      expect(result.status).toBe('confirmed')
    })

    it('should throw expired error', async () => {
      mockQueryRaw.mockResolvedValue([
        reservationFactory({
          expiresAt: new Date(Date.now() - 1000),
        }),
      ])

      mockTransaction.mockImplementation(async (callback: any) => {
        return callback(createMockTx())
      })

      await expect(
        ReservationService.confirmReservation('reservation_1')
      ).rejects.toThrow(ExpiredReservationError)
    })
  })

  describe('releaseReservation()', () => {
    it('should release reservation', async () => {
      mockQueryRaw.mockResolvedValue([reservationFactory()])
      mockStockUpdate.mockResolvedValue({})
      mockReservationUpdate.mockResolvedValue({})

      mockTransaction.mockImplementation(async (callback: any) => {
        return callback({
          ...createMockTx(),
          reservationItem: {
            findMany: vi.fn(() => [
              {
                productId: 'product_1',
                warehouseId: 'warehouse_1',
                quantity: 1,
              },
            ]),
          },
        })
      })

      const result = await ReservationService.releaseReservation('reservation_1')

      expect(result).toBe(true)
    })
  })
})
