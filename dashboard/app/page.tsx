import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  RANGES,
  getOverview,
  getTierStats,
  getTenantStats,
  getRecent,
  type Range,
} from "@/lib/queries";

// ---------- helpers ----------
const usd = (n: number) => `$${n.toFixed(6)}`;
const ms = (n: number) => `${Math.round(n)} ms`;
const pct = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";
const savingsPct = (cost: number, baseline: number) =>
  baseline > 0 ? (1 - cost / baseline) * 100 : null;

const TIER_COLORS: Record<string, string> = {
  cheap: "bg-emerald-500",
  premium: "bg-violet-500",
  fallback: "bg-amber-500",
};

function Badge({ text, tone }: { text: string; tone: "green" | "violet" | "amber" | "sky" | "red" | "zinc" }) {
  const tones = {
    green: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    violet: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
    amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    sky: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
    red: "bg-red-500/15 text-red-300 ring-red-500/30",
    zinc: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
  };
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {text}
    </span>
  );
}

const tierTone = (t: string | null) =>
  t === "cheap" ? "green" : t === "premium" ? "violet" : t === "fallback" ? "amber" : "zinc";
const statusTone = (code: number) => (code === 200 ? "green" : code === 429 ? "amber" : "red");

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

// ---------- page = static shell (renders instantly) ----------
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <header className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">LLM Gateway</h1>
            <p className="text-sm text-zinc-400">
              Cost-aware routing across Groq, Gemini and OpenRouter · shadow cost at list prices
            </p>
          </div>
        </header>

        {/* Dynamic part streams in; the skeleton shows meanwhile */}
        <Suspense fallback={<Skeleton />}>
          <Dashboard searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

function Skeleton() {
  return (
    <div className="grid animate-pulse grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-28 rounded-2xl bg-zinc-900" />
      ))}
    </div>
  );
}

// ---------- dynamic part (runs per request, on the server) ----------
async function Dashboard({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await connection();
  const { range: rawRange } = await searchParams;
  const range: Range = rawRange && rawRange in RANGES ? (rawRange as Range) : "all";

  const [o, tiers, tenants, recent] = await Promise.all([
    getOverview(range),
    getTierStats(range),
    getTenantStats(range),
    getRecent(),
  ]);

  const totalOk = tiers.reduce((s, t) => s + t.requests, 0);
  const saved = savingsPct(o.cost, o.baseline);

  return (
    <div className="space-y-8">
      {/* Range tabs */}
      <nav className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900 p-1">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link
            key={r}
            href={`/?range=${r}`}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${r === range ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-100"
              }`}
          >
            {r === "all" ? "All time" : r}
          </Link>
        ))}
      </nav>

      {/* Hero row */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-zinc-900 p-6 md:col-span-2">
          <div className="text-xs font-medium uppercase tracking-wider text-emerald-300">
            Savings vs all-premium
          </div>
          <div className="mt-2 text-5xl font-bold tabular-nums">
            {saved === null ? "—" : `${saved.toFixed(1)}%`}
          </div>
          <div className="mt-2 text-sm text-zinc-400">
            Spent {usd(o.cost)} · all-premium would cost {usd(o.baseline)}
          </div>
        </div>
        <Card label="Requests" value={String(o.total)} hint={`${o.ok} ok · ${o.errors} errors`} />
        <Card label="Latency p50 / p95" value={`${ms(o.p50)} / ${ms(o.p95)}`} />
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card label="Cache hit rate" value={pct(o.cache_hits, o.ok)} hint={`saved ${usd(o.cache_saved)}`} />
        <Card label="Fallback rate" value={pct(o.fallbacks, o.ok)} />
        <Card label="Rate-limited" value={pct(o.rate_limited, o.total)} hint={`${o.rate_limited} rejected`} />
        <Card label="Error rate" value={pct(o.errors, o.total)} />
      </section>

      {/* Tiers */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="mb-5 font-semibold">Traffic by tier</h2>
        {tiers.length === 0 && <p className="text-sm text-zinc-500">No data yet.</p>}
        <div className="space-y-5">
          {tiers.map((t) => {
            const s = savingsPct(t.cost, t.baseline);
            return (
              <div key={t.tier}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge text={t.tier} tone={tierTone(t.tier)} />
                    <span className="text-zinc-400">
                      {t.requests} req · {pct(t.requests, totalOk)}
                    </span>
                  </div>
                  <span className="tabular-nums text-zinc-400">
                    savings {s === null ? "—" : `${s.toFixed(1)}%`} · p50 {ms(t.p50)} · p95 {ms(t.p95)}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${TIER_COLORS[t.tier] ?? "bg-zinc-500"}`}
                    style={{ width: totalOk > 0 ? `${(t.requests / totalOk) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Tenants */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h2 className="mb-4 font-semibold">Tenants</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="pb-2">Tenant</th>
                <th className="pb-2">Req</th>
                <th className="pb-2">429s</th>
                <th className="pb-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.tenant_id} className="border-t border-zinc-800">
                  <td className="py-2 font-medium">{t.tenant_id}</td>
                  <td className="tabular-nums">{t.requests}</td>
                  <td className="tabular-nums">{t.rate_limited}</td>
                  <td className="text-right tabular-nums">{usd(t.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Recent */}
        <section className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold">Recent requests</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="pb-2">Time</th>
                <th className="pb-2">Tenant</th>
                <th className="pb-2">Model</th>
                <th className="pb-2">Cache</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Latency</th>
                <th className="pb-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={i} className="border-t border-zinc-800" title={r.route_reason ?? ""}>
                  <td className="whitespace-nowrap py-2 text-zinc-400">
                    {new Date(r.created_at).toLocaleTimeString("en-IN")}
                  </td>
                  <td>{r.tenant_id}</td>
                  <td>
                    {r.model_id ? <Badge text={r.model_id} tone={tierTone(r.tier)} /> : "—"}
                  </td>
                  <td>{r.cache === "hit" ? <Badge text="hit" tone="sky" /> : <span className="text-zinc-500">{r.cache}</span>}</td>
                  <td><Badge text={String(r.http_status)} tone={statusTone(r.http_status)} /></td>
                  <td className="text-right tabular-nums">{ms(r.latency_ms)}</td>
                  <td className="text-right tabular-nums">{usd(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-zinc-500">Hover a row to see why the router chose that model.</p>
        </section>
      </div>
    </div>
  );
}