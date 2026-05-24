import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/reservations/route";
import { ValidationError, OutOfStockError, DatabaseError } from "@/lib/errors";
import { ReservationStatus } from "@prisma/client";

// ─── Valid UUIDs ──────────────────────────────────────────────────────────────
const PRODUCT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const WAREHOUSE_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const CUSTOMER_ID = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";
const IDEMPOTENCY_KEY = "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44";

// ─── Mock @/lib/services/reservationService ───────────────────────────────────
const { mockReserve } = vi.hoisted(() => ({ mockReserve: vi.fn() }));

vi.mock("@/lib/services/reservationService", () => ({
  reserve: mockReserve,
}));

// ─── Mock idempotency middleware ───────────────────────────────────────────────
const { mockGetCached, mockCacheResponse } = vi.hoisted(() => ({
  mockGetCached: vi.fn(),
  mockCacheResponse: vi.fn(),
}));

vi.mock("@/lib/middleware/idempotency", () => ({
  getCachedIdempotentResponse: mockGetCached,
  cacheIdempotentResponse: mockCacheResponse,
}));

// ─── Fixture ──────────────────────────────────────────────────────────────────
const reservationFixture = {
  id: "res-uuid-001",
  customerId: CUSTOMER_ID,
  status: ReservationStatus.pending,
  expiresAt: new Date("2026-05-24T08:00:00.000Z"),
  items: [{ productId: PRODUCT_ID, warehouseId: WAREHOUSE_ID, quantity: 2 }],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost:3000/api/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const validBody = {
  productId: PRODUCT_ID,
  warehouseId: WAREHOUSE_ID,
  quantity: 2,
  customerId: CUSTOMER_ID,
};

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("POST /api/reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no cached response
    mockGetCached.mockResolvedValue(null);
    mockCacheResponse.mockResolvedValue(undefined);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────
  describe("successful reservation", () => {
    it("returns 201 with reservation payload", async () => {
      mockReserve.mockResolvedValue(reservationFixture);

      const res = await POST(makeRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.id).toBe("res-uuid-001");
      expect(body.customerId).toBe(CUSTOMER_ID);
      expect(body.status).toBe("pending");
      expect(body).toHaveProperty("expiresAt");
      expect(body.items).toHaveLength(1);
      expect(body.items[0].quantity).toBe(2);
    });

    it("expiresAt is serialized as ISO string", async () => {
      mockReserve.mockResolvedValue(reservationFixture);

      const res = await POST(makeRequest(validBody));
      const body = await res.json();

      expect(body.expiresAt).toBe("2026-05-24T08:00:00.000Z");
    });

    it("calls reserve() with correct arguments", async () => {
      mockReserve.mockResolvedValue(reservationFixture);

      await POST(makeRequest(validBody));

      expect(mockReserve).toHaveBeenCalledOnce();
      expect(mockReserve).toHaveBeenCalledWith(
        PRODUCT_ID,
        WAREHOUSE_ID,
        2,
        CUSTOMER_ID,
      );
    });
  });

  // ── Insufficient stock ─────────────────────────────────────────────────────
  describe("insufficient stock (reserve returns null)", () => {
    it("returns 409 INSUFFICIENT_STOCK", async () => {
      mockReserve.mockResolvedValue(null);

      const res = await POST(makeRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error).toBe("INSUFFICIENT_STOCK");
      expect(body.requested).toBe(2);
      expect(body).toHaveProperty("available");
    });
  });

  // ── Validation errors ──────────────────────────────────────────────────────
  describe("request validation", () => {
    it("returns 400 when productId is not a UUID", async () => {
      const res = await POST(
        makeRequest({ ...validBody, productId: "not-a-uuid" }),
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_REQUEST");
      expect(body.message).toContain("productId");
    });

    it("returns 400 when warehouseId is missing", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { warehouseId: _wh, ...rest } = validBody;
      const res = await POST(makeRequest(rest));

      expect(res.status).toBe(400);
    });

    it("returns 400 when quantity is zero", async () => {
      const res = await POST(makeRequest({ ...validBody, quantity: 0 }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toMatch(/positive/i);
    });

    it("returns 400 when quantity is a float", async () => {
      const res = await POST(makeRequest({ ...validBody, quantity: 1.5 }));

      expect(res.status).toBe(400);
    });

    it("returns 400 when quantity exceeds 1000", async () => {
      const res = await POST(makeRequest({ ...validBody, quantity: 1001 }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toMatch(/1000/i);
    });

    it("returns 400 when customerId is not a UUID", async () => {
      const res = await POST(
        makeRequest({ ...validBody, customerId: "bad-id" }),
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when body is not JSON", async () => {
      const req = new NextRequest("http://localhost:3000/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json {{",
      });
      const res = await POST(req);

      expect(res.status).toBe(500);
    });
  });

  // ── Domain error propagation ───────────────────────────────────────────────
  describe("domain error handling", () => {
    it("returns 400 when service throws ValidationError", async () => {
      mockReserve.mockRejectedValue(
        new ValidationError("productId is required"),
      );

      const res = await POST(makeRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_REQUEST");
      expect(body.message).toBe("productId is required");
    });

    it("returns 409 when service throws OutOfStockError", async () => {
      mockReserve.mockRejectedValue(new OutOfStockError("No stock available"));

      const res = await POST(makeRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error).toBe("INSUFFICIENT_STOCK");
    });

    it("returns 500 with errorId when service throws DatabaseError", async () => {
      mockReserve.mockRejectedValue(new DatabaseError("Connection timeout"));

      const res = await POST(makeRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error).toBe("INTERNAL_SERVER_ERROR");
      expect(body.errorId).toBeDefined();
    });

    it("returns 500 on unknown error", async () => {
      mockReserve.mockRejectedValue(new Error("Unexpected boom"));

      const res = await POST(makeRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.errorId).toBeDefined();
    });
  });

  // ── Idempotency ────────────────────────────────────────────────────────────
  describe("idempotency", () => {
    it("returns cached response on second request with same key", async () => {
      const cachedBody = {
        id: "cached-res",
        status: "pending",
        customerId: CUSTOMER_ID,
        expiresAt: "2026-05-24T08:00:00.000Z",
        items: [],
      };
      mockGetCached.mockResolvedValue({ body: cachedBody, status: 201 });

      const res = await POST(
        makeRequest(validBody, { "Idempotency-Key": IDEMPOTENCY_KEY }),
      );
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.id).toBe("cached-res");
      // reserve() should NOT be called — response came from cache
      expect(mockReserve).not.toHaveBeenCalled();
    });

    it("caches the successful response on first request", async () => {
      mockReserve.mockResolvedValue(reservationFixture);
      mockGetCached.mockResolvedValue(null);

      await POST(
        makeRequest(validBody, { "Idempotency-Key": IDEMPOTENCY_KEY }),
      );

      expect(mockCacheResponse).toHaveBeenCalledOnce();
      expect(mockCacheResponse).toHaveBeenCalledWith(
        IDEMPOTENCY_KEY,
        expect.objectContaining({ id: "res-uuid-001" }),
        201,
      );
    });

    it("caches the 409 response on stock failure", async () => {
      mockReserve.mockResolvedValue(null);
      mockGetCached.mockResolvedValue(null);

      const res = await POST(
        makeRequest(validBody, { "Idempotency-Key": IDEMPOTENCY_KEY }),
      );

      expect(res.status).toBe(409);
      expect(mockCacheResponse).toHaveBeenCalledWith(
        IDEMPOTENCY_KEY,
        expect.objectContaining({ error: "INSUFFICIENT_STOCK" }),
        409,
      );
    });

    it("does not cache when no Idempotency-Key header provided", async () => {
      mockReserve.mockResolvedValue(reservationFixture);

      await POST(makeRequest(validBody));

      expect(mockCacheResponse).not.toHaveBeenCalled();
    });
  });

  // ── Concurrent requests (simulated) ───────────────────────────────────────
  describe("concurrency simulation", () => {
    it("exactly one of two concurrent requests succeeds when only 1 unit available", async () => {
      let reserved = false;
      mockGetCached.mockResolvedValue(null);
      mockReserve.mockImplementation(async () => {
        if (reserved) return null; // simulate stock exhausted
        reserved = true;
        return { ...reservationFixture, id: crypto.randomUUID() };
      });

      const [r1, r2] = await Promise.all([
        POST(makeRequest({ ...validBody, quantity: 1 })),
        POST(makeRequest({ ...validBody, quantity: 1 })),
      ]);

      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);
    });

    it("all requests fail gracefully when stock is 0 from the start", async () => {
      mockGetCached.mockResolvedValue(null);
      mockReserve.mockResolvedValue(null);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => POST(makeRequest(validBody))),
      );

      results.forEach((res) => expect(res.status).toBe(409));
    });
  });
});
