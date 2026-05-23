import { pgTable, uuid, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activityLogsTable = pgTable("analyst_activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userEmail: text("user_email").notNull(),
  department: text("department").notNull().default(""),
  action: text("action").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  sessionDurationSeconds: integer("session_duration_seconds"),
  metadata: jsonb("metadata"),
});

export const insertActivityLogSchema = createInsertSchema(activityLogsTable).omit({
  id: true,
  timestamp: true,
});
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogsTable.$inferSelect;
