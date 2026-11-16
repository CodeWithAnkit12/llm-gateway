import "dotenv/config";
import { writeFileSync } from "node:fs";
import OpenAI from "openai";
import { DATASET, type EvalItem } from "./dataset.js";
import { route, type TaskType, type Priority } from "../router/router.js";

const client = new OpenAI({
  apiKey: process.env.TEST_KEY_GLOBEX ?? "",
  baseURL: "http://127.0.0.1:3000/v1",
  maxRetries: 0,
  timeout: 60_000,
});

// 15 simple + 4 hard = 19 questions → 19 premium calls (fits a 20/day quota)
const ITEMS: EvalItem[] = [
  ...DATASET.filter((d) => d.kind === "simple").slice(0, 15),
  ...DATASET.filter((d) => d.kind === "hard").slice(0, 4),
];

const PACE_MS = 13_000; // one question per 13 s → premium stays under 5 per minute
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ArmName = "all-cheap" | "routed" | "all-premium";

type Result = {
  arm: ArmName;
  itemId: string;
  kind: string;
  correct: boolean;
  costUsd: number;
  latencyMs: number;
  modelUsed: string;
  needsEscalation: boolean;
  escalated?: boolean;
  error?: string;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, idx)];
}

// One REAL call through the gateway: fixed model, no fallback, no cache
async function runOne(
  arm: ArmName,
  model: string,
  item: EvalItem,
): Promise<Result> {
  try {
    const res = await client.chat.completions.create(
      { model, messages: [{ role: "user", content: item.prompt }] },
      {
        headers: { ...item.headers, "x-cache": "bypass", "x-fallback": "off" },
      },
    );
    const answer = res.choices[0]?.message?.content ?? "";
    const finish = res.choices[0]?.finish_reason ?? "unknown";
    const gw = (res as unknown as { gateway: Record<string, unknown> }).gateway;

    if (gw.used_fallback) {
      throw new Error("fallback happened: is x-fallback supported in chat.ts?");
    }
    return {
      arm,
      itemId: item.id,
      kind: item.kind,
      correct: item.check(answer),
      costUsd: Number(gw.cost_usd ?? 0),
      latencyMs: Number(gw.latency_ms ?? 0),
      modelUsed: res.model,
      needsEscalation: answer.trim() === "" || finish === "length",
    };
  } catch (err) {
    return {
      arm,
      itemId: item.id,
      kind: item.kind,
      correct: false,
      costUsd: 0,
      latencyMs: 0,
      modelUsed: "—",
      needsEscalation: false,
      error: (err as Error).message,
    };
  }
}

// ROUTED, computed OFFLINE: apply the router's rules to choose between the two real answers
function routedFrom(item: EvalItem, cheap: Result, premium: Result): Result {
  const decision = route({
    requestedModel: "auto",
    messages: [{ role: "user", content: item.prompt }],
    taskType: item.headers?.["x-task-type"] as TaskType | undefined,
    priority:
      (item.headers?.["x-priority"] as Priority | undefined) ?? "normal",
  });

  if (decision.modelId === "gemini-premium") {
    return { ...premium, arm: "routed" };
  }
  // Router chose cheap. Would the safety net have escalated?
  if (!cheap.error && cheap.needsEscalation) {
    return {
      ...premium,
      arm: "routed",
      costUsd: cheap.costUsd + premium.costUsd, // paid for BOTH calls
      latencyMs: cheap.latencyMs + premium.latencyMs,
      escalated: true,
    };
  }
  return { ...cheap, arm: "routed" };
}

