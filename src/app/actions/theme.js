"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { normalizeTheme, THEME_COOKIE } from "@/lib/theme";

export async function setTheme(formData) {
  const theme = normalizeTheme(String(formData.get("theme") ?? "system"));
  const cookieStore = await cookies();

  cookieStore.set(THEME_COOKIE, theme, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/", "layout");
}
