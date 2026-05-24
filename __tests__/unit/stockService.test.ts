import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { StockService } from '@/lib/services/stockService'

import {
  productFactory,
  stockFactory,
} from '../fixtures/sample-data'

const { mockFindMany, mockFindUnique, mockTransaction, mockStockUpdate, mockQueryRaw } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockTransaction: vi.fn(),
  mockStockUpdate: vi.fn(),
  mockQueryRaw: vi.fn(),
}))

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: vi.fn().mockImplementation(() => ({
      stock: {
        findMany: mockFindMany,
        findUnique: mockFindUnique,
        update: mockStockUpdate,
      },
      $transaction: mockTransaction,
    })),
    Prisma: {
      TransactionIsolationLevel: {
        Serializable: 'Serializable',
      },
    },
  }
})

vi.mock('@/lib/db', () => ({
  prisma: {
    stock: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      update: mockStockUpdate,
    },
    $transaction: mockTransaction,
  }
}))

describe('stockService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return stock level', async () => {
    mockFindUnique.mockResolvedValue(stockFactory())

    const result = await StockService.getStockLevel('product_1', 'warehouse_1')

    expect(result?.available).toBe(8)
  })

  it('should return products with stock', async () => {
    mockFindMany.mockResolvedValue([
      {
        totalUnits: 10,
        reservedUnits: 2,
        product: productFactory(),
      },
    ])

    const result = await StockService.getProductsWithStock('warehouse_1')

    expect(result.length).toBe(1)
    expect(result[0].available).toBe(8)
  })

  it('should release stock successfully', async () => {
    mockTransaction.mockImplementation(async (callback: any) => {
      return callback({
        $queryRaw: mockQueryRaw,
        stock: {
          update: mockStockUpdate,
        },
      })
    })

    mockQueryRaw.mockResolvedValue([
      stockFactory({
        reservedUnits: 5,
      }),
    ])

    mockStockUpdate.mockResolvedValue({})

    const result = await StockService.releaseStock('product_1', 'warehouse_1', 2)

    expect(result).toBe(true)
  })
})
