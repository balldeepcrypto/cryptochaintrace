/**
 * Create once per scan. Cache the in-flight promise as well as its result so
 * concurrent branches cannot start separate history fetches for one wallet.
 * Pagination, retries and incomplete-history handling remain with the loader.
 */
export function createClusterHistoryCache<T>(
  canonicalize: (address: string) => string,
  fetchHistory: (address: string) => Promise<T[]>,
): (address: string) => Promise<T[]> {
  const histories = new Map<string, Promise<T[]>>();
  return (address) => {
    const key = canonicalize(address);
    const cached = histories.get(key);
    if (cached) return cached;
    // Defer the loader until after storing its promise, including when the
    // loader throws synchronously. Never introduce a second retry mechanism.
    const pending = Promise.resolve().then(() => fetchHistory(address));
    histories.set(key, pending);
    return pending;
  };
}
