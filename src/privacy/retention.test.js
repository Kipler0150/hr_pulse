import { afterEach, describe, expect, it, vi } from "vitest";

import { runPrivacyRetention } from "./retention";

function emptyQuery() {
  const query = {
    from() {
      return query;
    },
    where() {
      return query;
    },
    orderBy() {
      return query;
    },
    limit() {
      return Promise.resolve([]);
    },
  };
  return query;
}

function databaseSpy(executedQueries) {
  const transaction = {
    execute: vi.fn(async (query) => {
      executedQueries.push(query);
      return [];
    }),
    select: vi.fn(() => emptyQuery()),
  };
  return {
    transaction: vi.fn((callback) => callback(transaction)),
    select: vi.fn(() => emptyQuery()),
  };
}

describe("privacy retention", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("passes timestamp strings to raw retention queries (covers AC-6 and AC-11)", async () => {
    vi.stubEnv("HR_PULSE_PRIVACY_ENABLED", "true");
    const executedQueries = [];
    const db = databaseSpy(executedQueries);

    await expect(runPrivacyRetention({
      db,
      now: new Date("2026-09-03T00:00:00.000Z"),
      batchSize: 1,
    })).resolves.toMatchObject({ status: "completed" });

    const dateChunks = executedQueries.flatMap((query) => query.queryChunks ?? [])
      .filter((chunk) => chunk instanceof Date);
    expect(dateChunks).toEqual([]);
  });
});
