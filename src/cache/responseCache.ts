import { createHash } from "node:crypto";
import { redis } from "../lib/redis.js";
import type { ChatMessage, LLMResult } from "../llm/callModel.js";
import type { ModelId } from "../config/models.js";

const TTL_SECONDS = 60 * 60; // 1 hour

export type CacheEntry = {
  result: LLMResult;
  cachedAt: number;
};

// Same tenant + same model + same messages + same max_tokens → same key
export function makeCacheKey(
  tenantId: string,
  modelId: ModelId,
  messages: ChatMessage[],
  maxTokens?: number,
): string {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ modelId, messages, maxTokens: maxTokens ?? null }))
    .digest("hex");
  return `gw:cache:${tenantId}:${fingerprint}`;
}

export async function getCached(key: string): Promise<CacheEntry | null> {
  try {
    return await redis.get<CacheEntry>(key); // Upstash turns JSON back into an object
  } catch (err) {
    console.error(
      "[cache] read failed, skipping cache:",
      (err as Error).message,
    );
    return null; // cache broken → just call the AI normally
  }
}

export async function setCached(key: string, result: LLMResult): Promise<void> {
  try {
    const entry: CacheEntry = { result, cachedAt: Date.now() };
    await redis.set(key, entry, { ex: TTL_SECONDS }); // "ex" = expire after N seconds
  } catch (err) {
    console.error("[cache] write failed:", (err as Error).message);
  }
}
