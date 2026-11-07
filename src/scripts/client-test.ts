import "dotenv/config";
import OpenAI from "openai";

const BASE_URL = "http://localhost:3000/v1";

async function ask(
  label: string,
  apiKey: string,
  content: string,
  headers: Record<string, string> = {},
) {
  const client = new OpenAI({ apiKey, baseURL: BASE_URL, maxRetries: 0 });
  try {
    const res = await client.chat.completions.create(
      { model: "auto", messages: [{ role: "user", content }] },
      { headers },
    );
    const gw = (res as unknown as { gateway: Record<string, unknown> }).gateway;
    console.log(`\n[${label}]`);
    console.log(`  cache   : ${gw.cache}`);
    console.log(`  model   : ${res.model}`);
    console.log(`  cost    : $${gw.cost_usd}   saved: $${gw.saved_usd}`);
    console.log(`  latency : ${gw.latency_ms} ms`);
  } catch (err) {
    console.log(`\n[${label}] ${(err as Error).message}`);
  }
}

async function main() {
  const acme = process.env.TEST_KEY_ACME ?? "";
  const globex = process.env.TEST_KEY_GLOBEX ?? "";
  const q = "What is a CDN, in one sentence?";

  await ask("1. first time (expect MISS)", globex, q);
  await ask("2. same question (expect HIT)", globex, q);
  await ask("3. bypass header (expect BYPASS)", globex, q, {
    "x-cache": "bypass",
  });
  await ask(
    "4. one extra space (expect MISS)",
    globex,
    "What is a CDN,  in one sentence?",
  );
  await ask("5. other tenant, same question (expect MISS)", acme, q);
}

main();
