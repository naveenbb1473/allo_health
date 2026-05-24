import {
  Prisma,
  PrismaClient,
} from '@prisma/client'
import { ValidationError } from '@/lib/errors'

const prisma = new PrismaClient()

export interface ProductStockResponse {
  product: {
    id: string
    name: string
    description: string | null
    price: Prisma.Decimal
  }
  available: number
  reserved: number
  total: number
}

export interface StockLevelResponse {
  available: number
  reserved: number
  total: number
}

export class StockServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StockServiceError'
  }
}

export class StockService {
  static async getProductsWithStock(
    warehouseId: string,
  ): Promise<ProductStockResponse[]> {
    if (!warehouseId) {
      throw new ValidationError('warehouseId is required')
    }

    try {
      const stockRows = await prisma.stock.findMany({
        where: { warehouseId },
        select: {
          totalUnits: true,
          reservedUnits: true,
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              price: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      return stockRows.map((row) => ({
        product: row.product,
        available: row.totalUnits - row.reservedUnits,
        reserved: row.reservedUnits,
        total: row.totalUnits,
      }))
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new StockServiceError(`Failed to fetch warehouse stock: ${error.message}`)
      }
      throw new StockServiceError('Unknown stock retrieval error')
    }
  }

  static async getStockLevel(
    productId: string,
    warehouseId: string,
  ): Promise<StockLevelResponse | null> {
    if (!productId) throw new ValidationError('productId is required')
    if (!warehouseId) throw new ValidationError('warehouseId is required')

    try {
      const stock = await prisma.stock.findUnique({
        where: {
          productId_warehouseId: { productId, warehouseId },
        },
        select: {
          totalUnits: true,
          reservedUnits: true,
        },
      })

      if (!stock) return null

      return {
        available: stock.totalUnits - stock.reservedUnits,
        reserved: stock.reservedUnits,
        total: stock.totalUnits,
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new StockServiceError(`Failed to fetch stock level: ${error.message}`)
      }
      throw new StockServiceError('Unknown stock level error')
    }
  }

  static async releaseStock(
    productId: string,
    warehouseId: string,
    quantity: number,
  ): Promise<boolean> {
    if (!productId) throw new ValidationError('productId is required')
    if (!warehouseId) throw new ValidationError('warehouseId is required')
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError('quantity must be a positive integer')
    }

    try {
      const success = await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{ id: string; totalUnits: number; reservedUnits: number }>
          >`
            SELECT *
            FROM "Stock"
            WHERE "productId" = ${productId}
              AND "warehouseId" = ${warehouseId}
            FOR UPDATE
          `

          if (rows.length === 0) return false

          const stock = rows[0]
          if (stock.reservedUnits < quantity) return false

          await tx.stock.update({
            where: {
              productId_warehouseId: { productId, warehouseId },
            },
            data: {
              reservedUnits: { decrement: quantity },
            },
          })

          return true
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      )

      return success
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new StockServiceError(`Failed to release stock: ${error.message}`)
      }
      throw new StockServiceError('Unknown stock release error')
    }
  }
}
