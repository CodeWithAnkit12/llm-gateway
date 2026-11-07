import "dotenv/config";
import { sql } from "../db/client.js";

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS requests (
      id                BIGSERIAL PRIMARY KEY,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      request_id        TEXT NOT NULL,
      tenant_id         TEXT NOT NULL,
      requested_model   TEXT NOT NULL,         -- "auto" or a specific model
      model_id          TEXT,                  -- who actually answered (null if failed)
      provider          TEXT,
      tier              TEXT,
      route_reason      TEXT,
      status            TEXT NOT NULL,         -- 'ok' | 'error' | 'rate_limited'
      http_status       INT  NOT NULL,
      cache             TEXT NOT NULL,         -- 'hit' | 'miss' | 'bypass' | 'none'
      escalated         BOOLEAN NOT NULL DEFAULT false,
      used_fallback     BOOLEAN NOT NULL DEFAULT false,
      attempts          INT  NOT NULL DEFAULT 0,
      input_tokens      INT  NOT NULL DEFAULT 0,
      output_tokens     INT  NOT NULL DEFAULT 0,
      cost_usd          NUMERIC(14,10) NOT NULL DEFAULT 0,  -- exact money, not float
      baseline_cost_usd NUMERIC(14,10) NOT NULL DEFAULT 0,  -- "if all-premium"
      saved_usd         NUMERIC(14,10) NOT NULL DEFAULT 0,  -- saved by cache
      latency_ms        INT  NOT NULL,
      error             TEXT
    )
  `;
  // Indexes make "last 24h for tenant X" queries fast
  await sql`CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests (created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_requests_tenant_time ON requests (tenant_id, created_at)`;

  console.log("✅ Table 'requests' is ready");
}

main().catch((err) => {
  console.error("Migration failed:", (err as Error).message);
  process.exit(1);
});
