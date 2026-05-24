import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/reservations/[id]/confirm/route";
import {
  ValidationError,
  NotFoundError,
  ExpiredReservationError,
  InvalidReservationStateError,
  DatabaseError,
} from "@/lib/errors";
import { ReservationStatus } from "@prisma/client";

// ─── Mock ReservationService ──────────────────────────────────────────────────
const { mockConfirmReservation } = vi.hoisted(() => ({
  mockConfirmReservation: vi.fn(),
}));

vi.mock("@/lib/services/reservationService", () => ({
  ReservationService: {
    confirmReservation: mockConfirmReservation,
  },
}));

// ─── Constants ────────────────────────────────────────────────────────────────
const RESERVATION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const CUSTOMER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const CONFIRMED_AT = new Date("2026-05-24T10:00:00.000Z");

// ─── Fixture ──────────────────────────────────────────────────────────────────
const confirmedReservationFixture = {
  id: RESERVATION_ID,
  customerId: CUSTOMER_ID,
  status: ReservationStatus.confirmed,
  expiresAt: new Date("2026-05-24T10:10:00.000Z"),
  confirmedAt: CONFIRMED_AT,
  releasedAt: null,
  items: [{ productId: "prod-001", warehouseId: "wh-001", quantity: 3 }],
};

// ─── Helper ───────────────────────────────────────────────────────────────────
function makeRequest(id: string): {
  req: NextRequest;
  ctx: { params: Promise<{ id: string }> };
} {
  return {
    req: new NextRequest(
      `http://localhost:3000/api/reservations/${id}/confirm`,
      {
        method: "POST",
      },
    ),
    ctx: { params: Promise.resolve({ id }) },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("POST /api/reservations/[id]/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 200 — pending → confirmed ───────────────────────────────────────────────
  describe("confirm pending reservation", () => {
    it("returns 200 with confirmed status", async () => {
      mockConfirmReservation.mockResolvedValue(confirmedReservationFixture);

      const { req, ctx } = makeRequest(RESERVATION_ID);
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.id).toBe(RESERVATION_ID);
      expect(body.status).toBe("confirmed");
    });

    it("response includes confirmedAt as ISO string", async () => {
      mockConfirmReservation.mockResolvedValue(confirmedReservationFixture);

      const { req, ctx } = makeRequest(RESERVATION_ID);
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(body.confirmedAt).toBe("2026-05-24T10:00:00.000Z");
    });

    it("response includes items array", async () => {
      mockConfirmReservation.mockResolvedValue(confirmedReservationFixture);

      const { req, ctx } = makeRequest(RESERVATION_ID);
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(body.items).toHaveLength(1);
      expect(body.items[0].quantity).toBe(3);
    });

    it("calls confirmReservation with the correct reservationId", async () => {
      mockConfirmReservation.mockResolvedValue(confirmedReservationFixture);

      const { req, ctx } = makeRequest(RESERVATION_ID);
      await POST(req, ctx);

      expect(mockConfirmReservation).toHaveBeenCalledOnce();
      expect(mockConfirmReservation).toHaveBeenCalledWith(RESERVATION_ID);
    });

    it("handles null confirmedAt gracefully", async () => {
      mockConfirmReservation.mockResolvedValue({
        ...confirmedReservationFixture,
        confirmedAt: null,
      });

      const { req, ctx } = makeRequest(RESERVATION_ID);
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.confirmedAt).toBeNull();
    });
  });

  // ── 400 — already confirmed / released ─────────────────────────────────────
  describe("invalid reservation state", () => {
    it("returns 400 when already confirmed (InvalidReservationStateError)", async () => {
      mockConfirmReservation.mockRejectedValue(
        new InvalidReservationStateError(
          "Reservation status is confirmed, expected pending",
        ),
      );

      const { req, ctx } = makeRequest(RESERVATION_ID);
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_RESERVATION_STATE");
      expect(body.message).toContain("confirmed");
    });

    it("returns 400 when already released (InvalidReservationStateError)", async () => {
      mockConfirmReservation.mockRejectedValue(
        new InvalidReservationStateError(
          "Reservation status is released, expected pending",
        ),
      );

      const { req, ctx } = makeRequest(RESERVATION_ID);
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_RESERVATION_STATE");
    });

    it("returns 400 on ValidationError (missing reservationId)", async () => {
      mockConfirmReservation.mockRejectedValue(
        new ValidationError("reservationId is required"),
      );

      const { req, ctx } = makeRequest("");
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_RESERVATION_STATE");
    });
  });

  // ── 410 — expired ──────────────────────────────────────────────────────────
  describe("expired reservation", () => {
    it("returns 410 when reservation has expired", async () => {
      mockConfirmReservation.mockRejectedValue(
        new ExpiredReservationError("Reservation has expired"),
      );

      const { req, ctx } = makeRequest(RESERVATION_ID);
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(410);
      expect(body.error).toBe("RESERVATION_EXPIRED");
      expect(body.message).toBe("Reservation has expired");
    });
  });

  // ── 404 — not found ────────────────────────────────────────────────────────
  describe("reservation not found", () => {
    it("returns 404 when reservation does not exist", async () => {
      mockConfirmReservation.mockRejectedValue(
        new NotFoundError("Reservation not found"),
      );

      const { req, ctx } = makeRequest("non-existent-id");
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toBe("RESERVATION_NOT_FOUND");
      expect(body.message).toBe("Reservation not found");
    });
  });

  // ── 500 — server errors ────────────────────────────────────────────────────
  describe("server errors", () => {
    it("returns 500 with errorId on DatabaseError", async () => {
      mockConfirmReservation.mockRejectedValue(
        new DatabaseError("Transaction serialization failure"),
      );

      const { req, ctx } = makeRequest(RESERVATION_ID);
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error).toBe("INTERNAL_SERVER_ERROR");
      expect(body.errorId).toBeDefined();
      expect(body.message).toContain("support");
    });

    it("returns 500 with errorId on unknown error", async () => {
      mockConfirmReservation.mockRejectedValue(new Error("Unexpected crash"));

      const { req, ctx } = makeRequest(RESERVATION_ID);
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.errorId).toBeDefined();
    });
  });
});
