import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "./index";

describe("database connection", () => {
  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("rejects a connection when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;

    expect(() => getDb()).toThrow(
      "DATABASE_URL is required to connect to PostgreSQL",
    );
  });
});