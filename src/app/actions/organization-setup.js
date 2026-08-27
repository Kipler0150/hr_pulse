"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createOrganization } from "./organizations";

export async function createOrganizationAction(previousState, formData) {
  try {
    const frequency = String(formData.get("frequency") ?? "");
    const result = await createOrganization({
      name: String(formData.get("name") ?? "").trim(),
      timezone: String(formData.get("timezone") ?? "").trim(),
      defaultCurrency: String(formData.get("currency") ?? "").trim().toUpperCase(),
      frequency,
      effectiveStartDate: String(formData.get("effectiveStartDate") ?? ""),
      anchorStartDate: ["weekly", "biweekly"].includes(frequency) ? String(formData.get("effectiveStartDate") ?? "") : null,
    });
    const cookieStore = await cookies();
    cookieStore.set("hr_pulse_organization_id", result.organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    redirect("/payroll/setup");
  } catch (error) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    return { error: error instanceof Error ? error.message : "Organization setup failed" };
  }
}
