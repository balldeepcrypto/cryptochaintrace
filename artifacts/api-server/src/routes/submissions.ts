import { Router, type IRouter } from "express";
import { db, submissionsTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/submissions", async (req, res): Promise<void> => {
  const { name, email, victimWallet, thiefWallet, chains, txHashes, description } = req.body ?? {};

  if (!email || !victimWallet || !thiefWallet || !chains) {
    res.status(400).json({ error: "missing_fields", message: "email, victimWallet, thiefWallet, and chains are required." });
    return;
  }

  try {
    const [row] = await db
      .insert(submissionsTable)
      .values({
        name: name ?? null,
        email,
        victimWallet,
        thiefWallet,
        chains,
        txHashes: txHashes ?? null,
        description: description ?? null,
      })
      .returning();

    res.status(201).json({
      id: row.id,
      submittedAt: row.submittedAt.toISOString(),
      status: row.status,
    });
  } catch (err) {
    req.log.warn({ err }, "POST /submissions failed");
    res.status(503).json({ error: "db_unavailable", message: "Could not save submission. Please try again." });
  }
});

export default router;
