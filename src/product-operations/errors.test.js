import { describe, expect, it } from "vitest";
import { ProductOperationsError, productOperationsIssue } from "./errors";

describe("product operations errors", () => {
  it("keeps known error codes and safe messages together, covers AC-5 and AC-12", () => {
    const error = new ProductOperationsError("AUDIT_CURSOR_INVALID", new Error("database details"));
    expect(error).toMatchObject({ code: "AUDIT_CURSOR_INVALID", message: "This audit page link has expired or is invalid." });
    expect(error.cause.message).toBe("database details");
  });

  it("normalizes unknown codes to the unavailable group error, covers AC-8", () => {
    expect(new ProductOperationsError("not_a_real_code")).toMatchObject({ code: "OPERATIONS_GROUP_UNAVAILABLE", message: "This operations group is temporarily unavailable." });
  });

  it("hides raw exceptions when creating a safe issue, covers AC-8 and AC-9", () => {
    expect(productOperationsIssue(new Error("private database message"))).toEqual({
      code: "OPERATIONS_GROUP_UNAVAILABLE",
      message: "This operations group is temporarily unavailable.",
    });
  });
});
