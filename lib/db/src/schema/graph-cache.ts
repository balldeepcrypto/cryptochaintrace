import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const graphCacheTable = pgTable(
  "graph_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    data:     jsonb("data").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("graph_cache_expires_idx").on(t.expiresAt)],
);

export type GraphCacheEntry = typeof graphCacheTable.$inferSelect;
