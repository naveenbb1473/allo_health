import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";

const warehouseCreateSchema = z.object({
  name: z.string().min(1, "Warehouse name is required"),
  location: z.string().min(1, "Location is required"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const body: unknown = await request.json();
    const validation = warehouseCreateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { name, location } = validation.data;

    // Transactionally create the warehouse and initialize Stock mappings for all existing products
    const warehouse = await prisma.$transaction(async (tx) => {
      const wh = await tx.warehouse.create({
        data: {
          name,
          location,
        },
      });

      // Get all existing products
      const products = await tx.product.findMany({ select: { id: true } });

      // Create stock rows with 0 units for each product in the new warehouse
      for (const p of products) {
        await tx.stock.create({
          data: {
            productId: p.id,
            warehouseId: wh.id,
            totalUnits: 0,
            reservedUnits: 0,
          },
        });
      }

      return wh;
    });

    return NextResponse.json({
      success: true,
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        location: warehouse.location,
      }
    }, { status: 201 });

  } catch (error: unknown) {
    console.error("[POST /api/admin/warehouses] Server error", {
      requestId,
      error: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
      { error: "Internal server error", errorId: requestId },
      { status: 500 }
    );
  }
}
