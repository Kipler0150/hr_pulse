import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, createServerClient } = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn(({ request }) => ({ request, cookies: { set: vi.fn(), delete: vi.fn() } })),
  },
}));

import { updateSession } from "./proxy";
import { NextResponse } from "next/server";

function requestWithCookies(cookies) {
  return {
    cookies: {
      getAll: vi.fn(() => cookies),
      set: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe("Supabase proxy session refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerClient.mockImplementation((url, key, options) => {
      getUser.mockImplementation(async () => {
        options.cookies.setAll([{ name: "sb-project-auth-token", value: "rotated", options: { path: "/" } }]);
        return { data: { user: { id: "user-id" } }, error: null };
      });
      return { auth: { getUser } };
    });
  });

  it("copies rotated cookies to the response", async () => {
    const request = requestWithCookies([{ name: "sb-project-auth-token", value: "old" }]);
    const response = await updateSession(request);
    expect(request.cookies.set).toHaveBeenCalledWith("sb-project-auth-token", "rotated");
    expect(response.cookies.set).toHaveBeenCalledWith("sb-project-auth-token", "rotated", { path: "/" });
  });

  it("removes failed refresh cookies from the current request and response", async () => {
    getUser.mockRejectedValueOnce(Object.assign(new Error("refresh failed"), { name: "AuthRefreshError" }));
    const request = requestWithCookies([{ name: "sb-project-auth-token", value: "stale" }, { name: "other", value: "keep" }]);

    const response = await updateSession(request);

    expect(request.cookies.delete).toHaveBeenCalledWith("sb-project-auth-token");
    expect(response.cookies.delete).toHaveBeenCalledWith("sb-project-auth-token");
    expect(request.cookies.delete).not.toHaveBeenCalledWith("other");
    expect(NextResponse.next).toHaveBeenCalledTimes(2);
  });
});
