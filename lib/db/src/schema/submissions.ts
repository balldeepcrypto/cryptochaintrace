import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const submissionsTable = pgTable("case_submissions", {
  id: serial("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  victimWallet: text("victim_wallet").notNull(),
  thiefWallet: text("thief_wallet").notNull(),
  chains: text("chains").notNull(),
  txHashes: text("tx_hashes"),
  description: text("description"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  status: text("status").notNull().default("pending"),
});

export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit({ id: true, submittedAt: true, status: true });
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissionsTable.$inferSelect;
