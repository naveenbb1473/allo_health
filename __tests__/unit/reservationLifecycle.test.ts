import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReservationService } from '@/lib/services/reservationService'
import { ExpiryService } from '@/lib/services/expiryService'
import { 
  ValidationError, 
  NotFoundError, 
  ExpiredReservationError, 
  InvalidReservationStateError 
} from '@/lib/errors'
import { ReservationStatus } from '@prisma/client'

vi.mock('@prisma/client', async () => {
  const actual = await vi.importActual<typeof import('@prisma/client')>('@prisma/client')
  
  const mockTx = vi.fn()
  const mockUpdate = vi.fn()
  const mockFindMany = vi.fn()
  const mockStockUpdate = vi.fn()
  const mockReservationFindMany = vi.fn()

  return {
    ...actual,
    PrismaClient: vi.fn().mockImplementation(() => ({
      $transaction: mockTx,
      reservation: { 
        update: mockUpdate,
        findMany: mockReservationFindMany
      },
      reservationItem: { findMany: mockFindMany },
      stock: { update: mockStockUpdate }
    })),
    __mocks: { mockTx, mockUpdate, mockFindMany, mockStockUpdate, mockReservationFindMany }
  }
})

const { __mocks } = await import('@prisma/client') as any
const { mockTx, mockUpdate, mockFindMany, mockStockUpdate, mockReservationFindMany } = __mocks

describe('Reservation Lifecycle and Expiry Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('confirmReservation()', () => {
    it('successfully updates status to confirmed on valid parameters', async () => {
      const futureExpiry = new Date(Date.now() + 100000)
      
      mockTx.mockImplementation(async (callback: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{
            id: 'res_123',
            customerId: 'cust_abc',
            status: ReservationStatus.pending,
            expiresAt: futureExpiry,
            confirmedAt: null,
            releasedAt: null
          }]),
          reservation: {
            update: mockUpdate.mockResolvedValue({
              id: 'res_123',
              customerId: 'cust_abc',
              status: ReservationStatus.confirmed,
              expiresAt: futureExpiry,
              confirmedAt: new Date(),
              releasedAt: null,
              items: [{ productId: 'p_1', warehouseId: 'w_1', quantity: 2 }]
            })
          }
        }
        return callback(tx)
      })

      const result = await ReservationService.confirmReservation('res_123')
      expect(result.status).toBe(ReservationStatus.confirmed)
      expect(result.items).toHaveLength(1)
    })

    it('throws InvalidReservationStateError if the record is already verified', async () => {
      mockTx.mockImplementation(async (callback: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{
            id: 'res_123',
            status: ReservationStatus.confirmed,
            expiresAt: new Date(Date.now() + 100000)
          }])
        }
        return callback(tx)
      })

      await expect(
        ReservationService.confirmReservation('res_123')
      ).rejects.toThrow(InvalidReservationStateError)
    })

    it('throws ExpiredReservationError if the record window has lapsed', async () => {
      mockTx.mockImplementation(async (callback: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{
            id: 'res_123',
            status: ReservationStatus.pending,
            expiresAt: new Date(Date.now() - 50000)
          }])
        }
        return callback(tx)
      })

      await expect(
        ReservationService.confirmReservation('res_123')
      ).rejects.toThrow(ExpiredReservationError)
    })
  })

  describe('releaseReservation()', () => {
    it('returns true and safely rolls back stock units', async () => {
      mockTx.mockImplementation(async (callback: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'res_123', status: ReservationStatus.pending }]),
          reservationItem: {
            findMany: mockFindMany.mockResolvedValue([{ productId: 'p_1', warehouseId: 'w_1', quantity: 5 }])
          },
          stock: { update: mockStockUpdate },
          reservation: { update: mockUpdate }
        }
        return callback(tx)
      })

      const outcome = await ReservationService.releaseReservation('res_123')
      expect(outcome).toBe(true)
      expect(mockStockUpdate).toHaveBeenCalledOnce()
    })

    it('returns false immediately if the reservation status is already released', async () => {
      mockTx.mockImplementation(async (callback: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'res_123', status: ReservationStatus.released }])
        }
        return callback(tx)
      })

      const outcome = await ReservationService.releaseReservation('res_123')
      expect(outcome).toBe(false)
      expect(mockStockUpdate).not.toHaveBeenCalled()
    })
  })

  describe('ExpiryService - getReleaseExpired()', () => {
    it('processes sequential batch deletions and releases correctly', async () => {
      mockReservationFindMany.mockResolvedValue([{ id: 'expired_1' }, { id: 'expired_2' }])
      
      // Simulate sequential tx resolutions internally
      mockTx.mockImplementation(async (callback: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'expired_any', status: ReservationStatus.pending }]),
          reservationItem: { findMany: mockFindMany.mockResolvedValue([]) },
          stock: { update: mockStockUpdate },
          reservation: { update: mockUpdate }
        }
        return callback(tx)
      })

      const cleanedCount = await ExpiryService.getReleaseExpired()
      expect(cleanedCount).toBe(2)
    })
  })
})
