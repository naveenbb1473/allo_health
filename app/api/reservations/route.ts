import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { reserve } from '@/lib/services/reservationService'
import { ValidationError, OutOfStockError, DatabaseError } from '@/lib/errors'
import { getCachedIdempotentResponse, cacheIdempotentResponse } from '@/lib/middleware/idempotency'
import { logger } from '@/lib/logger'

/**
 * Request validation schema.
 */
const reservationSchema = z.object({
  productId: z.string().uuid('productId must be a valid UUID'),
  warehouseId: z.string().uuid('warehouseId must be a valid UUID'),
  quantity: z
    .number({ invalid_type_error: 'quantity must be a number' })
    .int('quantity must be an integer')
    .min(1, 'quantity must be positive')
    .max(1000, 'quantity cannot exceed 1000'),
  customerId: z.string().uuid('customerId must be a valid UUID'),
})

/**
 * POST /api/reservations
 *
 * Creates a pending inventory reservation.
 *
 * Concurrency guarantees:
 * - Atomic PostgreSQL transaction with row-level locking
 * - Prevents overselling under concurrent load
 *
 * Idempotency:
 * - Pass `Idempotency-Key: <uuid>` header to deduplicate retries
 * - Same key returns the same response for 1 hour
 *
 * Example:
 * curl -X POST http://localhost:3000/api/reservations \
 *   -H 'Content-Type: application/json' \
 *   -H 'Idempotency-Key: <uuid>' \
 *   -d '{ "productId":"uuid", "warehouseId":"uuid", "quantity":1, "customerId":"uuid" }'
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = `req_${crypto.randomUUID()}`

  try {
    // ── Parse & validate body ──────────────────────────────────────────────
    const body: unknown = await request.json()
    const validation = reservationSchema.safeParse(body)

    if (!validation.success) {
      const issue = validation.error.errors[0]

      logger.warn('[POST /api/reservations] Validation failed', {
        requestId,
        errors: validation.error.flatten(),
      })

      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: issue?.message ?? 'Invalid request payload',
        },
        { status: 400 },
      )
    }

    const { productId, warehouseId, quantity, customerId } = validation.data

    // ── Idempotency check ──────────────────────────────────────────────────
    const idempotencyKey = request.headers.get('Idempotency-Key')

    if (idempotencyKey) {
      const cached = await getCachedIdempotentResponse(idempotencyKey)
      if (cached) {
        logger.info('[POST /api/reservations] Idempotent cache hit', {
          requestId,
          idempotencyKey,
        })
        return NextResponse.json(cached.body, { status: cached.status })
      }
    }

    logger.info('[POST /api/reservations] Reservation attempt', {
      requestId,
      productId,
      warehouseId,
      quantity,
      customerId,
    })

    // ── Atomic reservation ─────────────────────────────────────────────────
    const reservation = await reserve(productId, warehouseId, quantity, customerId)

    // ── Stock unavailable ──────────────────────────────────────────────────
    if (!reservation) {
      logger.warn('[POST /api/reservations] Insufficient stock', {
        requestId,
        productId,
        warehouseId,
        quantity,
      })

      const responseBody = {
        error: 'INSUFFICIENT_STOCK',
        message: 'Insufficient inventory available',
        available: 0,
        requested: quantity,
      }

      if (idempotencyKey) {
        await cacheIdempotentResponse(idempotencyKey, responseBody, 409)
      }

      return NextResponse.json(responseBody, { status: 409 })
    }

    // ── Success ────────────────────────────────────────────────────────────
    logger.info('[POST /api/reservations] Reservation created', {
      requestId,
      reservationId: reservation.id,
      productId,
      warehouseId,
      quantity,
      customerId,
      expiresAt: reservation.expiresAt,
      timestamp: new Date()
    })

    const responseBody = {
      id: reservation.id,
      customerId: reservation.customerId,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
      items: reservation.items,
    }

    if (idempotencyKey) {
      await cacheIdempotentResponse(idempotencyKey, responseBody, 201)
    }

    return NextResponse.json(responseBody, { status: 201 })
  } catch (error: unknown) {
    // ── ValidationError ────────────────────────────────────────────────────
    if (error instanceof ValidationError) {
      logger.warn('[POST /api/reservations] ValidationError', {
        requestId,
        message: error.message,
      })

      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: error.message },
        { status: 400 },
      )
    }

    // ── OutOfStockError ────────────────────────────────────────────────────
    if (error instanceof OutOfStockError) {
      logger.warn('[POST /api/reservations] OutOfStockError', {
        requestId,
        message: error.message,
      })

      return NextResponse.json(
        { error: 'INSUFFICIENT_STOCK', message: error.message },
        { status: 409 },
      )
    }

    // ── DatabaseError ──────────────────────────────────────────────────────
    if (error instanceof DatabaseError) {
      logger.error('[POST /api/reservations] DatabaseError', {
        requestId,
        message: error.message,
      })

      return NextResponse.json(
        {
          error: 'INTERNAL_SERVER_ERROR',
          errorId: requestId,
          message: 'Database error - contact support with error ID',
        },
        { status: 500 },
      )
    }

    // ── Unknown failure ────────────────────────────────────────────────────
    logger.error('[POST /api/reservations] Unknown error', {
      requestId,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
    })

    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        errorId: requestId,
        message: 'Database error - contact support with error ID',
      },
      { status: 500 },
    )
  }
}
