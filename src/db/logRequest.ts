import { sql } from "./client.js";

export type RequestLog = {
  requestId: string;
  tenantId: string;
  requestedModel: string;
  modelId?: string | null;
  provider?: string | null;
  tier?: string | null;
  routeReason?: string | null;
  status: "ok" | "error" | "rate_limited";
  httpStatus: number;
  cache: "hit" | "miss" | "bypass" | "none";
  escalated?: boolean;
  usedFallback?: boolean;
  attempts?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  baselineCostUsd?: number;
  savedUsd?: number;
  latencyMs: number;
  error?: string | null;
};

// Never throws: a broken database must never break a user's request
export async function logRequest(log: RequestLog): Promise<void> {
  try {
    await sql`
      INSERT INTO requests (
        request_id, tenant_id, requested_model, model_id, provider, tier, route_reason,
        status, http_status, cache, escalated, used_fallback, attempts,
        input_tokens, output_tokens, cost_usd, baseline_cost_usd, saved_usd,
        latency_ms, error
      ) VALUES (
        ${log.requestId}, ${log.tenantId}, ${log.requestedModel},
        ${log.modelId ?? null}, ${log.provider ?? null}, ${log.tier ?? null}, ${log.routeReason ?? null},
        ${log.status}, ${log.httpStatus}, ${log.cache},
        ${log.escalated ?? false}, ${log.usedFallback ?? false}, ${log.attempts ?? 0},
        ${log.inputTokens ?? 0}, ${log.outputTokens ?? 0},
        ${log.costUsd ?? 0}, ${log.baselineCostUsd ?? 0}, ${log.savedUsd ?? 0},
        ${log.latencyMs}, ${log.error ?? null}
      )
    `;
  } catch (err) {
    console.error("[db] failed to log request:", (err as Error).message);
  }
}
