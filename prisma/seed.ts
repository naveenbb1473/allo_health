import "dotenv/config";
import { PrismaClient, ReservationStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL,
  ssl: true,
});
const prisma = new PrismaClient({ adapter });


type SeedProduct = {
  name: string
  description: string
  price: number
}

type SeedWarehouse = {
  name: string
  location: string
}

const products: SeedProduct[] = [
  {
    name: 'Classic Cotton T-Shirt',
    description: 'Soft everyday cotton tee with a regular fit and breathable fabric.',
    price: 19.99,
  },
  {
    name: 'Slim Fit Denim Jeans',
    description: 'Mid-rise slim fit jeans with stretch denim for all-day comfort.',
    price: 59.99,
  },
  {
    name: 'Lightweight Hoodie',
    description: 'Brushed fleece hoodie with a relaxed fit and front kangaroo pocket.',
    price: 44.5,
  },
  {
    name: 'Oxford Button-Down Shirt',
    description: 'Crisp long-sleeve Oxford shirt suitable for smart-casual wear.',
    price: 69.0,
  },
  {
    name: 'Athletic Joggers',
    description: 'Tapered joggers made for training, travel, and everyday wear.',
    price: 49.99,
  },
  {
    name: 'Wool Blend Overcoat',
    description: 'Tailored overcoat with a warm wool blend for colder seasons.',
    price: 179.0,
  },
  {
    name: 'Puffer Jacket',
    description: 'Insulated lightweight puffer jacket with water-resistant shell.',
    price: 129.99,
  },
  {
    name: 'Casual Chino Shorts',
    description: 'Versatile chino shorts with a clean finish and comfortable fit.',
    price: 34.0,
  },
  {
    name: 'Merino Crewneck Sweater',
    description: 'Fine-knit merino sweater that layers easily and feels premium.',
    price: 89.5,
  },
  {
    name: 'Leather Sneakers',
    description: 'Minimal leather sneakers with cushioned insoles for daily use.',
    price: 119.99,
  },
]

const warehouses: SeedWarehouse[] = [
  {
    name: 'New York Fulfillment Center',
    location: 'Brooklyn, New York, NY, USA',
  },
  {
    name: 'Los Angeles Distribution Hub',
    location: 'Commerce, Los Angeles, CA, USA',
  },
  {
    name: 'Chicago Central Warehouse',
    location: 'Joliet, Chicago, IL, USA',
  },
]

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomStockLevel(): number {
  const roll = Math.random()
  if (roll < 0.15) return 5
  if (roll < 0.35) return randomInt(50, 90)
  if (roll < 0.7) return randomInt(120, 260)
  return 500
}

async function seedProducts() {
  const created = [] as Awaited<ReturnType<typeof prisma.product.create>>[]

  for (const product of products) {
    const row = await prisma.product.create({
      data: product,
    })
    created.push(row)
    console.log(`Created product: ${row.name}`)
  }

  return created
}

async function seedWarehouses() {
  const created = [] as Awaited<ReturnType<typeof prisma.warehouse.create>>[]

  for (const warehouse of warehouses) {
    const row = await prisma.warehouse.create({
      data: warehouse,
    })
    created.push(row)
    console.log(`Created warehouse: ${row.name}`)
  }

  return created
}

async function seedStock(
  productRows: Awaited<ReturnType<typeof prisma.product.create>>[],
  warehouseRows: Awaited<ReturnType<typeof prisma.warehouse.create>>[],
) {
  let count = 0

  for (const product of productRows) {
    for (const warehouse of warehouseRows) {
      const totalUnits = randomStockLevel()
      const reservedUnits = totalUnits === 5 ? 0 : randomInt(0, Math.max(0, Math.min(10, totalUnits - 1)))

      await prisma.stock.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          totalUnits,
          reservedUnits,
        },
      })

      count += 1
      console.log(
        `Created stock: product=${product.name}, warehouse=${warehouse.name}, total=${totalUnits}, reserved=${reservedUnits}`,
      )
    }
  }

  console.log(`Seeded ${count} stock rows`)
}

async function seedReservations(
  productRows: Awaited<ReturnType<typeof prisma.product.create>>[],
  warehouseRows: Awaited<ReturnType<typeof prisma.warehouse.create>>[],
) {
  const now = new Date()

  const reservationSpecs = [
    {
      customerId: 'cust_1001',
      status: ReservationStatus.pending,
      expiresAt: new Date(now.getTime() + 8 * 60 * 1000),
      confirmedAt: null,
      releasedAt: null,
      items: [
        { productIndex: 0, warehouseIndex: 0, quantity: 1 },
        { productIndex: 1, warehouseIndex: 0, quantity: 2 },
      ],
    },
    {
      customerId: 'cust_1002',
      status: ReservationStatus.confirmed,
      expiresAt: new Date(now.getTime() - 20 * 60 * 1000),
      confirmedAt: new Date(now.getTime() - 25 * 60 * 1000),
      releasedAt: null,
      items: [{ productIndex: 2, warehouseIndex: 1, quantity: 1 }],
    },
    {
      customerId: 'cust_1003',
      status: ReservationStatus.released,
      expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      confirmedAt: null,
      releasedAt: new Date(now.getTime() - 55 * 60 * 1000),
      items: [
        { productIndex: 3, warehouseIndex: 2, quantity: 1 },
        { productIndex: 4, warehouseIndex: 2, quantity: 1 },
      ],
    },
    {
      customerId: 'cust_1004',
      status: ReservationStatus.pending,
      expiresAt: new Date(now.getTime() + 3 * 60 * 1000),
      confirmedAt: null,
      releasedAt: null,
      items: [{ productIndex: 5, warehouseIndex: 1, quantity: 1 }],
    },
    {
      customerId: 'cust_1005',
      status: ReservationStatus.confirmed,
      expiresAt: new Date(now.getTime() + 12 * 60 * 1000),
      confirmedAt: new Date(now.getTime() - 2 * 60 * 1000),
      releasedAt: null,
      items: [
        { productIndex: 6, warehouseIndex: 0, quantity: 2 },
        { productIndex: 9, warehouseIndex: 0, quantity: 1 },
      ],
    },
  ]

  for (const spec of reservationSpecs) {
    const reservation = await prisma.reservation.create({
      data: {
        customerId: spec.customerId,
        status: spec.status,
        expiresAt: spec.expiresAt,
        confirmedAt: spec.confirmedAt,
        releasedAt: spec.releasedAt,
        items: {
          create: spec.items.map((item) => ({
            productId: productRows[item.productIndex].id,
            warehouseId: warehouseRows[item.warehouseIndex].id,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: true,
      },
    })

    console.log(
      `Created reservation: ${reservation.id} | customer=${reservation.customerId} | status=${reservation.status} | items=${reservation.items.length}`,
    )
  }
}

async function seedDb(): Promise<void> {
  try {
    console.log('Seeding database...')

    await prisma.reservationItem.deleteMany()
    await prisma.reservation.deleteMany()
    await prisma.stock.deleteMany()
    await prisma.warehouse.deleteMany()
    await prisma.product.deleteMany()

    console.log('Cleared existing data')

    const createdProducts = await seedProducts()
    const createdWarehouses = await seedWarehouses()

    await seedStock(createdProducts, createdWarehouses)
    await seedReservations(createdProducts, createdWarehouses)

    console.log('Seed completed successfully')
  } catch (error) {
    console.error('Seed failed')
    console.error(error)
    throw error
  }
}

seedDb()
  .catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
