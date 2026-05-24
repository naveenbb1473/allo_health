import { ReservationStatus } from '@prisma/client'

export const productFactory = (overrides = {}) => ({
  id: 'product_1',
  name: 'Classic Cotton T-Shirt',
  description: 'Soft cotton shirt',
  price: 29.99,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const warehouseFactory = (overrides = {}) => ({
  id: 'warehouse_1',
  name: 'NYC Warehouse',
  location: 'New York, USA',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const stockFactory = (overrides = {}) => ({
  id: 'stock_1',
  productId: 'product_1',
  warehouseId: 'warehouse_1',
  totalUnits: 10,
  reservedUnits: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const reservationItemFactory = (overrides = {}) => ({
  id: 'item_1',
  reservationId: 'reservation_1',
  productId: 'product_1',
  warehouseId: 'warehouse_1',
  quantity: 1,
  product: productFactory(),
  warehouse: warehouseFactory(),
  ...overrides,
})

export const reservationFactory = (overrides = {}) => ({
  id: 'reservation_1',
  customerId: 'customer_1',
  status: ReservationStatus.pending,
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  confirmedAt: null,
  releasedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [reservationItemFactory()],
  ...overrides,
})
