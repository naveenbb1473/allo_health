import "dotenv/config";
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DIRECT_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const PRODUCT_IDS = Array.from({ length: 10 }).map((_, i) => 
  `11111111-1111-1111-1111-${String(i + 1).padStart(12, '0')}`
)
const WAREHOUSE_ID = '22222222-2222-2222-2222-222222222222'

async function setup() {
  console.log('Setting up database for load test with 10 products...')

  await prisma.warehouse.upsert({
    where: { id: WAREHOUSE_ID },
    update: {},
    create: {
      id: WAREHOUSE_ID,
      name: 'Load Test Warehouse',
      location: 'Internet',
    }
  })

  for (const productId of PRODUCT_IDS) {
    await prisma.product.upsert({
      where: { id: productId },
      update: {},
      create: {
        id: productId,
        name: `Load Test Product ${productId.slice(-2)}`,
        description: 'A load test unit',
        price: 99.99,
      }
    })

    await prisma.stock.upsert({
      where: {
        productId_warehouseId: {
          productId: productId,
          warehouseId: WAREHOUSE_ID,
        }
      },
      update: {
        totalUnits: 1,
        reservedUnits: 0,
      },
      create: {
        productId: productId,
        warehouseId: WAREHOUSE_ID,
        totalUnits: 1,
        reservedUnits: 0,
      }
    })

    await prisma.reservationItem.deleteMany({
      where: { productId: productId }
    })
  }

  console.log('Setup complete! Created 10 Target Products.')
}

setup().catch(console.error).finally(() => prisma.$disconnect())
