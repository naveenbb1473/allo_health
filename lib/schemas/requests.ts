import { z } from 'zod'

export const ReserveRequest = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.number().int().positive(),
  customerId: z.string().uuid(),
})
