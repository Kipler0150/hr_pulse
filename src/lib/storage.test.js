import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("./supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { sha256 } from "@/payroll/fingerprint";
import { assertPayslipsBucketPrivate, createPayslipDownloadUrl, getPayslipsBucket, uploadVerifiedPayslip, verifyPayslipObject } from "./storage";

describe("private payslip storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_PAYSLIPS_BUCKET", "private-payslips");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed when the bucket is missing or public, covers: AC-7 and AC-12", async () => {
    vi.stubEnv("SUPABASE_PAYSLIPS_BUCKET", "");
    expect(() => getPayslipsBucket()).toThrowError(expect.objectContaining({ code: "PAYSLIPS_BUCKET_UNAVAILABLE" }));

    vi.stubEnv("SUPABASE_PAYSLIPS_BUCKET", "private-payslips");
    mocks.createAdminClient.mockReturnValue({ storage: { getBucket: vi.fn().mockResolvedValue({ data: { public: true }, error: null }) } });
    await expect(assertPayslipsBucketPrivate()).rejects.toMatchObject({ code: "PAYSLIPS_BUCKET_UNAVAILABLE" });
  });

  it("uploads then reads back matching immutable input bytes, covers: AC-7 and AC-8", async () => {
    const bytes = Buffer.from("verified pdf bytes");
    const from = {
      upload: vi.fn().mockResolvedValue({ error: null }),
      download: vi.fn().mockResolvedValue({ data: new Blob([bytes]), error: null }),
    };
    mocks.createAdminClient.mockReturnValue({ storage: { getBucket: vi.fn().mockResolvedValue({ data: { public: false }, error: null }), from: vi.fn(() => from) } });

    await expect(uploadVerifiedPayslip("opaque/v1.pdf", bytes, sha256(bytes))).resolves.toEqual({ bucket: "private-payslips", size: bytes.length });
    expect(from.upload).toHaveBeenCalledWith("opaque/v1.pdf", bytes, { contentType: "application/pdf", upsert: true });
  });

  it("rejects an upload readback checksum mismatch, covers: AC-7 and AC-8", async () => {
    const from = {
      upload: vi.fn().mockResolvedValue({ error: null }),
      download: vi.fn().mockResolvedValue({ data: new Blob(["changed bytes"]), error: null }),
    };
    mocks.createAdminClient.mockReturnValue({ storage: { getBucket: vi.fn().mockResolvedValue({ data: { public: false }, error: null }), from: vi.fn(() => from) } });

    await expect(uploadVerifiedPayslip("opaque/v1.pdf", Buffer.from("original"), sha256("original")))
      .rejects.toMatchObject({ code: "PAYSLIP_INTEGRITY_FAILED" });
  });

  it("verifies existing objects and rejects missing objects, covers: AC-7 and AC-9", async () => {
    const bytes = Buffer.from("stored pdf");
    const download = vi.fn()
      .mockResolvedValueOnce({ data: new Blob([bytes]), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("not found") });
    mocks.createAdminClient.mockReturnValue({ storage: { getBucket: vi.fn().mockResolvedValue({ data: { public: false }, error: null }), from: vi.fn(() => ({ download })) } });

    await expect(verifyPayslipObject("opaque/v1.pdf", sha256(bytes))).resolves.toBe(true);
    await expect(verifyPayslipObject("missing.pdf", sha256(bytes))).rejects.toMatchObject({ code: "PAYSLIP_INTEGRITY_FAILED" });
  });

  it("creates a signed private URL with a sixty second default, covers: AC-7", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://storage.invalid/signed" }, error: null });
    mocks.createAdminClient.mockReturnValue({ storage: { getBucket: vi.fn().mockResolvedValue({ data: { public: false }, error: null }), from: vi.fn(() => ({ createSignedUrl })) } });

    await expect(createPayslipDownloadUrl("opaque/v1.pdf")).resolves.toBe("https://storage.invalid/signed");
    expect(createSignedUrl).toHaveBeenCalledWith("opaque/v1.pdf", 60);
  });
});
