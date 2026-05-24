import { beforeEach, describe, expect, it, vi } from "vitest";
import { StockService } from "@/lib/services/stockService";
import { ValidationError } from "@/lib/errors";

// Grab Prisma from the real module before vi.mock() intercepts @prisma/client
const { Prisma } =
  await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
const Decimal = Prisma.Decimal;

// 💡 Define tracking containers directly inside the hoisted mock factory boundary
vi.mock("@prisma/client", async () => {
  const actual =
    await vi.importActual<typeof import("@prisma/client")>("@prisma/client");

  const mockTx = vi.fn();
  const mockFindMany = vi.fn();
  const mockFindUnique = vi.fn();
  const mockUpdate = vi.fn();

  return {
    ...actual,
    Prisma: actual.Prisma, // explicitly pass through so top-level import resolves
    PrismaClient: vi.fn().mockImplementation(() => ({
      $transaction: mockTx,
      stock: {
        findMany: mockFindMany,
        findUnique: mockFindUnique,
        update: mockUpdate,
      },
    })),
    // Expose references to the test runner environment safely via global properties
    __mocks: { mockTx, mockFindMany, mockFindUnique, mockUpdate },
  };
});

// Retrieve the hoisted tracking function references cleanly

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __mocks } = (await import("@prisma/client")) as any;
const { mockTx, mockFindMany, mockFindUnique, mockUpdate } = __mocks;

const stockRowFixture = {
  totalUnits: 100,
  reservedUnits: 30,
  product: {
    id: "prod_123",
    name: "Sample Item",
    description: "An item description",
    price: new Decimal(49.99),
  },
};

describe("StockService Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProductsWithStock()", () => {
    it("calculates available units cleanly as total minus reserved", async () => {
      mockFindMany.mockResolvedValue([stockRowFixture]);

      const result = await StockService.getProductsWithStock("wh_abc");

      expect(result).toHaveLength(1);
      expect(result[0].total).toBe(100);
      expect(result[0].reserved).toBe(30);
      expect(result[0].available).toBe(70); // 100 - 30
      expect(result[0].product.name).toBe("Sample Item");
    });

    it("throws ValidationError when warehouseId is omitted", async () => {
      await expect(StockService.getProductsWithStock("")).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe("getStockLevel()", () => {
    it("returns structured dimensions for matching product", async () => {
      mockFindUnique.mockResolvedValue({ totalUnits: 50, reservedUnits: 10 });

      const result = await StockService.getStockLevel("prod_123", "wh_abc");

      expect(result).not.toBeNull();
      expect(result?.total).toBe(50);
      expect(result?.reserved).toBe(10);
      expect(result?.available).toBe(40); // 50 - 10
    });

    it("returns null if the stock line cannot be found", async () => {
      mockFindUnique.mockResolvedValue(null);
      const result = await StockService.getStockLevel("prod_missing", "wh_abc");
      expect(result).toBeNull();
    });
  });

  describe("releaseStock()", () => {
    it("returns true on valid lock acquisition and reduction", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockTx.mockImplementation(async (callback: any) => {
        const tx = {
          $queryRaw: vi
            .fn()
            .mockResolvedValue([
              { id: "stock_1", totalUnits: 10, reservedUnits: 5 },
            ]),
          stock: { update: mockUpdate },
        };
        return callback(tx);
      });

      const success = await StockService.releaseStock("prod_123", "wh_abc", 3);
      expect(success).toBe(true);
    });

    it("returns false and skips update if reduction causes an underflow", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockTx.mockImplementation(async (callback: any) => {
        const tx = {
          $queryRaw: vi
            .fn()
            .mockResolvedValue([
              { id: "stock_1", totalUnits: 10, reservedUnits: 2 },
            ]),
          stock: { update: mockUpdate },
        };
        return callback(tx);
      });

      const success = await StockService.releaseStock("prod_123", "wh_abc", 5); // 5 > 2
      expect(success).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("throws ValidationError for bad input quantities", async () => {
      await expect(
        StockService.releaseStock("prod_123", "wh_abc", -1),
      ).rejects.toThrow(ValidationError);
      await expect(
        StockService.releaseStock("prod_123", "wh_abc", 2.5),
      ).rejects.toThrow(ValidationError);
    });
  });
});
