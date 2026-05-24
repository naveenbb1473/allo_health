import { describe, expect, it } from 'vitest'
import { validateReserveRequest, validateConfirmRequest } from '@/lib/schemas/validation'
import { ValidationError } from '@/lib/errors'

describe('Validation Layer Tests', () => {
  describe('validateReserveRequest()', () => {
    it('successfully passes valid payload parameters', () => {
      const validPayload = {
        productId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        warehouseId: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
        quantity: 5,
        customerId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      }
      
      const parsed = validateReserveRequest(validPayload)
      expect(parsed).toEqual(validPayload)
    })

    it('throws ValidationError for non-UUID strings', () => {
      const invalidPayload = {
        productId: 'bad-product-id',
        warehouseId: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
        quantity: 5,
        customerId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      }

      expect(() => validateReserveRequest(invalidPayload)).toThrow(ValidationError)
    })

    it('throws ValidationError when ordering quantities over 1000 items', () => {
      const invalidPayload = {
        productId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        warehouseId: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
        quantity: 9999,
        customerId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      }

      expect(() => validateReserveRequest(invalidPayload)).toThrow(ValidationError)
    })
  })

  describe('validateConfirmRequest()', () => {
    it('throws ValidationError for malformed inputs', () => {
      expect(() => validateConfirmRequest({ reservationId: 'short-id' })).toThrow(ValidationError)
    })
  })
})
