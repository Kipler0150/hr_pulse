import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import { runPrivacyRetention } from "./retention";
import { analyticsSubjectKey } from "./analytics";

function emptyQuery(rows = []) {
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
      return Promise.resolve(rows);
    },
    then(resolve, reject) {
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  return query;
}

function databaseSpy(executedQueries, activeHolds = []) {
  let transactionSelectCalls = 0;
  const transaction = {
    execute: vi.fn(async (query) => {
      executedQueries.push(query);
      return [];
    }),
    select: vi.fn(() => emptyQuery(transactionSelectCalls++ === 0 ? activeHolds : [])),
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

  it("keeps rows attributed to held profiles out of each global subject retention query (covers AC-10 and AC-11)", async () => {
    vi.stubEnv("HR_PULSE_PRIVACY_ENABLED", "true");
    vi.stubEnv("HR_PULSE_PRIVACY_ANALYTICS_SECRET", "a".repeat(32));
    const executedQueries = [];
    const organizationId = "123e4567-e89b-42d3-a456-426614174000";
    const profileId = "223e4567-e89b-42d3-a456-426614174000";
    const db = databaseSpy(executedQueries, [{ organizationId, profileId }]);

    await runPrivacyRetention({ db, now: new Date("2026-09-03T00:00:00.000Z"), batchSize: 1 });

    const compiled = executedQueries.map((query) => new PgDialect().sqlToQuery(query));
    const subjectKey = analyticsSubjectKey({ organizationId, profileId });
    const analyticsQuery = compiled.find(({ sql }) => sql.includes("delete from product_events"));
    const failuresQuery = compiled.find(({ sql }) => sql.includes("delete from operation_failures"));
    const consentsQuery = compiled.find(({ sql }) => sql.includes("delete from privacy_consents"));

    expect(analyticsQuery).toBeDefined();
    expect(analyticsQuery.sql).toContain("analytics_subject_key");
    expect(analyticsQuery.params).toContain(subjectKey);
    expect(failuresQuery).toBeDefined();
    expect(failuresQuery.sql).toContain("analytics_subject_key");
    expect(failuresQuery.params).toContain(subjectKey);
    expect(consentsQuery).toBeDefined();
    expect(consentsQuery.sql).toContain("privacy_holds");
    expect(consentsQuery.sql).toContain("active = true");
  });
});
