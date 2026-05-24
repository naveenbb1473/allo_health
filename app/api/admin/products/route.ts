import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

const productCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  price: z.number().positive("Price must be positive"),
  imageUrl: z.string().optional().nullable(),
  initialStock: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const body: unknown = await request.json();
    const validation = productCreateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { name, description, price, imageUrl, initialStock } = validation.data;

    // Transactionally create the product and its associated stock records for all warehouses
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          name,
          description: description || null,
          price: new Prisma.Decimal(price),
          imageUrl: imageUrl || null,
        },
      });

      // Get all existing warehouses
      const warehouses = await tx.warehouse.findMany({ select: { id: true } });

      // Create stock row for each warehouse
      for (const wh of warehouses) {
        const qty = initialStock?.[wh.id] ?? 0;
        await tx.stock.create({
          data: {
            productId: p.id,
            warehouseId: wh.id,
            totalUnits: qty,
            reservedUnits: 0,
          },
        });
      }

      return p;
    });

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: Number(product.price),
        imageUrl: product.imageUrl,
      }
    }, { status: 201 });

  } catch (error: unknown) {
    console.error("[POST /api/admin/products] Server error", {
      requestId,
      error: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
      { error: "Internal server error", errorId: requestId },
      { status: 500 }
    );
  }
}
