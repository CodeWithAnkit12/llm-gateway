import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "../lib/redis.js";
import type { Tenant } from "../config/tenants.js";
import { logRequest } from "../db/logRequest.js";

const limiters = new Map<number, Ratelimit>();

function getLimiter(perMinute: number): Ratelimit {
  let limiter = limiters.get(perMinute);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(perMinute, "60 s"),
      prefix: `gw:ratelimit:${perMinute}`,
      timeout: 1000,
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
    ).limit(tenant.id);

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
      // NEW: count rejections too (one of our dashboard metrics)
      void logRequest({
        requestId: randomUUID(),
        tenantId: tenant.id,
        requestedModel: String(req.body?.model ?? "auto"),
        status: "rate_limited",
        httpStatus: 429,
        cache: "none",
        latencyMs: 0,
      });
      return;
    }
  } catch (err) {
    console.error(
      "[ratelimit] Redis error, allowing request:",
      (err as Error).message,
    );
  }

  next();
}
