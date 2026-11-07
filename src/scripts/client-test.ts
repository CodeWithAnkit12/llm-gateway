import "dotenv/config";
import OpenAI from "openai";

const BASE_URL = "http://localhost:3000/v1";

async function ask(label: string, apiKey: string) {
  const client = new OpenAI({ apiKey, baseURL: BASE_URL, maxRetries: 0 });
  try {
    const res = await client.chat.completions.create({
      model: "auto",
      messages: [{ role: "user", content: "Say hi in 3 words." }],
    });
    console.log(
      `[${label}] OK -> ${res.model}: ${res.choices[0]?.message?.content}`,
    );
  } catch (err) {
    console.log(`[${label}] ${(err as Error).message}`);
  }
}

async function main() {
  const acme = process.env.TEST_KEY_ACME ?? "";
  const globex = process.env.TEST_KEY_GLOBEX ?? "";

  console.log("\n--- 1. Auth ---");
  // No key at all (plain fetch, because the OpenAI SDK refuses to send without a key)
  const r = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  console.log(`[no key] ${r.status}`, await r.json());
  await ask("wrong key", "gw_this_is_fake");

  console.log("\n--- 2. Rate limit: acme allows 3/min, we send 5 ---");
  for (let i = 1; i <= 5; i++) {
    await ask(`acme #${i}`, acme);
  }

  console.log("\n--- 3. Other tenant is NOT affected ---");
  await ask("globex", globex);
}

main();
