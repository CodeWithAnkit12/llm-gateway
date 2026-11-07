import OpenAI from "openai";

const gateway = new OpenAI({
  apiKey: "not-needed-yet",
  baseURL: "http://localhost:3000/v1",
  maxRetries: 0, // IMPORTANT: the gateway already retries; don't retry twice
});

async function ask(
  label: string,
  content: string,
  headers: Record<string, string> = {},
) {
  try {
    const res = await gateway.chat.completions.create(
      { model: "auto", messages: [{ role: "user", content }] },
      { headers },
    );
    const gw = (res as unknown as { gateway: Record<string, unknown> }).gateway;
    console.log(`\n[${label}]`);
    console.log(`  final model : ${res.model}`);
    console.log(`  reason      : ${gw.route_reason}`);
    console.log(`  fallback    : ${gw.used_fallback}`);
    console.log(`  attempts    :`, gw.attempts);
    console.log(`  cost        : $${gw.cost_usd}`);
    console.log(`  latency     : ${gw.latency_ms} ms`);
  } catch (err) {
    console.log(`\n[${label}] FAILED: ${(err as Error).message}`);
  }
}

async function main() {
  await ask("1. normal day", "What is Redis, in one sentence?");
  await ask("2. Groq is down", "What is Redis, in one sentence?", {
    "x-simulate-outage": "groq",
  });
  await ask(
    "3. Gemini is down (high priority)",
    "What is Redis, in one sentence?",
    {
      "x-priority": "high",
      "x-simulate-outage": "gemini",
    },
  );
}

main();
