import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";

/**
 * Query validation schema.
 */
const querySchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouseId UUID").optional(),
});

/**
 * Product response with single warehouse stock.
 */
interface ProductWithWarehouseStock {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stock: {
    total: number;
    reserved: number;
    available: number;
  };
}

/**
 * Product response with all warehouse stock.
 */
interface ProductWithAllWarehouses {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  warehouses: Array<{
    warehouseId: string;
    total: number;
    reserved: number;
    available: number;
  }>;
}

/**
 * GET /api/products
 *
 * Returns inventory-aware product listings.
 *
 * Query params:
 * - warehouseId?: UUID
 *
 * Response (warehouse filter):
 * [{ id, name, price, description, stock: { total, reserved, available } }]
 *
 * Response (all warehouses):
 * [{ id, name, price, description, warehouses: [...] }]
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const searchParams = request.nextUrl.searchParams;
    const rawWarehouseId = searchParams.get("warehouseId") ?? undefined;

    const validation = querySchema.safeParse({ warehouseId: rawWarehouseId });

    if (!validation.success) {
      console.error("[GET /api/products] Validation error", {
        requestId,
        errors: validation.error.flatten(),
        warehouseId: rawWarehouseId,
      });

      return NextResponse.json(
        { error: "Invalid request", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { warehouseId } = validation.data;

    // ----------------------------------------------------------------
    // Warehouse-specific inventory
    // ----------------------------------------------------------------
    if (warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { id: true },
      });

      if (!warehouse) {
        console.error("[GET /api/products] Warehouse not found", {
          requestId,
          warehouseId,
        });

        return NextResponse.json(
          { error: "Warehouse not found" },
          { status: 404 },
        );
      }

      // Single query with joins — avoids N+1
      const stockRows = await prisma.stock.findMany({
        where: { warehouseId },
        select: {
          totalUnits: true,
          reservedUnits: true,
          product: {
            select: { id: true, name: true, description: true, price: true, imageUrl: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const response: ProductWithWarehouseStock[] = stockRows.map(
        (row: {
          totalUnits: number;
          reservedUnits: number;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          product: {
            id: string;
            name: string;
            description: string | null;
            price: any;
            imageUrl: string | null;
          };
        }) => ({
          id: row.product.id,
          name: row.product.name,
          description: row.product.description,
          price: Number(row.product.price),
          imageUrl: row.product.imageUrl,
          stock: {
            total: row.totalUnits,
            reserved: row.reservedUnits,
            available: row.totalUnits - row.reservedUnits,
          },
        }),
      );

      return NextResponse.json(response, { status: 200 });
    }

    // ----------------------------------------------------------------
    // All products across all warehouses
    // ----------------------------------------------------------------
    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        imageUrl: true,
        stock: {
          select: {
            warehouseId: true,
            totalUnits: true,
            reservedUnits: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const response: ProductWithAllWarehouses[] = products.map(
      (product: {
        id: string;
        name: string;
        description: string | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        price: any;
        imageUrl: string | null;
        stock: Array<{
          warehouseId: string;
          totalUnits: number;
          reservedUnits: number;
        }>;
      }) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: Number(product.price),
        imageUrl: product.imageUrl,
        warehouses: product.stock.map((stock) => ({
          warehouseId: stock.warehouseId,
          total: stock.totalUnits,
          reserved: stock.reservedUnits,
          available: stock.totalUnits - stock.reservedUnits,
        })),
      }),
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error: unknown) {
    console.error("[GET /api/products] Database error", {
      requestId,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });

    return NextResponse.json(
      { 
        error: "Internal server error", 
        errorId: requestId,
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 },
    );
  }
}
