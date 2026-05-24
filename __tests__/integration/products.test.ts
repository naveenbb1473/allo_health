import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/products/route";

const VALID_WAREHOUSE_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

// ─── Mock @/lib/db (prisma singleton) ────────────────────────────────────────
const { mockWarehouseFindUnique, mockStockFindMany, mockProductFindMany } =
  vi.hoisted(() => ({
    mockWarehouseFindUnique: vi.fn(),
    mockStockFindMany: vi.fn(),
    mockProductFindMany: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  prisma: {
    warehouse: { findUnique: mockWarehouseFindUnique },
    stock: { findMany: mockStockFindMany },
    product: { findMany: mockProductFindMany },
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const stockRowFixture = {
  totalUnits: 100,
  reservedUnits: 30,
  product: {
    id: "prod-001",
    name: "Classic Cotton T-Shirt",
    description: "Soft everyday cotton tee",
    price: 19.99,
  },
};

const productFixture = {
  id: "prod-001",
  name: "Classic Cotton T-Shirt",
  description: "Soft everyday cotton tee",
  price: 19.99,
  stock: [
    { warehouseId: VALID_WAREHOUSE_ID, totalUnits: 100, reservedUnits: 30 },
    {
      warehouseId: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      totalUnits: 50,
      reservedUnits: 10,
    },
  ],
};

// ─── Helper ───────────────────────────────────────────────────────────────────
function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("GET /api/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── No warehouseId ──────────────────────────────────────────────────────────
  describe("without warehouseId (all warehouses)", () => {
    it("returns 200 with all products and their warehouse arrays", async () => {
      mockProductFindMany.mockResolvedValue([productFixture]);

      const res = await GET(makeRequest("http://localhost:3000/api/products"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toHaveLength(1);

      const product = body[0];
      expect(product.id).toBe("prod-001");
      expect(product.name).toBe("Classic Cotton T-Shirt");
      expect(typeof product.price).toBe("number");
      expect(product).toHaveProperty("warehouses");
      expect(product.warehouses).toHaveLength(2);
    });

    it("calculates available correctly for each warehouse", async () => {
      mockProductFindMany.mockResolvedValue([productFixture]);

      const res = await GET(makeRequest("http://localhost:3000/api/products"));
      const body = await res.json();

      const warehouses = body[0].warehouses;
      expect(warehouses[0].total).toBe(100);
      expect(warehouses[0].reserved).toBe(30);
      expect(warehouses[0].available).toBe(70); // 100 - 30
      expect(warehouses[1].available).toBe(40); // 50 - 10
    });

    it("returns empty array when no products exist", async () => {
      mockProductFindMany.mockResolvedValue([]);

      const res = await GET(makeRequest("http://localhost:3000/api/products"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual([]);
    });

    it("response has no stock field (only warehouses)", async () => {
      mockProductFindMany.mockResolvedValue([productFixture]);

      const res = await GET(makeRequest("http://localhost:3000/api/products"));
      const body = await res.json();

      expect(body[0]).not.toHaveProperty("stock");
    });
  });

  // ── With warehouseId ────────────────────────────────────────────────────────
  describe("with valid warehouseId", () => {
    it("returns 200 with products and flat stock object", async () => {
      mockWarehouseFindUnique.mockResolvedValue({ id: VALID_WAREHOUSE_ID });
      mockStockFindMany.mockResolvedValue([stockRowFixture]);

      const res = await GET(
        makeRequest(
          `http://localhost:3000/api/products?warehouseId=${VALID_WAREHOUSE_ID}`,
        ),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toHaveLength(1);

      const product = body[0];
      expect(product.id).toBe("prod-001");
      expect(product).toHaveProperty("stock");
      expect(product.stock.total).toBe(100);
      expect(product.stock.reserved).toBe(30);
      expect(product.stock.available).toBe(70);
    });

    it("response has no warehouses field (only stock)", async () => {
      mockWarehouseFindUnique.mockResolvedValue({ id: VALID_WAREHOUSE_ID });
      mockStockFindMany.mockResolvedValue([stockRowFixture]);

      const res = await GET(
        makeRequest(
          `http://localhost:3000/api/products?warehouseId=${VALID_WAREHOUSE_ID}`,
        ),
      );
      const body = await res.json();

      expect(body[0]).not.toHaveProperty("warehouses");
    });

    it("returns empty array when warehouse has no stock", async () => {
      mockWarehouseFindUnique.mockResolvedValue({ id: VALID_WAREHOUSE_ID });
      mockStockFindMany.mockResolvedValue([]);

      const res = await GET(
        makeRequest(
          `http://localhost:3000/api/products?warehouseId=${VALID_WAREHOUSE_ID}`,
        ),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual([]);
    });

    it("returns 404 when warehouse does not exist", async () => {
      mockWarehouseFindUnique.mockResolvedValue(null);

      const res = await GET(
        makeRequest(
          `http://localhost:3000/api/products?warehouseId=${VALID_WAREHOUSE_ID}`,
        ),
      );
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toBe("Warehouse not found");
    });
  });

  // ── Validation ──────────────────────────────────────────────────────────────
  describe("validation", () => {
    it("returns 400 on invalid warehouseId (not a UUID)", async () => {
      const res = await GET(
        makeRequest(
          "http://localhost:3000/api/products?warehouseId=not-a-uuid",
        ),
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("Invalid request");
      expect(body.details).toBeDefined();
    });

    it("returns 400 on warehouseId that is a plain string", async () => {
      const res = await GET(
        makeRequest("http://localhost:3000/api/products?warehouseId=abc123"),
      );

      expect(res.status).toBe(400);
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────────
  describe("error handling", () => {
    it("returns 500 on unexpected database error", async () => {
      mockProductFindMany.mockRejectedValue(new Error("Connection refused"));

      const res = await GET(makeRequest("http://localhost:3000/api/products"));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error).toBe("Internal server error");
      expect(body.errorId).toBeDefined();
    });

    it("returns 500 with errorId on warehouse lookup failure", async () => {
      mockWarehouseFindUnique.mockRejectedValue(new Error("DB timeout"));

      const res = await GET(
        makeRequest(
          `http://localhost:3000/api/products?warehouseId=${VALID_WAREHOUSE_ID}`,
        ),
      );
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.errorId).toBeDefined();
    });
  });

  // ── Response shape ──────────────────────────────────────────────────────────
  describe("response shape", () => {
    it("price is serialized as a number (not Decimal/string)", async () => {
      mockProductFindMany.mockResolvedValue([productFixture]);

      const res = await GET(makeRequest("http://localhost:3000/api/products"));
      const body = await res.json();

      expect(typeof body[0].price).toBe("number");
      expect(body[0].price).toBe(19.99);
    });

    it("description can be null", async () => {
      mockProductFindMany.mockResolvedValue([
        { ...productFixture, description: null, stock: [] },
      ]);

      const res = await GET(makeRequest("http://localhost:3000/api/products"));
      const body = await res.json();

      expect(body[0].description).toBeNull();
    });
  });
});
