import { transferIdentity, type EvidenceTransfer } from "./report-evidence";

export interface ReportHistory<T extends EvidenceTransfer = EvidenceTransfer> {
  transactions: T[];
  nextCursor: string | null;
  complete: boolean;
  available: number | null;
  warnings: string[];
  pages: number;
}

interface HistoryPage<T> {
  transactions: T[];
  nextCursor?: string | null;
  hasMore?: boolean;
  archiveWarning?: string | null;
  message?: string | null;
}

/** Explorer totals may be rolling minima, operation counts or page counts.
 * Never present them as an exact number of available transfers. */
export async function loadReportHistory<T extends EvidenceTransfer>(
  fetchPage: (cursor?: string) => Promise<HistoryPage<T>>,
  previous?: ReportHistory<T>,
): Promise<ReportHistory<T>> {
  if (previous?.complete) return previous;
  const transactions = previous?.transactions.slice() ?? [];
  const seen = new Set(transactions.map(transferIdentity));
  const cursors = new Set<string>();
  const warnings = (previous?.warnings ?? []).filter((warning) => !warning.startsWith("Fetch failed:"));
  let cursor = previous?.nextCursor ?? undefined;
  let pages = previous?.pages ?? 0;
  let complete = false;
  while (true) {
    try {
      const page = await fetchPage(cursor);
      pages++;
      if (page.archiveWarning && !warnings.includes(page.archiveWarning)) warnings.push(page.archiveWarning);
      if (page.message && !warnings.includes(page.message)) warnings.push(page.message);
      for (const tx of page.transactions) {
        const key = transferIdentity(tx);
        if (!seen.has(key)) { seen.add(key); transactions.push(tx); }
      }
      if (page.hasMore === false) { complete = !page.archiveWarning && !warnings.length; cursor = undefined; break; }
      if (!page.nextCursor || cursors.has(page.nextCursor) || page.nextCursor === cursor) {
        warnings.push("Pagination is missing or repeated. Loaded records retained; older history may be missing.");
        break;
      }
      cursors.add(page.nextCursor);
      cursor = page.nextCursor;
    } catch (error) {
      warnings.push(`Fetch failed: ${error instanceof Error ? error.message : String(error)}. Partial records retained.`);
      break;
    }
  }
  return { transactions, complete, available: complete ? transactions.length : null, nextCursor: cursor ?? null, warnings, pages };
}

// Separate report queue: do not alter Cluster Finder's queue or retry handling.
let reportQueue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export function reportRequest<T>(operation: () => Promise<T>): Promise<T> {
  const pending = reportQueue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      await wait(Math.max(0, 1100 - (Date.now() - lastRequestAt)));
      lastRequestAt = Date.now();
      try { return await operation(); }
      catch (error) {
        const failure = error as { status?: number; retryAfter?: string | null };
        if (attempt >= 4 || ![429, 502, 503, 504].includes(failure.status ?? 0)) throw error;
        const seconds = Number(failure.retryAfter);
        const until = Date.parse(failure.retryAfter ?? "");
        const retryMs = failure.retryAfter && Number.isFinite(seconds) ? seconds * 1000
          : Number.isFinite(until) ? until - Date.now() : 0;
        await wait(Math.max(2000 * 2 ** attempt, retryMs));
      }
    }
  });
  reportQueue = pending.catch(() => undefined);
  return pending;
}
