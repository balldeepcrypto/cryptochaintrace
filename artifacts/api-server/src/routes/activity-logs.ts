import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, activityLogsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/activity-logs", async (req, res): Promise<void> => {
  try {
    const { department, userEmail, limit = "200", offset = "0" } = req.query as Record<string, string>;

    let query = db.select().from(activityLogsTable).$dynamic();

    if (department) {
      query = query.where(eq(activityLogsTable.department, department));
    }
    if (userEmail) {
      query = query.where(eq(activityLogsTable.userEmail, userEmail));
    }

    const rows = await query
      .orderBy(desc(activityLogsTable.timestamp))
      .limit(Math.min(Number(limit) || 200, 500))
      .offset(Number(offset) || 0);

    res.json(
      rows.map((r) => ({
        id: r.id,
        userEmail: r.userEmail,
        department: r.department,
        action: r.action,
        timestamp: r.timestamp.toISOString(),
        sessionDurationSeconds: r.sessionDurationSeconds ?? null,
        metadata: r.metadata ?? null,
      })),
    );
  } catch (err) {
    req.log.warn({ err }, "GET /activity-logs failed");
    res.json([]);
  }
});

router.post("/activity-logs", async (req, res): Promise<void> => {
  const { userEmail, department, action, sessionDurationSeconds, metadata } = req.body ?? {};

  if (!userEmail || !action) {
    res.status(400).json({ error: "userEmail and action are required" });
    return;
  }

  try {
    const [row] = await db
      .insert(activityLogsTable)
      .values({
        userEmail: String(userEmail),
        department: department ? String(department) : "",
        action: String(action),
        sessionDurationSeconds: sessionDurationSeconds != null ? Number(sessionDurationSeconds) : null,
        metadata: metadata ?? null,
      })
      .returning();

    res.status(201).json({
      id: row.id,
      userEmail: row.userEmail,
      department: row.department,
      action: row.action,
      timestamp: row.timestamp.toISOString(),
      sessionDurationSeconds: row.sessionDurationSeconds ?? null,
      metadata: row.metadata ?? null,
    });
  } catch (err) {
    req.log.warn({ err }, "POST /activity-logs failed");
    res.status(503).json({ error: "db_unavailable" });
  }
});

router.delete("/activity-logs/user/:email", async (req, res): Promise<void> => {
  try {
    await db
      .delete(activityLogsTable)
      .where(eq(activityLogsTable.userEmail, req.params.email));
    res.json({ ok: true });
  } catch (err) {
    req.log.warn({ err }, "DELETE /activity-logs/user/:email failed");
    res.status(503).json({ error: "db_unavailable" });
  }
});

// Summary: last-seen per user (for the analysts list)
router.get("/activity-logs/last-seen", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        userEmail: activityLogsTable.userEmail,
        lastSeen: sql<string>`max(${activityLogsTable.timestamp})::text`,
      })
      .from(activityLogsTable)
      .groupBy(activityLogsTable.userEmail);

    res.json(Object.fromEntries(rows.map((r) => [r.userEmail, r.lastSeen])));
  } catch (err) {
    req.log.warn({ err }, "GET /activity-logs/last-seen failed");
    res.json({});
  }
});

export default router;
