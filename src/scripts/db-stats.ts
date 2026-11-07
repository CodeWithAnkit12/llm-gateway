import "dotenv/config";
import { sql } from "../db/client.js";

async function main() {
  const [s] = await sql`
    SELECT
      count(*)::int                                          AS total_requests,
      count(*) FILTER (WHERE status = 'ok')::int             AS ok,
      count(*) FILTER (WHERE status = 'error')::int          AS errors,
      count(*) FILTER (WHERE status = 'rate_limited')::int   AS rate_limited,
      round(100.0 * count(*) FILTER (WHERE cache = 'hit')
            / NULLIF(count(*) FILTER (WHERE status = 'ok'), 0), 1) AS cache_hit_pct,
      round(100.0 * count(*) FILTER (WHERE used_fallback)
            / NULLIF(count(*) FILTER (WHERE status = 'ok'), 0), 1) AS fallback_pct,
      sum(cost_usd)          AS total_cost_usd,
      sum(baseline_cost_usd) AS all_premium_cost_usd,
      sum(saved_usd)         AS cache_saved_usd,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE status = 'ok') AS p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE status = 'ok') AS p95_ms
    FROM requests
  `;
  console.log("\n=== Overall ===");
  console.table(s);

  const cost = Number(s.total_cost_usd ?? 0);
  const baseline = Number(s.all_premium_cost_usd ?? 0);
  if (baseline > 0) {
    console.log(
      `💰 Savings vs all-premium: ${((1 - cost / baseline) * 100).toFixed(1)}%`,
    );
  }

  const tiers = await sql`
    SELECT tier, count(*)::int AS requests
    FROM requests
    WHERE status = 'ok'
    GROUP BY tier
    ORDER BY requests DESC
  `;
  console.log("\n=== Traffic per tier ===");
  console.table(tiers);
}

main().catch((err) => {
  console.error("Stats failed:", (err as Error).message);
  process.exit(1);
});
