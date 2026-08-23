import { NextResponse } from "next/server";
import { safeReturnTo } from "@/auth/access";
import { createClient } from "@/lib/supabase/server";

// Recovery links arrive in two shapes:
// - `?code=...` from a PKCE ConfirmationURL. Exchanging it depends on the code
//   verifier cookie that only exists in the browser which requested the email,
//   so a link clicked elsewhere (or after a newer reset request) fails.
// - `?token_hash=...&type=recovery` from a recovery template using TokenHash.
//   This shape is stateless: any browser or device works, and newer reset
//   requests never invalidate an older emailed token hash.
const supportedTokenTypes = new Set(["recovery"]);

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const tokenType = requestUrl.searchParams.get("type");
  const next = safeReturnTo(requestUrl.searchParams.get("next"));
  const destination = new URL(next, requestUrl.origin);

  let error = null;
  if (code || (tokenHash && supportedTokenTypes.has(tokenType))) {
    const supabase = await createClient();
    if (code) {
      ({ error } = await supabase.auth.exchangeCodeForSession(code));
    } else {
      ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tokenType }));
    }
  } else {
    error = new Error("No usable recovery credentials in the request");
  }

  if (error) {
    destination.searchParams.set("error", "access_denied");
    destination.searchParams.set("error_code", "otp_expired");
  }
  return NextResponse.redirect(destination);
}