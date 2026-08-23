import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

let client;

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL");
  }

  client ??= postgres(process.env.DATABASE_URL, { prepare: false });
  return drizzle(client);
}