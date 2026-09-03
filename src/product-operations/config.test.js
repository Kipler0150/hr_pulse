import { afterEach, describe, expect, it, vi } from "vitest";
import { assertProductOperationsEnabled, getProductOperationsCursorSecret, isProductOperationsEnabled } from "./config";

describe("product operations configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables operations only for the literal true flag, covers AC-1", () => {
    vi.stubEnv("HR_PULSE_PRODUCT_OPERATIONS_ENABLED", "true");
    expect(isProductOperationsEnabled()).toBe(true);

    vi.stubEnv("HR_PULSE_PRODUCT_OPERATIONS_ENABLED", "1");
    expect(isProductOperationsEnabled()).toBe(false);
  });

  it("returns a stable disabled error when the release flag is off, covers AC-1", () => {
    vi.stubEnv("HR_PULSE_PRODUCT_OPERATIONS_ENABLED", "false");
    expect(() => assertProductOperationsEnabled()).toThrow("Product operations are disabled");
    expect(() => assertProductOperationsEnabled()).toThrow(expect.objectContaining({ code: "PRODUCT_OPERATIONS_DISABLED" }));
  });

  it("accepts a sufficiently long configured cursor secret, covers AC-4", () => {
    const secret = "configured-secret-012345678901234567890123";
    vi.stubEnv("HR_PULSE_PRODUCT_OPERATIONS_CURSOR_SECRET", secret);
    expect(getProductOperationsCursorSecret()).toBe(secret);
  });

  it("rejects a missing cursor secret in production, covers AC-4", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HR_PULSE_PRODUCT_OPERATIONS_CURSOR_SECRET", "");
    expect(() => getProductOperationsCursorSecret()).toThrow("HR_PULSE_PRODUCT_OPERATIONS_CURSOR_SECRET is required");
  });
});
