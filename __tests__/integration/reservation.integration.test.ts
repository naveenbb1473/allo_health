import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { Prisma, Product, Warehouse } from "@prisma/client";
import { ExpiryService } from "@/services/expiry.service";

describe.skip("reservation integration", () => {
  let product: Product;
  let warehouse: Warehouse;

  beforeAll(async () => {
    // Ensure we have a clean test product and warehouse
    product = await prisma.product.create({
      data: {
        name: `Integration Test Product ${crypto.randomUUID()}`,
        price: new Prisma.Decimal(9.99),
        description: "Test product for integration",
      },
    });

    warehouse = await prisma.warehouse.create({
      data: {
        name: `Integration Test Warehouse ${crypto.randomUUID()}`,
        location: "Test Location",
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    if (product?.id) {
      await prisma.stock.deleteMany({
        where: { productId: product.id },
      });
      await prisma.reservationItem.deleteMany({
        where: { productId: product.id },
      });
      await prisma.product.deleteMany({
        where: { id: product.id },
      });
    }
    if (warehouse?.id) {
      await prisma.warehouse.deleteMany({
        where: { id: warehouse.id },
      });
    }
  });

  test("POST /api/reservations prevents double-booking", async () => {
    const stock = await prisma.stock.create({
      data: {
        productId: product.id,
        warehouseId: warehouse.id,
        totalUnits: 1,
        reservedUnits: 0,
      },
    });

    const customer1 = crypto.randomUUID();
    const customer2 = crypto.randomUUID();

    // 2. Send 2 concurrent requests
    const promises = [
      fetch("http://localhost:3000/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: 1,
          customerId: customer1,
        }),
      }),
      fetch("http://localhost:3000/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: 1,
          customerId: customer2,
        }),
      }),
    ];

    const results = await Promise.all(promises);

    // 3. Verify exactly 1 succeeds (201)
    const successes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);

    // 4. Verify stock only decremented once
    const updatedStock = await prisma.stock.findUnique({
      where: { id: stock.id },
    });
    expect(updatedStock?.reservedUnits).toBe(1);
  });

  test("Expired reservations return to inventory", async () => {
    const customerId = crypto.randomUUID();

    // Create stock first
    await prisma.stock.upsert({
      where: {
        productId_warehouseId: {
          productId: product.id,
          warehouseId: warehouse.id,
        },
      },
      update: {
        totalUnits: 5,
        reservedUnits: 1,
      },
      create: {
        productId: product.id,
        warehouseId: warehouse.id,
        totalUnits: 5,
        reservedUnits: 1,
      },
    });

    // Create reservation that expires in past
    const reservation = await prisma.reservation.create({
      data: {
        customerId,
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
        status: "pending",
        items: {
          create: {
            productId: product.id,
            warehouseId: warehouse.id,
            quantity: 1,
          },
        },
      },
    });

    // Run expiry cleanup directly via service
    await ExpiryService.releaseExpiredReservations();

    // Verify released
    const updated = await prisma.reservation.findUnique({
      where: { id: reservation.id },
    });

    expect(updated?.status).toBe("released");
    expect(updated?.releasedAt).toBeDefined();

    // Verify stock is decremented
    const stock = await prisma.stock.findUnique({
      where: {
        productId_warehouseId: {
          productId: product.id,
          warehouseId: warehouse.id,
        },
      },
    });
    expect(stock?.reservedUnits).toBe(0);
  });
});
