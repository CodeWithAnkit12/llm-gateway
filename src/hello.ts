import "dotenv/config";
import OpenAI from "openai";

// 1. Read the secret key from .env
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  throw new Error("GROQ_API_KEY is missing. Did you create the .env file?");
}

// 2. Create a client. Same OpenAI library, but pointed at Groq's address.
const groq = new OpenAI({
  apiKey,
  baseURL: "https://api.groq.com/openai/v1",
});

async function main() {
  const start = Date.now(); // start the stopwatch

  // 3. Ask the model a question
  const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant. Answer in 2 short sentences.",
      },
      { role: "user", content: "What is an API gateway?" },
    ],
    temperature: 0.3,
    max_completion_tokens: 400,
    reasoning_effort: "low",
  });

  const latencyMs = Date.now() - start; // stop the stopwatch

  // 4. Print what came back
  console.log("Answer :", response.choices[0].message.content);
  console.log("Model  :", response.model);
  console.log("Tokens :", response.usage);
  console.log("Latency:", latencyMs, "ms");
}

main().catch((err) => {
  console.error("Something went wrong:", err.message);
});
