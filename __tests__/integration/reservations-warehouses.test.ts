import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getReservation } from "@/app/api/reservations/[id]/route";
import { GET as getWarehouses } from "@/app/api/warehouses/route";
import { ReservationStatus } from "@prisma/client";

// ─── Mock @/lib/db ────────────────────────────────────────────────────────────
const { mockReservationFindUnique, mockWarehouseFindMany } = vi.hoisted(() => ({
  mockReservationFindUnique: vi.fn(),
  mockWarehouseFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    reservation: { findUnique: mockReservationFindUnique },
    warehouse: { findMany: mockWarehouseFindMany },
  },
}));

// ─── Constants ────────────────────────────────────────────────────────────────
const RESERVATION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const CUSTOMER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const PRODUCT_ID = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";
const WAREHOUSE_ID = "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44";
const FUTURE_EXPIRY = new Date(Date.now() + 10 * 60 * 1000);
const PAST_EXPIRY = new Date(Date.now() - 60 * 1000);

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const itemFixture = {
  id: "item-uuid-001",
  productId: PRODUCT_ID,
  warehouseId: WAREHOUSE_ID,
  quantity: 3,
  product: {
    id: PRODUCT_ID,
    name: "Blue Widget",
    description: "A sturdy widget",
    price: 9.99,
  },
  warehouse: { id: WAREHOUSE_ID, name: "East Hub", location: "Brooklyn, NY" },
};

const reservationFixture = {
  id: RESERVATION_ID,
  customerId: CUSTOMER_ID,
  status: ReservationStatus.pending,
  expiresAt: FUTURE_EXPIRY,
  createdAt: new Date("2026-05-24T07:00:00.000Z"),
  updatedAt: new Date("2026-05-24T07:00:00.000Z"),
  confirmedAt: null,
  releasedAt: null,
  items: [itemFixture],
};

const warehouseFixtures = [
  {
    id: WAREHOUSE_ID,
    name: "East Hub",
    location: "Brooklyn, NY",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55",
    name: "West Hub",
    location: "Los Angeles, CA",
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeGetReservationRequest(id: string) {
  return {
    req: new NextRequest(`http://localhost:3000/api/reservations/${id}`),
    ctx: { params: Promise.resolve({ id }) },
  };
}

// ─── GET /api/reservations/[id] ───────────────────────────────────────────────
describe("GET /api/reservations/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("found — pending, not expired", () => {
    it("returns 200 with full reservation shape", async () => {
      mockReservationFindUnique.mockResolvedValue(reservationFixture);

      const { req, ctx } = makeGetReservationRequest(RESERVATION_ID);
      const res = await getReservation(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.id).toBe(RESERVATION_ID);
      expect(body.customerId).toBe(CUSTOMER_ID);
      expect(body.status).toBe("pending");
    });

    it("includes expiry countdown fields", async () => {
      mockReservationFindUnique.mockResolvedValue(reservationFixture);

      const { req, ctx } = makeGetReservationRequest(RESERVATION_ID);
      const res = await getReservation(req, ctx);
      const body = await res.json();

      expect(body.isExpired).toBe(false);
      expect(typeof body.expiresInSeconds).toBe("number");
      expect(body.expiresInSeconds).toBeGreaterThan(0);
    });

    it("serializes all dates as ISO strings", async () => {
      mockReservationFindUnique.mockResolvedValue(reservationFixture);

      const { req, ctx } = makeGetReservationRequest(RESERVATION_ID);
      const res = await getReservation(req, ctx);
      const body = await res.json();

      expect(body.createdAt).toBe("2026-05-24T07:00:00.000Z");
      expect(body.confirmedAt).toBeNull();
      expect(body.releasedAt).toBeNull();
    });

    it("includes items with nested product and warehouse", async () => {
      mockReservationFindUnique.mockResolvedValue(reservationFixture);

      const { req, ctx } = makeGetReservationRequest(RESERVATION_ID);
      const res = await getReservation(req, ctx);
      const body = await res.json();

      expect(body.items).toHaveLength(1);
      const item = body.items[0];
      expect(item.id).toBe("item-uuid-001");
      expect(item.quantity).toBe(3);
      expect(item.product.name).toBe("Blue Widget");
      expect(item.product.price).toBe(9.99);
      expect(item.warehouse.name).toBe("East Hub");
      expect(item.warehouse.location).toBe("Brooklyn, NY");
    });

    it("sets private cache-control header", async () => {
      mockReservationFindUnique.mockResolvedValue(reservationFixture);

      const { req, ctx } = makeGetReservationRequest(RESERVATION_ID);
      const res = await getReservation(req, ctx);

      expect(res.headers.get("Cache-Control")).toContain("private");
      expect(res.headers.get("Cache-Control")).toContain(
        "stale-while-revalidate",
      );
    });
  });

  describe("expired reservation", () => {
    it("returns isExpired=true and expiresInSeconds=0 for expired reservation", async () => {
      mockReservationFindUnique.mockResolvedValue({
        ...reservationFixture,
        expiresAt: PAST_EXPIRY,
      });

      const { req, ctx } = makeGetReservationRequest(RESERVATION_ID);
      const res = await getReservation(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.isExpired).toBe(true);
      expect(body.expiresInSeconds).toBe(0);
    });
  });

  describe("confirmed reservation", () => {
    it("includes confirmedAt as ISO string", async () => {
      const confirmedAt = new Date("2026-05-24T07:30:00.000Z");
      mockReservationFindUnique.mockResolvedValue({
        ...reservationFixture,
        status: ReservationStatus.confirmed,
        confirmedAt,
      });

      const { req, ctx } = makeGetReservationRequest(RESERVATION_ID);
      const res = await getReservation(req, ctx);
      const body = await res.json();

      expect(body.status).toBe("confirmed");
      expect(body.confirmedAt).toBe("2026-05-24T07:30:00.000Z");
    });
  });

  describe("not found", () => {
    it("returns 404 when reservation does not exist", async () => {
      mockReservationFindUnique.mockResolvedValue(null);

      const { req, ctx } = makeGetReservationRequest("non-existent");
      const res = await getReservation(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toBe("RESERVATION_NOT_FOUND");
    });
  });

  describe("server error", () => {
    it("returns 500 with errorId on database failure", async () => {
      mockReservationFindUnique.mockRejectedValue(new Error("DB crash"));

      const { req, ctx } = makeGetReservationRequest(RESERVATION_ID);
      const res = await getReservation(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.errorId).toBeDefined();
    });
  });
});

