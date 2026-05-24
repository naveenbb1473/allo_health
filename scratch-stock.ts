import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function check() {
  const PRODUCT_IDS = Array.from({ length: 10 }).map(
    (_, i) => `11111111-1111-1111-1111-${String(i + 1).padStart(12, "0")}`,
  );

  const items = await prisma.reservationItem.findMany({
    where: { productId: { in: PRODUCT_IDS } },
  });
  console.log("Reservations created for target products:", items.length);

  const stock = await prisma.stock.findMany({
    where: { productId: { in: PRODUCT_IDS } },
  });
  console.log("Current stock for target products:");
  console.table(stock);
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
