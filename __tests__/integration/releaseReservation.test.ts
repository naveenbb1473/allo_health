import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/reservations/[id]/release/route";
import { ValidationError, NotFoundError, DatabaseError } from "@/lib/errors";

// ─── Mock ReservationService ──────────────────────────────────────────────────
const { mockReleaseReservation } = vi.hoisted(() => ({
  mockReleaseReservation: vi.fn(),
}));

vi.mock("@/lib/services/reservationService", () => ({
  ReservationService: {
    releaseReservation: mockReleaseReservation,
  },
}));

// ─── Constants ────────────────────────────────────────────────────────────────
const RESERVATION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

// ─── Helper ───────────────────────────────────────────────────────────────────
function makeRequest(id: string) {
  return {
    req: new NextRequest(
      `http://localhost:3000/api/reservations/${id}/release`,
      {
        method: "POST",
      },
    ),
    ctx: { params: Promise.resolve({ id }) },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("POST /api/reservations/[id]/release", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 200 — successfully released ────────────────────────────────────────────
  describe("successful release", () => {
    it("returns 200 with released status", async () => {
      mockReleaseReservation.mockResolvedValue(true);

      const { req, ctx } = makeRequest(RESERVATION_ID);
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.id).toBe(RESERVATION_ID);
      expect(body.status).toBe("released");
      expect(body.message).toBe("Reservation released");
    });

    it("calls releaseReservation with the correct reservationId", async () => {
      mockReleaseReservation.mockResolvedValue(true);

      const { req, ctx } = makeRequest(RESERVATION_ID);
      await POST(req, ctx);

      expect(mockReleaseReservation).toHaveBeenCalledOnce();
      expect(mockReleaseReservation).toHaveBeenCalledWith(RESERVATION_ID);
    });
  });

  // ── 200 — idempotent (already processed) ───────────────────────────────────
  describe("already processed (idempotent)", () => {
    it('returns 200 with "already processed" message when service returns false', async () => {
      mockReleaseReservation.mockResolvedValue(false);

      const { req, ctx } = makeRequest(RESERVATION_ID);
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.message).toBe("Reservation already processed");
    });

    it("does not error on double-release attempt", async () => {
      mockReleaseReservation.mockResolvedValue(false);

      const { req, ctx } = makeRequest(RESERVATION_ID);
      const res = await POST(req, ctx);

      expect(res.status).toBe(200);
    });
  });

  // ── 404 — not found ────────────────────────────────────────────────────────
  describe("reservation not found", () => {
    it("returns 404 when reservation does not exist", async () => {
      mockReleaseReservation.mockRejectedValue(
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

  // ── 400 — validation ───────────────────────────────────────────────────────
  describe("validation error", () => {
    it("returns 400 on ValidationError", async () => {
      mockReleaseReservation.mockRejectedValue(
        new ValidationError("reservationId is required"),
      );

      const { req, ctx } = makeRequest("");
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("VALIDATION_ERROR");
      expect(body.message).toBe("reservationId is required");
    });
  });

  // ── 500 — server errors ────────────────────────────────────────────────────
  describe("server errors", () => {
    it("returns 500 with errorId on DatabaseError", async () => {
      mockReleaseReservation.mockRejectedValue(
        new DatabaseError("Lock timeout"),
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
      mockReleaseReservation.mockRejectedValue(new Error("Unexpected crash"));

      const { req, ctx } = makeRequest(RESERVATION_ID);
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.errorId).toBeDefined();
    });
  });

  // ── Concurrent idempotency ─────────────────────────────────────────────────
  describe("concurrent release", () => {
    it("handles multiple concurrent release attempts gracefully", async () => {
      let released = false;
      mockReleaseReservation.mockImplementation(async () => {
        if (released) return false;
        released = true;
        return true;
      });

      const results = await Promise.all([
        POST(
          ...(Object.values(makeRequest(RESERVATION_ID)) as [
            NextRequest,
            { params: Promise<{ id: string }> },
          ]),
        ),
        POST(
          ...(Object.values(makeRequest(RESERVATION_ID)) as [
            NextRequest,
            { params: Promise<{ id: string }> },
          ]),
        ),
        POST(
          ...(Object.values(makeRequest(RESERVATION_ID)) as [
            NextRequest,
            { params: Promise<{ id: string }> },
          ]),
        ),
      ]);

      const statuses = results.map((r) => r.status);
      // All must be 200 — either released or already processed
      statuses.forEach((s) => expect(s).toBe(200));

      const bodies = await Promise.all(results.map((r) => r.json()));
      const releaseCount = bodies.filter((b) => b.status === "released").length;
      expect(releaseCount).toBe(1);
    });
  });
});
