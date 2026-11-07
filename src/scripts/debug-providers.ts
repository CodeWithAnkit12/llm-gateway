import "dotenv/config";
import OpenAI from "openai";

const gemini = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  timeout: 30_000,
  maxRetries: 0,
});

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  timeout: 30_000,
  maxRetries: 0,
});

// Send one tiny question and time it. Never crashes, always prints.
async function timeCall(client: OpenAI, label: string, model: string) {
  const start = Date.now();
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Say hi in 3 words." }],
      max_tokens: 500,
    });
    const text = res.choices[0]?.message?.content?.trim();
    console.log(
      `OK   [${label}] ${model}: ${Date.now() - start} ms -> "${text}"`,
    );
  } catch (err) {
    console.log(
      `FAIL [${label}] ${model}: ${Date.now() - start} ms -> ${(err as Error).message}`,
    );
  }
}

// Look up the PAID price of a model on OpenRouter (for shadow cost).
async function showOpenRouterPaidPrices(modelIds: string[]) {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  const json = (await res.json()) as {
    data: { id: string; pricing: { prompt: string; completion: string } }[];
  };
  for (const id of modelIds) {
    const m = json.data.find((x) => x.id === id);
    if (!m) {
      console.log(`PRICE ${id}: no paid version listed`);
      continue;
    }
    // OpenRouter gives price PER TOKEN as text, so multiply by 1,000,000
    const inPrice = Number(m.pricing.prompt) * 1_000_000;
    const outPrice = Number(m.pricing.completion) * 1_000_000;
    console.log(
      `PRICE ${id}: $${inPrice.toFixed(3)} in / $${outPrice.toFixed(3)} out per 1M`,
    );
  }
}

async function main() {
  console.log("\n--- Gemini candidates (30 s each, max) ---");
  await timeCall(gemini, "gemini", "gemini-3.8-flash"); // again, WITHOUT reasoning_effort
  await timeCall(gemini, "gemini", "gemini-3.6-flash");
  await timeCall(gemini, "gemini", "gemini-3-flash-preview");
  await timeCall(gemini, "gemini", "gemini-3.1-flash-lite");

  console.log("\n--- OpenRouter free candidates ---");
  await timeCall(openrouter, "openrouter", "google/gemma-4-26b-a4b-it:free");
  await timeCall(openrouter, "openrouter", "google/gemma-4-31b-it:free");

  console.log("\n--- Paid prices of the same models (for shadow cost) ---");
  await showOpenRouterPaidPrices([
    "google/gemma-4-26b-a4b-it",
    "google/gemma-4-31b-it",
  ]);
}

main();
