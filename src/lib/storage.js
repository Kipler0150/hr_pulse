import { createAdminClient } from "./supabase/admin";
import { sha256 } from "@/payroll/fingerprint";
import { PayrollError } from "@/payroll/errors";
import { assertSelfServiceTestFailure } from "@/self-service/config";

export function getPayslipsBucket() {
  const bucket = process.env.SUPABASE_PAYSLIPS_BUCKET;
  if (!bucket) throw new PayrollError("PAYSLIPS_BUCKET_UNAVAILABLE");
  return bucket;
}

export async function assertPayslipsBucketPrivate() {
  const bucket = getPayslipsBucket();
  const { data, error } = await createAdminClient().storage.getBucket(bucket);
  if (error || !data || data.public) throw new PayrollError("PAYSLIPS_BUCKET_UNAVAILABLE", { cause: error });
  return bucket;
}

export async function uploadVerifiedPayslip(path, bytes, expectedHash) {
  const bucket = await assertPayslipsBucketPrivate();
  const storage = createAdminClient().storage.from(bucket);
  const { error: uploadError } = await storage.upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (uploadError) throw new PayrollError("PAYSLIP_GENERATION_FAILED", { cause: uploadError });

  const { data, error: downloadError } = await storage.download(path);
  if (downloadError) throw new PayrollError("PAYSLIP_INTEGRITY_FAILED", { cause: downloadError });
  const storedBytes = Buffer.from(await data.arrayBuffer());
  if (sha256(storedBytes) !== expectedHash) throw new PayrollError("PAYSLIP_INTEGRITY_FAILED");
  return { bucket, size: storedBytes.byteLength };
}

export async function removePayslip(path) {
  const bucket = getPayslipsBucket();
  await createAdminClient().storage.from(bucket).remove([path]);
}

export async function createPayslipDownloadUrl(path, expiresIn = 60) {
  const bucket = await assertPayslipsBucketPrivate();
  assertSelfServiceTestFailure("download.signing");
  const { data, error } = await createAdminClient()
    .storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) throw new PayrollError("PAYSLIP_INTEGRITY_FAILED", { cause: error });
  return data.signedUrl;
}

export async function verifyPayslipObject(path, expectedHash) {
  const bucket = await assertPayslipsBucketPrivate();
  const { data, error } = await createAdminClient().storage.from(bucket).download(path);
  if (error || !data) throw new PayrollError("PAYSLIP_INTEGRITY_FAILED", { cause: error });
  const bytes = Buffer.from(await data.arrayBuffer());
  if (sha256(bytes) !== expectedHash) throw new PayrollError("PAYSLIP_INTEGRITY_FAILED");
  return true;
}
