import { type Request, type Response, type NextFunction } from "express";

const WINDOW_MS = 60_000;    // 1-minute sliding window
const MAX_REQUESTS = 60;     // 60 req/min per IP (1/sec sustained)

/** IP → sorted array of request timestamps in the current window */
const windows = new Map<string, number[]>();

// Purge stale IP records every 5 min to prevent unbounded growth
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [ip, ts] of windows) {
    const fresh = ts.filter((t) => t > cutoff);
    if (fresh.length === 0) windows.delete(ip);
    else windows.set(ip, fresh);
  }
}, 5 * 60_000).unref();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  const timestamps = (windows.get(ip) ?? []).filter((t) => t > cutoff);
  timestamps.push(now);
  windows.set(ip, timestamps);

  if (timestamps.length > MAX_REQUESTS) {
    const retryAfterMs = WINDOW_MS - (now - timestamps[0]);
    res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    res.status(429).json({
      error: "rate_limited",
      message: `Too many requests — limit is ${MAX_REQUESTS} per minute. Please slow down.`,
      retryAfterMs,
    });
    return;
  }

  next();
}
