import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;
type PoolInstance = InstanceType<typeof Pool>;

let _pool: PoolInstance | null = null;
let _db: DbInstance | null = null;

function ensureInitialized(): { pool: PoolInstance; db: DbInstance } {
  if (!_db || !_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?",
      );
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    _db = drizzle(_pool, { schema });
  }
  return { pool: _pool, db: _db };
}

export const pool: PoolInstance = new Proxy({} as PoolInstance, {
  get(_, prop) {
    return (ensureInitialized().pool as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const db: DbInstance = new Proxy({} as DbInstance, {
  get(_, prop) {
    return (ensureInitialized().db as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export * from "./schema";
