import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseClient = vi.fn(() => ({ auth: {} }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args) => createSupabaseClient(...args),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { createRecoveryClient } from "./server";

describe("Supabase recovery client", () => {
  beforeEach(() => {
    createSupabaseClient.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("uses the implicit flow so emailed links work without a verifier cookie", () => {
    createRecoveryClient();

    expect(createSupabaseClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "anon-key",
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          flowType: "implicit",
          persistSession: false,
        },
      },
    );
  });
});
