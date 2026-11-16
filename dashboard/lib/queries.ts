import "server-only";
import { sql } from "./db";

// Time filters → Postgres intervals
export const RANGES = {
  "24h": "24 hours",
  "7d": "7 days",
  all: "100 years",
} as const;
export type Range = keyof typeof RANGES;

export type Overview = {
  total: number;
  ok: number;
  errors: number;
  rate_limited: number;
  cache_hits: number;
  fallbacks: number;
  cost: number;
  baseline: number;
  cache_saved: number;
  p50: number;
  p95: number;
};

export type TierRow = {
  tier: string;
  requests: number;
  cache_hits: number;
  cost: number;
  baseline: number;
  p50: number;
  p95: number;
};

export type TenantRow = {
  tenant_id: string;
  requests: number;
  rate_limited: number;
  errors: number;
  cost: number;
};

export type RecentRow = {
  created_at: string | Date;
  tenant_id: string;
  model_id: string | null;
  tier: string | null;
  cache: string;
  status: string;
  http_status: number;
  latency_ms: number;
  cost: number;
  route_reason: string | null;
};

// ::float8 turns exact NUMERIC into a normal JS number. Fine for DISPLAY;
// the stored values stay exact.
export async function getOverview(range: Range): Promise<Overview> {
  const [row] = await sql`
    SELECT
      count(*)::int                                         AS total,
      count(*) FILTER (WHERE status = 'ok')::int            AS ok,
      count(*) FILTER (WHERE status = 'error')::int         AS errors,
      count(*) FILTER (WHERE status = 'rate_limited')::int  AS rate_limited,
      count(*) FILTER (WHERE cache = 'hit')::int            AS cache_hits,
      count(*) FILTER (WHERE used_fallback)::int            AS fallbacks,
      coalesce(sum(cost_usd), 0)::float8                    AS cost,
      coalesce(sum(baseline_cost_usd), 0)::float8           AS baseline,
      coalesce(sum(saved_usd), 0)::float8                   AS cache_saved,
      coalesce(percentile_cont(0.5)  WITHIN GROUP (ORDER BY latency_ms)
               FILTER (WHERE status = 'ok'), 0)::float8     AS p50,
      coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
               FILTER (WHERE status = 'ok'), 0)::float8     AS p95
    FROM requests
    WHERE created_at > now() - ${RANGES[range]}::interval
  `;
  return row as Overview;
}

export async function getTierStats(range: Range): Promise<TierRow[]> {
  const rows = await sql`
    SELECT
      tier,
      count(*)::int                                  AS requests,
      count(*) FILTER (WHERE cache = 'hit')::int     AS cache_hits,
      sum(cost_usd)::float8                          AS cost,
      sum(baseline_cost_usd)::float8                 AS baseline,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY latency_ms)::float8 AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float8 AS p95
    FROM requests
    WHERE status = 'ok'
      AND created_at > now() - ${RANGES[range]}::interval
    GROUP BY tier
    ORDER BY requests DESC
  `;
  return rows as TierRow[];
}

export async function getTenantStats(range: Range): Promise<TenantRow[]> {
  const rows = await sql`
    SELECT
      tenant_id,
      count(*)::int                                        AS requests,
      count(*) FILTER (WHERE status = 'rate_limited')::int AS rate_limited,
      count(*) FILTER (WHERE status = 'error')::int        AS errors,
      coalesce(sum(cost_usd), 0)::float8                   AS cost
    FROM requests
    WHERE created_at > now() - ${RANGES[range]}::interval
    GROUP BY tenant_id
    ORDER BY requests DESC
  `;
  return rows as TenantRow[];
}

export async function getRecent(): Promise<RecentRow[]> {
  const rows = await sql`
    SELECT created_at, tenant_id, model_id, tier, cache, status, http_status,
           latency_ms, cost_usd::float8 AS cost, route_reason
    FROM requests
    ORDER BY created_at DESC
    LIMIT 20
  `;
  return rows as RecentRow[];
}