async function main() {
  console.log(
    `Starting eval v2: ${ITEMS.length} questions, 2 real calls each, routed computed offline\n`,
  );
  const results: Result[] = [];

  for (const [i, item] of ITEMS.entries()) {
    const cheap = await runOne("all-cheap", "groq-cheap", item);
    const premium = await runOne("all-premium", "gemini-premium", item);
    const routed = routedFrom(item, cheap, premium);
    results.push(cheap, premium, routed);

    const mark = (r: Result) => (r.error ? "⚠️" : r.correct ? "✅" : "❌");
    console.log(
      `[${i + 1}/${ITEMS.length}]`.padEnd(8),
      item.id,
      `cheap ${mark(cheap)}  premium ${mark(premium)}  routed ${mark(routed)} → ${routed.modelUsed}`,
      routed.escalated ? "(escalated)" : "",
      cheap.error ? `\n   cheap error: ${cheap.error}` : "",
      premium.error ? `\n   premium error: ${premium.error}` : "",
    );
    if (i < ITEMS.length - 1) await sleep(PACE_MS);
  }

  // ---------- Report ----------
  const arms: ArmName[] = ["all-cheap", "routed", "all-premium"];
  const simpleN = ITEMS.filter((d) => d.kind === "simple").length;
  const hardN = ITEMS.filter((d) => d.kind === "hard").length;
  const lines: string[] = [];

  lines.push(`# Eval results (${new Date().toISOString().slice(0, 10)})`);
  lines.push("");
  lines.push(
    `${ITEMS.length} questions (${simpleN} simple / ${hardN} hard). Cache off, fallback off. ` +
      `Cheap = Groq gpt-oss-20b, premium = Gemini 3 Flash. Routed is computed offline by applying ` +
      `the router's rules to the real cheap/premium answers. Shadow cost at list prices.`,
  );
  lines.push("");
  lines.push(
    "| Arm | Accuracy | Total cost | Cost per correct answer | p50 | p95 | Errors |",
  );
  lines.push("|---|---|---|---|---|---|---|");

  const summary: Record<string, { cost: number; correct: number; n: number }> =
    {};
  for (const arm of arms) {
    const rs = results.filter((r) => r.arm === arm);
    const correct = rs.filter((r) => r.correct).length;
    const cost = rs.reduce((s, r) => s + r.costUsd, 0);
    const lat = rs.filter((r) => !r.error).map((r) => r.latencyMs);
    summary[arm] = { cost, correct, n: rs.length };
    lines.push(
      `| ${arm} | ${((correct / rs.length) * 100).toFixed(0)}% (${correct}/${rs.length}) ` +
        `| $${cost.toFixed(6)} | ${correct > 0 ? "$" + (cost / correct).toFixed(7) : "—"} ` +
        `| ${percentile(lat, 50)} ms | ${percentile(lat, 95)} ms | ${rs.filter((r) => r.error).length} |`,
    );
  }

  const routed = summary["routed"];
  const premium = summary["all-premium"];
  const costCut = premium.cost > 0 ? (1 - routed.cost / premium.cost) * 100 : 0;
  const pcR = routed.correct > 0 ? routed.cost / routed.correct : 0;
  const pcP = premium.correct > 0 ? premium.cost / premium.correct : 0;
  const pcCut = pcP > 0 ? (1 - pcR / pcP) * 100 : 0;
  const premiumShare =
    (results.filter(
      (r) => r.arm === "routed" && r.modelUsed === "gemini-premium",
    ).length /
      ITEMS.length) *
    100;

  lines.push("");
  lines.push("## Headline (routed vs all-premium)");
  lines.push(`- Total cost: **${costCut.toFixed(1)}% lower**`);
  lines.push(`- Cost per correct answer: **${pcCut.toFixed(1)}% lower**`);
  lines.push(
    `- Accuracy: routed ${routed.correct}/${routed.n} vs premium ${premium.correct}/${premium.n}`,
  );
  lines.push(
    `- Routed sent **${premiumShare.toFixed(0)}%** of requests to the premium model`,
  );

  lines.push("");
  lines.push("## Per question");
  lines.push("| Question | Kind | all-cheap | routed | all-premium |");
  lines.push("|---|---|---|---|---|");
  for (const item of ITEMS) {
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

main();
