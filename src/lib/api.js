import { NextResponse } from "next/server";

export function jsonError(error) {
  const message = error instanceof Error ? error.message : "Request failed";
  const status = message === "Authentication required" ? 401 : message === "Forbidden" || message.includes("access denied") ? 403 : message.includes("not found") ? 404 : 422;
  return NextResponse.json({ error: message }, { status });
}

export function parseJson(request) {
  return request.json().catch(() => {
    throw new Error("Request body must be valid JSON");
  });
}
