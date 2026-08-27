import { describe, expect, it } from "vitest";
import { createPreviewToken, createSourceFingerprint, hashPreviewToken } from "./fingerprint";

describe("payroll fingerprints", () => {
  it("is stable for object key order and changes with source values", () => {
    expect(createSourceFingerprint({ b: 2, a: { d: 4, c: 3 } })).toBe(createSourceFingerprint({ a: { c: 3, d: 4 }, b: 2 }));
    expect(createSourceFingerprint({ amount: 100 })).not.toBe(createSourceFingerprint({ amount: 101 }));
  });

  it("includes source update times in the fingerprint", () => {
    expect(createSourceFingerprint({ updatedAt: new Date("2026-08-01T00:00:00.000Z") }))
      .not.toBe(createSourceFingerprint({ updatedAt: new Date("2026-08-02T00:00:00.000Z") }));
  });

  it("stores only a hash of an opaque preview token", () => {
    const preview = createPreviewToken();
    expect(preview.token).not.toBe(preview.tokenHash);
    expect(hashPreviewToken(preview.token)).toBe(preview.tokenHash);
  });
});
