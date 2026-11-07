import type { Request, Response, NextFunction } from "express";
import { Ratelimit } from "@upstash/ratelimit";
import type { Tenant } from "../config/tenants.js";
import { redis } from "../lib/redis.js";

// One limiter per limit size (3/min, 20/min, ...), created on first use
const limiters = new Map<number, Ratelimit>();

function getLimiter(perMinute: number): Ratelimit {
  let limiter = limiters.get(perMinute);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(perMinute, "60 s"),
      prefix: `gw:ratelimit:${perMinute}`,
      timeout: 1000, // if Redis is slow for 1 s, let the request through
    });
    limiters.set(perMinute, limiter);
  }
  return limiter;
}

export async function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const tenant = res.locals.tenant as Tenant;

  try {
    const { success, limit, remaining, reset } = await getLimiter(
      tenant.requestsPerMinute,
    ).limit(tenant.id); // count PER TENANT

    // Standard headers so clients can see their limit
    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader("X-RateLimit-Remaining", remaining);

    if (!success) {
      const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      res.setHeader("Retry-After", retryAfterSec);
      res.status(429).json({
        error: {
          message: `Rate limit exceeded: ${limit} requests per minute. Try again in ${retryAfterSec}s.`,
        },
      });
      return;
    }
  } catch (err) {
    // If Redis is down, we choose to let traffic through (fail-open)
    console.error(
      "[ratelimit] Redis error, allowing request:",
      (err as Error).message,
    );
  }

  next();
}
