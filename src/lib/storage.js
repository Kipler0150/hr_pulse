import { createAdminClient } from "./supabase/admin";

const PAYSLIPS_BUCKET = "payslips";

export async function createPayslipDownloadUrl(path, expiresIn = 300) {
  const { data, error } = await createAdminClient()
    .storage
    .from(PAYSLIPS_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) throw error;
  return data.signedUrl;
}