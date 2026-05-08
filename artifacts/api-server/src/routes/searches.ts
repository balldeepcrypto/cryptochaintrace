import { Router, type IRouter } from "express";
import { desc, sql } from "drizzle-orm";
import { db, searchesTable } from "@workspace/db";
import {
  SaveSearchBody,
  GetRecentSearchesResponse,
  GetRecentSearchesResponseItem,
  GetSearchStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/searches", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(searchesTable)
    .orderBy(desc(searchesTable.searchedAt))
    .limit(20);

  res.json(
    GetRecentSearchesResponse.parse(
      rows.map((r) => ({
        id: r.id,
        address: r.address,
        chain: r.chain,
        searchedAt: r.searchedAt.toISOString(),
        label: r.label ?? null,
      })),
    ),
  );
});

router.post("/searches", async (req, res): Promise<void> => {
  const parsed = SaveSearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", message: parsed.error.message });
    return;
  }

  const [row] = await db
    .insert(searchesTable)
    .values({
      address: parsed.data.address,
      chain: parsed.data.chain,
      label: parsed.data.label ?? null,
    })
    .returning();

  res.status(201).json(
    GetRecentSearchesResponseItem.parse({
      id: row.id,
      address: row.address,
      chain: row.chain,
      searchedAt: row.searchedAt.toISOString(),
      label: row.label ?? null,
    }),
  );
});

router.get("/searches/stats", async (req, res): Promise<void> => {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(searchesTable);

  const [{ unique }] = await db
    .select({ unique: sql<number>`count(distinct address)::int` })
    .from(searchesTable);

  const popularRows = await db
    .select({
      address: searchesTable.address,
      chain: searchesTable.chain,
      label: searchesTable.label,
      searchCount: sql<number>`count(*)::int`,
    })
    .from(searchesTable)
    .groupBy(searchesTable.address, searchesTable.chain, searchesTable.label)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  const recentRows = await db
    .select({
      date: sql<string>`date_trunc('day', searched_at)::date::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(searchesTable)
    .groupBy(sql`date_trunc('day', searched_at)`)
    .orderBy(desc(sql`date_trunc('day', searched_at)`))
    .limit(7);

  res.json(
    GetSearchStatsResponse.parse({
      totalSearches: total ?? 0,
      uniqueWallets: unique ?? 0,
      popularWallets: popularRows.map((r) => ({
        address: r.address,
        chain: r.chain,
        searchCount: r.searchCount,
        label: r.label ?? null,
      })),
      recentActivity: recentRows.map((r) => ({
        date: r.date,
        count: r.count,
      })),
    }),
  );
});

export default router;
