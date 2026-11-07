import "dotenv/config";
import { callModel } from "../llm/callModel.js";
import type { ModelId } from "../config/models.js";

const question = "Explain what a rate limiter is in 2 short sentences.";

// Groq appears TWICE on purpose: watch the 2nd call get faster.
const modelIds: ModelId[] = [
  "groq-cheap",
  "groq-cheap",
  "gemini-premium",
  "openrouter-free",
];

async function main() {
  for (const modelId of modelIds) {
    console.log(`\nCalling ${modelId}...`);
    try {
      const r = await callModel(modelId, [{ role: "user", content: question }]);
      console.log(`\n=== ${modelId} (${r.provider}) ===`);
      console.log("Answer :", r.output);
      console.log("Tokens :", r.inputTokens, "in /", r.outputTokens, "out");
      console.log("Cost   : $" + r.costUsd.toFixed(8));
      console.log("Latency:", r.latencyMs, "ms");
      console.log("Finish :", r.finishReason);
    } catch (err) {
      console.log(`\n=== ${modelId} FAILED ===`);
      console.log((err as Error).message);
    }
  }
}

main();
