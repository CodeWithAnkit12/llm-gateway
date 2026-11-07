import OpenAI from "openai";

const gateway = new OpenAI({
  apiKey: "not-needed-yet",
  baseURL: "http://localhost:3000/v1",
});

async function ask(
  label: string,
  content: string,
  headers: Record<string, string> = {},
  maxTokens?: number,
) {
  try {
    const res = await gateway.chat.completions.create(
      {
        model: "auto",
        messages: [{ role: "user", content }],
        max_tokens: maxTokens,
      },
      { headers }, // routing hints go in HEADERS
    );
    const gw = (res as unknown as { gateway: Record<string, unknown> }).gateway;
    console.log(`\n[${label}]`);
    console.log(`  model     : ${res.model}`);
    console.log(`  reason    : ${gw.route_reason}`);
    console.log(`  escalated : ${gw.escalated}`);
    console.log(`  cost      : $${gw.cost_usd}`);
    console.log(`  latency   : ${gw.latency_ms} ms`);
  } catch (err) {
    console.log(`\n[${label}] FAILED: ${(err as Error).message}`);
  }
}

async function main() {
  await ask("1. simple question", "What is Redis, in one sentence?");
  await ask("2. high priority", "What is Redis, in one sentence?", {
    "x-priority": "high",
  });
  await ask(
    "3. code task",
    "Write a TypeScript function that reverses a string.",
    { "x-task-type": "code" },
  );
  await ask(
    "4. code in message",
    "What does this do?\n```js\nconsole.log([1,2,3].map(x => x * 2))\n```",
  );
  await ask("5. escalation demo", "Explain how the internet works.", {}, 20); // tiny limit → cut off

  // Bad request: still rejected?
  try {
    await gateway.chat.completions.create({ model: "auto", messages: [] });
  } catch (err) {
    console.log(
      "\n[6. bad request] correctly rejected:",
      (err as Error).message,
    );
  }
}

main();
