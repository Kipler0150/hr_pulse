import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

const AUTH_COOKIE_PREFIX = "sb-";

export async function updateSession(request) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  let authError = null;
  try {
    ({ error: authError } = await supabase.auth.getUser());
  } catch (error) {
    authError = error;
  }

  if (authError && authError.name !== "AuthSessionMissingError") {
    const authCookieNames = request.cookies.getAll()
      .map(({ name }) => name)
      .filter((name) => name.startsWith(AUTH_COOKIE_PREFIX));
    authCookieNames.forEach((name) => request.cookies.delete(name));
    response = NextResponse.next({ request });
    authCookieNames.forEach((name) => response.cookies.delete(name));
  }

  return response;
}
