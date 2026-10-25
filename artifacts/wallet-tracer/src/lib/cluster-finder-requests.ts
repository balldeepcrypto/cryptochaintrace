// A shared queue prevents Cluster Finder workers (and overlapping scans in this
// tab) from independently spending the API's per-IP request allowance.
const REQUEST_INTERVAL_MS = 1_250; // At most 48 starts/minute; leave headroom.
const MAX_RETRIES = 6;
export const CLUSTER_REQUEST_TIMEOUT_MS = 45_000;

/** Settle even if a provider ignores abort, so it cannot block the shared queue. */
export function clusterTimedRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  timeoutMs = CLUSTER_REQUEST_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const onAbort = () => {
      controller.abort();
      reject(new DOMException("Cluster scan cancelled", "AbortError"));
    };
    if (signal.aborted) { onAbort(); return; }
    const timer = setTimeout(() => {
      controller.abort();
      reject(new TypeError(`History request timed out after ${Math.ceil(timeoutMs / 1000)} seconds`));
    }, timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve().then(() => request(controller.signal)).then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    });
    // Cleanup must not depend on the underlying fetch honoring its abort.
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", onAbort); };
    controller.signal.addEventListener("abort", cleanup, { once: true });
  });
}

export function clusterDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cluster scan cancelled", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cluster scan cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, Math.max(0, ms));
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

interface RequestFailure {
  status?: number;
  headers?: Headers;
  data?: { retryAfterMs?: number };
}

export function clusterRetryDelay(error: unknown, attempt: number): number | null {
  const failure = error as RequestFailure | null;
  const status = failure?.status;
  const rateLimited = status === 429;
  if (!rateLimited && !(status && status >= 500 && status <= 599) && !(error instanceof TypeError)) {
    return null;
  }
  let serverDelay = 0;
  const retryAfter = failure?.headers?.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    serverDelay = Number.isFinite(seconds)
      ? Math.max(0, seconds * 1_000)
      : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0;
  }
  const bodyDelay = failure?.data?.retryAfterMs;
  if (typeof bodyDelay === "number" && Number.isFinite(bodyDelay)) {
    serverDelay = Math.max(serverDelay, bodyDelay);
  }
  // A full window for 429s avoids extending the server's sliding window by
  // repeatedly retrying while it is still full. Never shorten Retry-After.
  const backoff = rateLimited
    ? Math.min(120_000, 60_000 * 2 ** attempt)
    : Math.min(30_000, 2_000 * 2 ** attempt);
  return Math.max(serverDelay, backoff) + 250 + Math.random() * 500;
}

let tail: Promise<unknown> = Promise.resolve();
let nextRequestAt = 0;

export function clusterRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  onRetry?: (message: string) => void,
): Promise<T> {
  const queued = tail.then(async () => {
    for (let attempt = 0; ; attempt += 1) {
      await clusterDelay(nextRequestAt - Date.now(), signal);
      nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;
      try {
        return await clusterTimedRequest(request, signal);
      } catch (error) {
        if (signal.aborted) throw new DOMException("Cluster scan cancelled", "AbortError");
        const delay = clusterRetryDelay(error, attempt);
        if (delay === null || attempt >= MAX_RETRIES) throw error;
        nextRequestAt = Math.max(nextRequestAt, Date.now() + delay);
        const reason = (error as RequestFailure)?.status === 429 ? "Rate limit" : "Temporary request failure";
        onRetry?.(`${reason}: waiting ${Math.ceil(delay / 1_000)}s before retry ${attempt + 1}/${MAX_RETRIES}. The current history page will be retried.`);
      }
    }
  });
  // A failure must not poison the queue for other wallets or future scans.
  tail = queued.catch(() => undefined);
  return queued;
}
