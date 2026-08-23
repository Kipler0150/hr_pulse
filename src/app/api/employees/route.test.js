import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { getDb } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { GET, POST } from "./route";

describe("employees API", () => {
  it("rejects a list request without organization context", async () => {
    const request = new NextRequest("http://localhost/api/employees");
    const response = await GET(request);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "organizationId must be a valid UUID" });
  });

  it("rejects an employee creation request without authentication", async () => {
    createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) } });
    getDb.mockReturnValue({});
    const request = new NextRequest("http://localhost/api/employees", {
      method: "POST",
      body: JSON.stringify({
        organizationId: "123e4567-e89b-12d3-a456-426614174000",
        employeeNumber: "E001",
        legalName: "Taylor Smith",
        email: "taylor@example.com",
        hireDate: "2026-08-23",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required" });
  });
});