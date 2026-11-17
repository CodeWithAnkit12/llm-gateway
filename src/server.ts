import "dotenv/config"; // MUST stay the first import
import express from "express";
import { chatRouter } from "./routes/chat.js";
import { requireApiKey } from "./middleware/auth.js";
import { rateLimit } from "./middleware/rateLimit.js";

const app = express();

app.use(express.json({ limit: "1mb" }));

// Friendly landing response for anyone who opens the URL
app.get("/", (_req, res) => {
  res.json({
    name: "LLM Gateway",
    description: "Cost-aware routing across Groq, Gemini and OpenRouter (OpenAI-compatible API)",
    endpoints: {
      health: "GET /health",
      chat: "POST /v1/chat/completions (requires API key)",
    },
    source: "https://github.com/CodeWithAnkit12/llm-gateway",
  });
});

// Public: no key needed
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Everything under /v1 needs a key and respects the rate limit, IN THIS ORDER
app.use("/v1", requireApiKey, rateLimit);

app.use(chatRouter);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`LLM gateway running on http://localhost:${PORT}`);
});