// ─── GET /api/warehouses ──────────────────────────────────────────────────────
describe("GET /api/warehouses", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("successful fetch", () => {
    it("returns 200 with all warehouses", async () => {
      mockWarehouseFindMany.mockResolvedValue(warehouseFixtures);

      const res = await getWarehouses();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe("East Hub");
      expect(body[1].name).toBe("West Hub");
    });

    it("serializes dates as ISO strings", async () => {
      mockWarehouseFindMany.mockResolvedValue(warehouseFixtures);

      const res = await getWarehouses();
      const body = await res.json();

      expect(body[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
      expect(typeof body[0].updatedAt).toBe("string");
    });

    it("response includes id, name, location, createdAt, updatedAt", async () => {
      mockWarehouseFindMany.mockResolvedValue(warehouseFixtures);

      const res = await getWarehouses();
      const body = await res.json();
      const w = body[0];

      expect(w).toHaveProperty("id");
      expect(w).toHaveProperty("name");
      expect(w).toHaveProperty("location");
      expect(w).toHaveProperty("createdAt");
      expect(w).toHaveProperty("updatedAt");
    });

    it("returns empty array when no warehouses exist", async () => {
      mockWarehouseFindMany.mockResolvedValue([]);

      const res = await getWarehouses();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual([]);
    });

    it("sets public cache-control header", async () => {
      mockWarehouseFindMany.mockResolvedValue(warehouseFixtures);

      const res = await getWarehouses();

      expect(res.headers.get("Cache-Control")).toContain("public");
      expect(res.headers.get("Cache-Control")).toContain("max-age=60");
      expect(res.headers.get("Cache-Control")).toContain(
        "stale-while-revalidate",
      );
    });
  });

  describe("server error", () => {
    it("returns 500 with errorId on database failure", async () => {
      mockWarehouseFindMany.mockRejectedValue(new Error("Connection lost"));

      const res = await getWarehouses();
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.errorId).toBeDefined();
      expect(body.error).toBe("Internal server error");
    });
  });
});
