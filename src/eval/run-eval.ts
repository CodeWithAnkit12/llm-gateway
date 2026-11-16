import "dotenv/config";
import { writeFileSync } from "node:fs";
import OpenAI from "openai";
import { DATASET, type EvalItem } from "./dataset.js";

const client = new OpenAI({
  apiKey: process.env.TEST_KEY_GLOBEX ?? "",
  baseURL: "http://127.0.0.1:3000/v1",
  maxRetries: 0,
  timeout: 60_000,
});

const ARMS = [
  { name: "all-cheap", model: "groq-cheap" },
  { name: "routed", model: "auto" },
  { name: "all-premium", model: "gemini-premium" },
] as const;
type Arm = (typeof ARMS)[number];
type ArmName = Arm["name"];

type Result = {
  arm: ArmName;
  itemId: string;
  kind: string;
  correct: boolean;
  costUsd: number;
  latencyMs: number;
  modelUsed: string;
  usedFallback: boolean;
  error?: string;
};

const PACE_MS = 3500; // stay under globex's 20 requests/minute
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, idx)];
}

async function runOne(arm: Arm, item: EvalItem): Promise<Result> {
  try {
    const res = await client.chat.completions.create(
      { model: arm.model, messages: [{ role: "user", content: item.prompt }] },
      { headers: { ...item.headers, "x-cache": "bypass" } }, // cache OFF for a fair test
    );
    const answer = res.choices[0]?.message?.content ?? "";
    const gw = (res as unknown as { gateway: Record<string, unknown> }).gateway;
    return {
      arm: arm.name,
      itemId: item.id,
      kind: item.kind,
      correct: item.check(answer),
      costUsd: Number(gw.cost_usd ?? 0),
      latencyMs: Number(gw.latency_ms ?? 0),
      modelUsed: res.model,
      usedFallback: Boolean(gw.used_fallback),
    };
  } catch (err) {
    return {
      arm: arm.name,
      itemId: item.id,
      kind: item.kind,
      correct: false,
      costUsd: 0,
      latencyMs: 0,
      modelUsed: "—",
      usedFallback: false,
      error: (err as Error).message,
    };
  }
}

async function main() {
  console.log(
    `Starting eval: ${DATASET.length} questions × ${ARMS.length} arms...\n`,
  );
  const results: Result[] = [];
  const total = DATASET.length * ARMS.length;

  // INTERLEAVED: each question goes through all 3 arms before the next question
  for (const item of DATASET) {
    for (const arm of ARMS) {
      const r = await runOne(arm, item);
      results.push(r);
      console.log(
        `[${results.length}/${total}]`.padEnd(9),
        arm.name.padEnd(12),
        item.id,
        r.error ? `ERROR ${r.error}` : r.correct ? "✅" : "❌",
        r.usedFallback ? `(fallback → ${r.modelUsed})` : "",
      );
      await sleep(PACE_MS);
    }
  }

  // ---------- Summary per arm ----------
  const lines: string[] = [];
  const simpleCount = DATASET.filter((d) => d.kind === "simple").length;
  const hardCount = DATASET.filter((d) => d.kind === "hard").length;

  lines.push(`# Eval results (${new Date().toISOString().slice(0, 10)})`);
  lines.push("");
  lines.push(
    `${DATASET.length} questions (${simpleCount} simple / ${hardCount} hard), cache bypassed, shadow cost at list prices.`,
  );
  lines.push("");
  lines.push(
    "| Arm | Accuracy | Total cost | Cost per correct answer | p50 | p95 | Fallbacks | Errors |",
  );
  lines.push("|---|---|---|---|---|---|---|---|");

  const summary: Record<string, { cost: number; correct: number; n: number }> =
    {};
  for (const arm of ARMS) {
    const rs = results.filter((r) => r.arm === arm.name);
    const correct = rs.filter((r) => r.correct).length;
    const cost = rs.reduce((s, r) => s + r.costUsd, 0);
    const lat = rs.filter((r) => !r.error).map((r) => r.latencyMs);
    summary[arm.name] = { cost, correct, n: rs.length };
    lines.push(
      `| ${arm.name} | ${((correct / rs.length) * 100).toFixed(0)}% (${correct}/${rs.length}) ` +
        `| $${cost.toFixed(6)} | ${correct > 0 ? "$" + (cost / correct).toFixed(7) : "—"} ` +
        `| ${percentile(lat, 50)} ms | ${percentile(lat, 95)} ms ` +
        `| ${rs.filter((r) => r.usedFallback).length} | ${rs.filter((r) => r.error).length} |`,
    );
  }

  // ---------- The headline numbers ----------
  const routed = summary["routed"];
  const premium = summary["all-premium"];
  const costCut = premium.cost > 0 ? (1 - routed.cost / premium.cost) * 100 : 0;
  const perCorrectRouted =
    routed.correct > 0 ? routed.cost / routed.correct : 0;
  const perCorrectPremium =
    premium.correct > 0 ? premium.cost / premium.correct : 0;
  const perCorrectCut =
    perCorrectPremium > 0
      ? (1 - perCorrectRouted / perCorrectPremium) * 100
      : 0;

  lines.push("");
  lines.push("## Headline (routed vs all-premium)");
  lines.push(`- Total cost: **${costCut.toFixed(1)}% lower**`);
  lines.push(
    `- Cost per correct answer: **${perCorrectCut.toFixed(1)}% lower**`,
  );
  lines.push(
    `- Accuracy: routed ${routed.correct}/${routed.n} vs premium ${premium.correct}/${premium.n}`,
  );

  // ---------- Per-question matrix ----------
  lines.push("");
  lines.push("## Per question");
  lines.push("| Question | Kind | all-cheap | routed | all-premium |");
  lines.push("|---|---|---|---|---|");
  for (const item of DATASET) {
    const cell = (arm: ArmName) => {
      const r = results.find((x) => x.arm === arm && x.itemId === item.id);
      if (!r) return "—";
      return r.error ? "⚠️" : r.correct ? "✅" : "❌";
    };
    lines.push(
      `| ${item.id} | ${item.kind} | ${cell("all-cheap")} | ${cell("routed")} | ${cell("all-premium")} |`,
    );
  }

  const report = lines.join("\n");
  writeFileSync("eval-results.md", report);
  console.log("\n" + report);
  console.log("\n📄 Saved to eval-results.md");
}

main(); // ← this line starts everything. Don't forget it!
