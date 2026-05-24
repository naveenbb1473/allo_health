import { z } from 'zod'
import { ValidationError } from '@/lib/errors'

export const UUIDSchema = z.string().uuid()
export const PositiveInteger = z.number().int().positive()

export const ReserveRequestSchema = z.object({
  productId: UUIDSchema,
  warehouseId: UUIDSchema,
  quantity: PositiveInteger.max(1000),
  customerId: UUIDSchema,
})

export const ConfirmRequestSchema = z.object({
  reservationId: UUIDSchema,
})

/**
 * Validates and parses a reservation request.
 * Throws a domain ValidationError if formatting is incorrect.
 */
export const validateReserveRequest = (data: unknown) => {
  const result = ReserveRequestSchema.safeParse(data)
  if (!result.success) {
    throw new ValidationError(
      `Invalid reserve request: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`
    )
  }
  return result.data
}

/**
 * Validates and parses a confirmation request.
 * Throws a domain ValidationError if formatting is incorrect.
 */
export const validateConfirmRequest = (data: unknown) => {
  const result = ConfirmRequestSchema.safeParse(data)
  if (!result.success) {
    throw new ValidationError(
      `Invalid confirm request: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`
    )
  }
  return result.data
}
