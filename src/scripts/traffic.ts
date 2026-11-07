import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.TEST_KEY_GLOBEX ?? "",
  baseURL: "http://localhost:3000/v1",
  maxRetries: 0,
});

type Job = { content: string; headers?: Record<string, string> };

const jobs: Job[] = [
  { content: "What is DNS, in one sentence?" },
  { content: "What is HTTP, in one sentence?" },
  { content: "What is JSON, in one sentence?" },
  { content: "What is a load balancer, in one sentence?" },
  { content: "What is a database index, in one sentence?" },
  { content: "What is DNS, in one sentence?" }, // repeat → cache hit
  { content: "What is HTTP, in one sentence?" }, // repeat → cache hit
  { content: "What is JSON, in one sentence?" }, // repeat → cache hit
  {
    content:
      "Write a TypeScript function that checks if a string is a palindrome.",
    headers: { "x-task-type": "code" },
  },
  {
    content: "Explain step by step why binary search is O(log n).",
    headers: { "x-task-type": "reasoning" },
  },
  {
    content: "Summarize what Kubernetes does in 2 sentences.",
    headers: { "x-priority": "high" },
  },
  { content: "What does this print?\n```js\nconsole.log(typeof null)\n```" },
];

async function main() {
  for (const [i, job] of jobs.entries()) {
    try {
      const res = await client.chat.completions.create(
        { model: "auto", messages: [{ role: "user", content: job.content }] },
        { headers: job.headers },
      );
      const gw = (res as unknown as { gateway: Record<string, unknown> })
        .gateway;
      console.log(
        `#${i + 1}`.padEnd(4),
        String(gw.cache).padEnd(7),
        res.model.padEnd(16),
        `${gw.latency_ms} ms`,
      );
    } catch (err) {
      console.log(`#${i + 1} FAILED: ${(err as Error).message}`);
    }
  }
}

main();
