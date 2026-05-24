import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const analystsTable = pgTable("analysts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  department: text("department").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAnalystSchema = createInsertSchema(analystsTable).omit({ id: true, createdAt: true });
export type InsertAnalyst = z.infer<typeof insertAnalystSchema>;
export type Analyst = typeof analystsTable.$inferSelect;
