import { Redis } from "@upstash/redis";

// One shared Redis client for the whole app (rate limiter + cache)
export const redis = Redis.fromEnv();
