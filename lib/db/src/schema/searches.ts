import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const searchesTable = pgTable("searches", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  chain: text("chain").notNull().default("ethereum"),
  label: text("label"),
  searchedAt: timestamp("searched_at").notNull().defaultNow(),
});

export const insertSearchSchema = createInsertSchema(searchesTable).omit({ id: true, searchedAt: true });
export type InsertSearch = z.infer<typeof insertSearchSchema>;
export type Search = typeof searchesTable.$inferSelect;
