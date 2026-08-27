import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/inngest/client", async () => {
  const { Inngest } = await import("inngest");
  return { inngest: new Inngest({ id: "hr-pulse-test" }) };
}, { virtual: true });

describe("Inngest route", () => {
  beforeEach(() => {
    process.env.INNGEST_DEV = "1";
  });

  it("returns the local development endpoint status", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/inngest"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("dev");
    expect(body.function_count).toBe(2);
  }, 15_000);
});
