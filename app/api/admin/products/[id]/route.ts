import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

const productUpdateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  price: z.number().positive("Price must be positive"),
  imageUrl: z.string().optional().nullable(),
  stockUpdates: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const { id: productId } = await params;

  try {
    const body: unknown = await request.json();
    const validation = productUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { name, description, price, imageUrl, stockUpdates } = validation.data;

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!existingProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Transactionally update the product and its associated stock records
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          name,
          description: description || null,
          price: new Prisma.Decimal(price),
          imageUrl: imageUrl || null,
        },
      });

      if (stockUpdates) {
        for (const [whId, qty] of Object.entries(stockUpdates)) {
          // Find stock record or create it
          await tx.stock.upsert({
            where: {
              productId_warehouseId: {
                productId,
                warehouseId: whId,
              },
            },
            update: {
              totalUnits: qty,
            },
            create: {
              productId,
              warehouseId: whId,
              totalUnits: qty,
              reservedUnits: 0,
            },
          });
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: "Product and stock levels updated successfully",
    }, { status: 200 });

  } catch (error: unknown) {
    console.error("[PATCH /api/admin/products/[id]] Server error", {
      requestId,
      productId,
      error: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
      { error: "Internal server error", errorId: requestId },
      { status: 500 }
    );
  }
}
